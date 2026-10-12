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

Voice "a" reads everything. An optional voice "b" (--voice-b) is the second
speaker in conversations; without it the main voice speaks both parts. A voice
is a model file, optionally with "#<speaker number>" for a model that holds
several speakers.

Of the German Piper voices only thorsten-high passed the --check below. The
multi-speaker "mls" voice came back as nonsense, and the smaller voices still
blur the ch of "ich" and "möchten" even with the repair in Voice.pcm. Listen
before choosing another voice.

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


def texts() -> tuple[set[str], set[str]]:
    """Every German string to record: (for voice a, for voice b)."""
    everything: set[str] = set()
    dialogue: set[str] = set()

    for path in sorted((CONTENT / "speaking" / "sounds").glob("*.yaml")):
        sound = load(path)
        everything.update(word["de"] for word in sound["words"])
        everything.update(word["de"] for pair in sound["pairs"] for word in pair)
        everything.add(sound["sentence"]["de"])

    for path in sorted((CONTENT / "speaking" / "packs").glob("*.yaml")):
        everything.update(phrase["de"] for phrase in load(path)["phrases"])

    for path in sorted((CONTENT / "speaking" / "conversations").glob("*.yaml")):
        dialogue.update(line["text"] for line in load(path)["lines"])

    for path in sorted((CONTENT / "missions").glob("*.yaml")):
        mission = load(path)
        everything.update(phrase["de"] for phrase in mission["phrases"])
        dialogue.update(line["text"] for line in mission.get("outro", []))
        for step in mission["steps"]:
            dialogue.update(line["text"] for line in step.get("lines", []))
            if "you" in step:
                dialogue.add(step["you"]["text"])
            task = step["task"]
            if task.get("stimulus", {}).get("kind") == "audio":
                dialogue.update(line["text"] for line in task["stimulus"]["lines"])
            if task["type"] == "speaking-task":
                dialogue.add(task["sample"])

    for path in sorted((CONTENT / "vocab").glob("*/*.yaml")):
        for item in load(path)["items"]:
            # The headword as the vocabulary list shows it, and its example sentence.
            everything.add(f"{item['article']} {item['de']}" if item.get("article") else item["de"])
            if item.get("example"):
                everything.add(item["example"])

    clean = lambda group: {unicodedata.normalize("NFC", text).strip() for text in group}
    return clean(everything | dialogue), clean(dialogue)


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
        voice = Voice(spec)
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
    parser.add_argument("--voice-a", default=str(VOICES / "de_DE-thorsten-high.onnx"))
    parser.add_argument("--voice-b", default="", help="a second voice for the other speaker in conversations; none by default")
    parser.add_argument("--shard", help="K/N: record only every Nth clip, for N processes side by side. Finish with a run without it.")
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--only", default="ab", help="with --check: which voices to check, e.g. b")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()

    if args.self_test:
        for text in ["Tür", "Guten Morgen! Was darf es sein?", "  Straße "]:
            print(f"{clip_key(text)}  {text!r}")
        return

    everything, dialogue = texts()
    if args.check:
        for name, wanted in (("a", everything), ("b", dialogue)):
            if name in args.only:
                check(OUT / name, wanted, ROOT.parent / "venv_audio" / f"check-{name}.txt")
        return

    shard = tuple(int(part) for part in args.shard.split("/")) if args.shard else None
    # Without a second voice the folder is emptied, and the app uses the main voice for both speakers.
    second = record(OUT / "b", dialogue if args.voice_b else set(), args.voice_b, shard)
    index = {"a": record(OUT / "a", everything, args.voice_a, shard), "b": second}
    if not shard:
        (OUT / "index.json").write_text(json.dumps(index, separators=(",", ":")) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
