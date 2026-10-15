"""Record the German of the Speak section and the chapter vocabulary as MP3 clips.

The app plays a clip when one exists and falls back to the browser's voice when
not (src/lib/speech.ts). Clips are named by a hash of their text, so this script
only has to be run again when German text was added or changed. It then makes
the missing clips, deletes the ones nothing refers to any more, and rewrites
public/audio/index.json.

It runs from its own Python environment, outside the repository:

    py -3.12 -m venv ..\\venv_audio
    ..\\venv_audio\\Scripts\\pip install piper-tts lameenc pyyaml
    ..\\venv_audio\\Scripts\\python -m piper.download_voices de_DE-thorsten-high --data-dir ..\\venv_audio\\voices
    ..\\venv_audio\\Scripts\\python scripts\\make_audio.py

Each clip is recorded once, in one of two voices. In conversations and missions
every person has a voice that fits them (VOICE_OF) and the learner's lines take
the other one; everything else is shared out between the two by its text.
(--voice-b "" leaves the second voice out, and voice "a" reads everything.)

The default voices are Microsoft's neural voices, Katja (a) and Conrad (b),
through the Azure Speech service. They need a Speech resource; its free tier
covers the course many times over. Set the key and region first:

    $env:AZURE_SPEECH_KEY = "<key>"; $env:AZURE_SPEECH_REGION = "<region, e.g. westeurope>"

A voice is "azure:<voice name>", or a Piper model file, optionally with
"#<speaker number>". Piper runs offline, but of its German voices only
thorsten-high passed the --check below, and learners found it unclear.

Clips are only made when missing, so to change a voice, delete its folder first.

    --shard K/N   record only every Nth clip, so that N copies of the script can share the work;
                  run once more without it afterwards to tidy up and write the index
    --check       transcribe every clip back and list the ones that differ from their text
                  (needs: pip install faster-whisper)
    --self-test   print the clip names of three reference texts, as in tests/speaking.test.ts
"""
import argparse
import json
import sys
import unicodedata
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "src" / "content"
OUT = ROOT / "public" / "audio"
VOICES = ROOT.parent / "venv_audio" / "voices"


def clip_key(text: str) -> str:
    """FNV-1a over the UTF-8 bytes, as eight hex digits. Must match clipKey() in src/lib/speech.ts."""
    value = 0x811C9DC5
    for byte in unicodedata.normalize("NFC", text).strip().encode("utf-8"):
        value = ((value ^ byte) * 0x01000193) & 0xFFFFFFFF
    return f"{value:08x}"


def load(path: Path):
    return yaml.safe_load(path.read_text(encoding="utf-8"))


# The people in conversations and missions, each with a voice that fits: "a" is Katja, "b" is Conrad.
# The learner's own lines take the other voice, so a dialogue always has two different voices.
VOICE_OF = {
    "Frau Brandt": "a", "Frau Dr. Keller": "a", "Friseurin": "a", "Kollegin": "a", "Nachbarin": "a",
    "Passantin": "a", "Reisende": "a", "Sprechstundenhilfe": "a", "Verkäuferin": "a",
    "Apotheker": "b", "Dr. Yilmaz": "b", "Kellner": "b", "Kurspartner": "b", "Mitarbeiter": "b",
}
OTHER = {"a": "b", "b": "a"}


def voice_of(speaker: str) -> str:
    return VOICE_OF.get(speaker) or sys.exit(f"New speaker {speaker!r}: give them a voice in VOICE_OF in scripts/make_audio.py.")


