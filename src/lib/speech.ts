import { url } from './url';

/**
 * Spoken German: a recorded clip where one exists, otherwise the browser's
 * built-in German voice (Web Speech API).
 */

export interface VoiceInfo {
  name: string;
  lang: string;
}

const isGerman = (voice: VoiceInfo) => voice.lang.toLowerCase().startsWith('de');
const fromGermany = (voice: VoiceInfo) => voice.lang.toLowerCase().replace('_', '-') === 'de-de';

/**
 * How well a voice suits someone learning from it; lower is better. Browsers
 * list their voices in no useful order, and the differences are large:
 *
 * - A "multilingual" voice guesses the language of every phrase, so a short
 *   German word can come out with English sounds. It goes last.
 * - A neural voice ("Natural", "Online") sounds like a person.
 * - Google's voice is clear. The old system voices are correct but robotic.
 */
function rank(voice: VoiceInfo): number {
  const quality = /multilingual|mehrsprachig/i.test(voice.name)
    ? 3
    : /natural|neural|online/i.test(voice.name)
      ? 0
      : /google/i.test(voice.name)
        ? 1
        : 2;
  return quality * 2 + (fromGermany(voice) ? 0 : 1);
}

/**
 * The German voices among `voices`, best first. Voices of equal rank keep the
 * browser's order. `preferred`, the name of a voice the learner chose, goes to
 * the front if this browser has it.
 */
export function rankGermanVoices<T extends VoiceInfo>(voices: readonly T[], preferred?: string): T[] {
  const ranked = voices.filter(isGerman).sort((a, b) => rank(a) - rank(b));
  const chosen = ranked.find((voice) => voice.name === preferred);
  return chosen ? [chosen, ...ranked.filter((voice) => voice !== chosen)] : ranked;
}

/**
 * The voices to share out among the speakers of a dialogue: only those as good
 * as the first, so that no speaker is handed a worse voice just to sound different.
 */
export function speakerVoices<T extends VoiceInfo>(ranked: readonly T[]): T[] {
  return ranked.filter((voice) => rank(voice) === rank(ranked[0]!));
}

let preferred: string | undefined;

/** The voice chosen in Settings, by name. The layout passes it on whenever the setting changes. */
export function setPreferredVoice(name: string | undefined): void {
  preferred = name;
}

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/** Every German voice this browser offers, best first. */
export function germanVoices(): SpeechSynthesisVoice[] {
  return speechSupported() ? rankGermanVoices(window.speechSynthesis.getVoices(), preferred) : [];
}

/**
 * Whether German can be spoken here. `undefined` while the browser has not
 * reported its voices yet (some load them late, some never list them).
 */
export function germanAvailable(): boolean | undefined {
  if (!speechSupported()) return false;
  if (window.speechSynthesis.getVoices().length === 0) return undefined;
  return germanVoices().length > 0;
}

function utterance(text: string, rate: number, speakerIndex = 0): SpeechSynthesisUtterance {
  const result = new SpeechSynthesisUtterance(text);
  result.lang = 'de-DE';
  result.rate = rate;
  const voices = speakerVoices(germanVoices());
  if (voices.length > 0) result.voice = voices[speakerIndex % voices.length]!;
  // With a single good voice, pitch is the only way to tell speakers apart.
  if (voices.length < 2) result.pitch = [1, 0.75, 1.3][speakerIndex % 3]!;
  return result;
}

// --- Recorded clips ------------------------------------------------------------

/**
 * Name of the recorded clip for a text: FNV-1a over its UTF-8 bytes, as eight
 * hex digits. scripts/make_audio.py names the files with the same function.
 */
export function clipKey(text: string): string {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text.normalize('NFC').trim())) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Which clips exist, per recorded voice ("a" Katja, "b" Conrad). scripts/make_audio.py records
 * each text in one voice only, matched to the person who says it, so a clip is in one folder.
 */
let clips: Promise<Record<string, Set<string>>> | undefined;

