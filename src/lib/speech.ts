/** Spoken German through the browser's built-in voices (Web Speech API). */

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

/**
 * Without a German voice the browser would read German with an English one,
 * which teaches the wrong sounds. Silence is better; the layout says why.
 */
export function speak(text: string, rate = 0.9): void {
  if (germanAvailable() === false) return;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance(text, rate));
}

export interface SpokenLine {
  speaker?: string;
  text: string;
}

/**
 * Speak a script line by line, giving each speaker a voice of their own.
 * Calls `onEnd` when the last line has finished (not when it is stopped).
 */
export function speakLines(lines: readonly SpokenLine[], rate = 0.9, onEnd?: () => void): void {
  if (germanAvailable() === false) {
    onEnd?.();
    return;
  }
  window.speechSynthesis.cancel();
  const speakers = [...new Set(lines.map((line) => line.speaker ?? ''))];
  lines.forEach((line, index) => {
    const spoken = utterance(line.text, rate, speakers.indexOf(line.speaker ?? ''));
    if (index === lines.length - 1) spoken.onend = () => onEnd?.();
    window.speechSynthesis.speak(spoken);
  });
}

export function stopSpeaking(): void {
  if (speechSupported()) window.speechSynthesis.cancel();
}