def texts() -> dict[str, str]:
    """Every German string to record, with the voice that says it ("a" or "b")."""
    voices: dict[str, str] = {}
    say = lambda text, voice: voices.setdefault(unicodedata.normalize("NFC", text).strip(), voice)

    # Dialogue first: a line someone says in a scene keeps that person's voice everywhere.
    for path in sorted((CONTENT / "speaking" / "conversations").glob("*.yaml")):
        talk = load(path)
        partner = voice_of(talk["partner"])
        for line in talk["lines"]:
            say(line["text"], partner if line["who"] == "partner" else OTHER[partner])

    for path in sorted((CONTENT / "missions").glob("*.yaml")):
        mission = load(path)
        speakers = [line["speaker"] for step in mission["steps"] for line in step.get("lines", [])]
        you = OTHER[voice_of(speakers[0])]
        for line in [*(line for step in mission["steps"] for line in step.get("lines", [])), *mission.get("outro", [])]:
            say(line["text"], voice_of(line["speaker"]))
        for step in mission["steps"]:
            task = step["task"]
            if task.get("stimulus", {}).get("kind") == "audio":
                for line in task["stimulus"]["lines"]:
                    say(line["text"], voice_of(line["speaker"]) if line.get("speaker") else OTHER[you])
            if "you" in step:
                say(step["you"]["text"], you)
            if task["type"] == "speaking-task":
                say(task["sample"], you)

    # Everything else is shared out by its text: a fixed mix of both voices, the same on every visit.
    rest: set[str] = set()
    for path in sorted((CONTENT / "speaking" / "sounds").glob("*.yaml")):
        sound = load(path)
        rest.update(word["de"] for word in sound["words"])
        rest.update(word["de"] for pair in sound["pairs"] for word in pair)
        rest.add(sound["sentence"]["de"])
    for path in sorted((CONTENT / "speaking" / "packs").glob("*.yaml")):
        rest.update(phrase["de"] for phrase in load(path)["phrases"])
    for path in sorted((CONTENT / "missions").glob("*.yaml")):
        rest.update(phrase["de"] for phrase in load(path)["phrases"])
    for path in sorted((CONTENT / "vocab").glob("*/*.yaml")):
        for item in load(path)["items"]:
            # The headword as the vocabulary list shows it, and its example sentence.
            rest.add(f"{item['article']} {item['de']}" if item.get("article") else item["de"])
            if item.get("example"):
                rest.add(item["example"])
    for text in rest:
        say(text, "ab"[int(clip_key(text), 16) % 2])
    return voices


class AzureVoice:
    """A Microsoft neural voice from the Azure Speech REST API, which returns MP3 itself."""

    def __init__(self, name: str):
        import os

        self.name = name
        self.key = os.environ.get("AZURE_SPEECH_KEY") or sys.exit("Set AZURE_SPEECH_KEY (and AZURE_SPEECH_REGION) first.")
        self.url = f"https://{os.environ.get('AZURE_SPEECH_REGION', 'westeurope')}.tts.speech.microsoft.com/cognitiveservices/v1"

    def mp3(self, text: str) -> bytes:
        import time
        import urllib.error
        import urllib.request
        from xml.sax.saxutils import escape

        ssml = f"<speak version='1.0' xml:lang='de-DE'><voice name='{self.name}'>{escape(text)}</voice></speak>"
        request = urllib.request.Request(
            self.url,
            data=ssml.encode("utf-8"),
            headers={
                "Ocp-Apim-Subscription-Key": self.key,
                "Content-Type": "application/ssml+xml",
                "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
                "User-Agent": "deutschheft-make-audio",
            },
        )
        for _ in range(10):
            try:
                with urllib.request.urlopen(request, timeout=60) as response:
                    return response.read()
            except urllib.error.HTTPError as error:
                # The free tier allows about 20 requests a minute; wait as told and go on.
                if error.code != 429 and error.code < 500:
                    sys.exit(f"Azure answered {error.code} for {text!r}: {error.read()[:300]!r}")
                time.sleep(int(error.headers.get("Retry-After") or 15))
        sys.exit(f"Azure kept refusing {text!r}; run the script again later, it carries on where it stopped.")


def open_voice(spec: str):
    return AzureVoice(spec.removeprefix("azure:")) if spec.startswith("azure:") else Voice(spec)


class Voice:
    def __init__(self, spec: str):
        from piper import PiperVoice, SynthesisConfig

        path, _, speaker = spec.partition("#")
        self.voice = PiperVoice.load(path)
        self.config = SynthesisConfig(speaker_id=int(speaker)) if speaker else None
        # The smaller voices know the ch of "ich" only as the single character ç, while the
        # phonemiser writes it as c plus a combining cedilla. Left alone they drop the sound.
        symbols = json.loads(Path(path + ".json").read_text(encoding="utf-8"))["phoneme_id_map"]
        self.compose = "̧" not in symbols

    def pcm(self, text: str) -> tuple[bytes, int]:
        if not self.compose:
            chunks = list(self.voice.synthesize(text, syn_config=self.config))
            return b"".join(chunk.audio_int16_bytes for chunk in chunks), chunks[0].sample_rate

        import numpy as np

        rate = self.voice.config.sample_rate
        parts = []
        for sentence in self.voice.phonemize(text):
            ids = self.voice.phonemes_to_ids(list(unicodedata.normalize("NFC", "".join(sentence))))
            audio = self.voice.phoneme_ids_to_audio(ids, self.config)
            parts.append(np.asarray(audio[0] if isinstance(audio, tuple) else audio, dtype=np.float32).reshape(-1))
            parts.append(np.zeros(int(rate * 0.2), dtype=np.float32))
        samples = np.concatenate(parts[:-1])
        # Same loudness for every clip, whatever scale the model returned.
        samples = samples / max(float(np.abs(samples).max()), 1e-9) * 0.9
        return (samples * 32767).astype(np.int16).tobytes(), rate

    def mp3(self, text: str) -> bytes:
        import lameenc

        pcm, rate = self.pcm(text)
        encoder = lameenc.Encoder()
        encoder.set_bit_rate(40)
        encoder.set_in_sample_rate(rate)
        encoder.set_channels(1)
        encoder.set_quality(2)
        return bytes(encoder.encode(pcm)) + bytes(encoder.flush())