function loadClips(): Promise<Record<string, Set<string>>> {
  clips ??= fetch(url('audio/index.json'))
    .then((response) => (response.ok ? response.json() : {}))
    .then((index: Record<string, string[]>) => Object.fromEntries(Object.entries(index).map(([voice, keys]) => [voice, new Set(keys)])))
    .catch(() => ({}));
  return clips;
}

/** Address of the clip for a text. Should a text ever be in both voices, every other speaker gets "b". */
async function clipFor(text: string, speakerIndex: number): Promise<string | undefined> {
  const index = await loadClips();
  const key = clipKey(text);
  const order = speakerIndex % 2 === 1 ? ['b', 'a'] : ['a', 'b'];
  const voice = order.find((candidate) => index[candidate]?.has(key));
  return voice && url(`audio/${voice}/${key}.mp3`);
}

const player = typeof Audio === 'undefined' ? undefined : new Audio();
/** Clips already fetched, as local object addresses. */
const fetched = new Map<string, string>();

/**
 * Play one clip to its end. It is fetched as an ordinary request instead of
 * being streamed by the audio element, so the offline cache can keep it.
 */
async function playClip(src: string, rate: number): Promise<void> {
  if (!player) return;
  let local = fetched.get(src);
  if (!local) {
    const response = await fetch(src).catch(() => undefined);
    if (!response?.ok) return;
    local = URL.createObjectURL(await response.blob());
    fetched.set(src, local);
  }
  await new Promise<void>((resolve) => {
    player.onended = player.onerror = player.onpause = () => resolve();
    player.src = local;
    // Clips are recorded at a natural pace, which is what the default setting of 0.9 stands for.
    player.playbackRate = Math.min(1.4, Math.max(0.6, rate / 0.9));
    player.play().catch(() => resolve());
  });
}

function voiceLine(text: string, rate: number, speakerIndex: number): Promise<void> {
  return new Promise((resolve) => {
    const spoken = utterance(text, rate, speakerIndex);
    spoken.onend = spoken.onerror = () => resolve();
    window.speechSynthesis.speak(spoken);
  });
}

/** Goes up whenever something new starts or everything is stopped, so an older script knows to give way. */
let turn = 0;

function silence(): void {
  turn++;
  player?.pause();
  if (speechSupported()) window.speechSynthesis.cancel();
}

/**
 * Say the lines one after another. A line with a recorded clip plays the clip;
 * otherwise the browser's German voice reads it. Without either, the line is
 * skipped: an English voice reading German would teach the wrong sounds.
 * Resolves to whether it ran to the end without being interrupted.
 */
async function play(lines: readonly SpokenLine[], rate: number, firstVoice = 0): Promise<boolean> {
  silence();
  const mine = turn;
  const speakers = [...new Set(lines.map((line) => line.speaker ?? ''))];
  for (const line of lines) {
    const speaker = firstVoice + speakers.indexOf(line.speaker ?? '');
    const src = await clipFor(line.text, speaker);
    if (mine !== turn) return false;
    if (src) await playClip(src, rate);
    else if (germanAvailable() !== false) await voiceLine(line.text, rate, speaker);
    if (mine !== turn) return false;
  }
  return true;
}

/** Say one text. `voice` 1 asks for the second recorded voice, as for the other speaker of a dialogue. */
export function speak(text: string, rate = 0.9, voice = 0): void {
  void play([{ text }], rate, voice);
}

export interface SpokenLine {
  speaker?: string;
  text: string;
}

/**
 * Speak a script line by line, giving each speaker a voice of their own.
 * Calls `onEnd` when the last line has finished (not when it is stopped).
 */
export function speakLines(lines: readonly SpokenLine[], rate = 0.9, onEnd?: () => void, firstVoice = 0): void {
  void play(lines, rate, firstVoice).then((finished) => finished && onEnd?.());
}

export function stopSpeaking(): void {
  silence();
}