def record(folder: Path, wanted: set[str], spec: str, shard: tuple[int, int] | None) -> list[str]:
    folder.mkdir(parents=True, exist_ok=True)
    by_key: dict[str, str] = {}
    for text in sorted(wanted):
        key = clip_key(text)
        if by_key.setdefault(key, text) != text:
            sys.exit(f"Two texts share the clip name {key}: {by_key[key]!r} and {text!r}. Reword one of them.")

    missing = [key for key in by_key if not (folder / f"{key}.mp3").exists()]
    if shard:
        # One of several processes working side by side: take every nth clip and leave the tidying to a final run.
        missing = [key for key in missing if int(key, 16) % shard[1] == shard[0]]
    if missing:
        voice = open_voice(spec)
        for count, key in enumerate(missing, 1):
            (folder / f"{key}.mp3").write_bytes(voice.mp3(by_key[key]))
            if count % 100 == 0 or count == len(missing):
                print(f"  {folder.name}: {count} of {len(missing)} recorded", flush=True)

    if shard:
        return []
    stale = [path for path in folder.glob("*.mp3") if path.stem not in by_key]
    for path in stale:
        path.unlink()
    size = sum(path.stat().st_size for path in folder.glob("*.mp3")) / 1e6
    print(f"voice {folder.name}: {len(by_key)} clips ({len(missing)} new, {len(stale)} removed), {size:.1f} MB")
    return sorted(by_key)


def check(folder: Path, wanted: set[str], report: Path) -> None:
    """Transcribe each clip and list those whose words differ from the text. A machine's ear, not a judge of quality."""
    import re

    from faster_whisper import WhisperModel

    model = WhisperModel("small", device="cpu", compute_type="int8")
    words = lambda text: re.sub(r"[^a-zäöüß0-9 ]", " ", text.lower()).split()
    lines = []
    # A recogniser needs context: single words and short phrases are misheard too often to tell anything.
    wanted = {text for text in wanted if len(text.split()) >= 4}
    for count, text in enumerate(sorted(wanted), 1):
        segments, _ = model.transcribe(str(folder / f"{clip_key(text)}.mp3"), language="de", beam_size=3)
        heard = " ".join(segment.text for segment in segments).strip()
        if words(heard) != words(text):
            lines.append(f"{folder.name}/{clip_key(text)}.mp3\n  text:  {text}\n  heard: {heard}\n")
        if count % 200 == 0:
            print(f"  {folder.name}: {count} of {len(wanted)} checked", flush=True)
    report.write_text("\n".join(lines), encoding="utf-8")
    print(f"voice {folder.name}: {len(lines)} of {len(wanted)} sentences heard differently, listed in {report}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--voice-a", default="azure:de-DE-KatjaNeural", help=f"e.g. {VOICES / 'de_DE-thorsten-high.onnx'} for Piper")
    parser.add_argument("--voice-b", default="azure:de-DE-ConradNeural", help='the other speaker in conversations; "" for none')
    parser.add_argument("--shard", help="K/N: record only every Nth clip, for N processes side by side. Finish with a run without it.")
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--only", default="ab", help="with --check: which voices to check, e.g. b")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()

    if args.self_test:
        for text in ["Tür", "Guten Morgen! Was darf es sein?", "  Straße "]:
            print(f"{clip_key(text)}  {text!r}")
        return

    voices = texts()
    if not args.voice_b:
        voices = dict.fromkeys(voices, "a")
    wanted_by = {name: {text for text, voice in voices.items() if voice == name} for name in "ab"}
    if args.check:
        for name, wanted in wanted_by.items():
            if name in args.only:
                check(OUT / name, wanted, ROOT.parent / "venv_audio" / f"check-{name}.txt")
        return

    shard = tuple(int(part) for part in args.shard.split("/")) if args.shard else None
    # Each clip exists in one voice only; the app plays it from whichever folder has it.
    index = {name: record(OUT / name, wanted_by[name], spec, shard) for name, spec in (("a", args.voice_a), ("b", args.voice_b))}
    if not shard:
        (OUT / "index.json").write_text(json.dumps(index, separators=(",", ":")) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
