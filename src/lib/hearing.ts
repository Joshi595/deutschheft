import { normalize, transliterate } from './grading/normalize';

/**
 * "What it heard": the browser's own speech recognition writes down what the
 * learner said, and the app marks which words of the model sentence it found.
 * It is a rough check of whether a machine understood, not a pronunciation
 * score, so it only ever suggests a rating.
 */

/** The small numbers a recogniser tends to write as digits. */
const DIGITS: Record<string, string> = {
  '0': 'null', '1': 'eins', '2': 'zwei', '3': 'drei', '4': 'vier', '5': 'fünf', '6': 'sechs',
  '7': 'sieben', '8': 'acht', '9': 'neun', '10': 'zehn', '11': 'elf', '12': 'zwölf',
};

/** Words in the form they are compared in: case, punctuation and umlaut spelling do not count. */
function tokens(text: string): string[] {
  // ponytail: only 0-12 and the euro sign are spelled out; larger numbers written as digits
  // count as missed. Add a number-to-words routine if that turns out to matter.
  return normalize(text.replace(/€/g, ' euro '))
    .split(' ')
    .filter(Boolean)
    .map((word) => transliterate(DIGITS[word] ?? word));
}

export interface SpokenMatch {
  /** The model sentence word by word, each marked as heard or not. */
  words: { text: string; heard: boolean }[];
  matched: number;
  total: number;
}

/** Which words of `target` appear in `heard`, in order (longest common subsequence). */
export function compareSpoken(target: string, heard: string): SpokenMatch {
  const shown = target.split(/\s+/).filter((word) => tokens(word).length > 0);
  const want = shown.map((word) => tokens(word).join(' '));
  const got = tokens(heard);

  // lengths[i][j]: longest common subsequence of want[i..] and got[j..].
  const lengths = Array.from({ length: want.length + 1 }, () => new Array<number>(got.length + 1).fill(0));
  for (let i = want.length - 1; i >= 0; i--) {
    for (let j = got.length - 1; j >= 0; j--) {
      lengths[i]![j] = want[i] === got[j] ? lengths[i + 1]![j + 1]! + 1 : Math.max(lengths[i + 1]![j]!, lengths[i]![j + 1]!);
    }
  }

  // Walk the table once to see which words of the model are part of that subsequence.
  const found = want.map(() => false);
  for (let i = 0, j = 0; i < want.length && j < got.length; ) {
    if (want[i] === got[j]) {
      found[i] = true;
      i++;
      j++;
    } else if (lengths[i + 1]![j]! >= lengths[i]![j + 1]!) i++;
    else j++;
  }
  return { words: shown.map((text, index) => ({ text, heard: found[index]! })), matched: lengths[0]![0]!, total: want.length };
}

/** The rating to pre-select from a match. The learner can always choose another. */
export function suggestedGrade(match: SpokenMatch): 'again' | 'hard' | 'good' {
  const share = match.total === 0 ? 0 : match.matched / match.total;
  return share >= 0.9 ? 'good' : share >= 0.6 ? 'hard' : 'again';
}

// --- The browser side ----------------------------------------------------------

interface RecognitionResultList {
  length: number;
  [index: number]: { isFinal: boolean; 0: { transcript: string } };
}
interface Recognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  processLocally?: boolean;
  onresult: ((event: { resultIndex: number; results: RecognitionResultList }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(track?: MediaStreamTrack): void;
  stop(): void;
}
interface RecognitionClass {
  new (): Recognition;
  available?(options: { langs: string[]; processLocally: boolean }): Promise<'available' | 'downloadable' | 'downloading' | 'unavailable'>;
  install?(options: { langs: string[]; processLocally: boolean }): Promise<boolean>;
}

const GERMAN = { langs: ['de-DE'], processLocally: true };

function recognitionClass(): RecognitionClass | undefined {
  if (typeof window === 'undefined') return undefined;
  const scope = window as unknown as { SpeechRecognition?: RecognitionClass; webkitSpeechRecognition?: RecognitionClass };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
}

/**
 * Where German speech would be recognised in this browser:
 * - `device`: on this device, nothing leaves it;
 * - `installable`: on this device after a one-time download of the browser's German pack;
 * - `cloud`: at the browser maker's speech service;
 * - `none`: this browser cannot recognise speech.
 */
export type HearingMode = 'device' | 'installable' | 'cloud' | 'none';

export async function hearingMode(): Promise<HearingMode> {
  const Recognition = recognitionClass();
  if (!Recognition) return 'none';
  try {
    const local = await Recognition.available?.(GERMAN);
    if (local === 'available') return 'device';
    if (local === 'downloadable' || local === 'downloading') return 'installable';
  } catch {
    // An older browser without the on-device API: recognition goes to its service.
  }
  return 'cloud';
}

/** Download the browser's German pack so recognition can stay on the device. Resolves to whether it worked. */
export async function installHearing(): Promise<boolean> {
  try {
    return (await recognitionClass()?.install?.(GERMAN)) ?? false;
  } catch {
    return false;
  }
}

export interface Hearing {
  /** Stop listening; `result` then settles with everything heard. */
  stop(): void;
  /** What was heard, or '' if nothing was made out. Rejects with a readable message if recognition failed. */
  result: Promise<string>;
}

const FAILURES: Record<string, string> = {
  'not-allowed': 'The browser was not allowed to use the microphone.',
  'service-not-allowed': 'Speech recognition is switched off in this browser.',
  'audio-capture': 'No microphone was found.',
  network: 'Speech recognition needs an internet connection here, and the service could not be reached.',
  'language-not-supported': 'This browser cannot recognise German.',
};

/** Start listening for German. `local` keeps the audio on the device; only pass it when hearingMode() said `device`. */
export function hear(local: boolean): Hearing {
  const Recognition = recognitionClass();
  if (!Recognition) return { stop() {}, result: Promise.reject(new Error('This browser cannot recognise speech.')) };

  const recognition = new Recognition();
  recognition.lang = 'de-DE';
  recognition.continuous = true;
  recognition.interimResults = false;
  if (local) recognition.processLocally = true;

  const heard: string[] = [];
  const result = new Promise<string>((resolve, reject) => {
    let failure: string | undefined;
    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) heard.push(event.results[i]![0].transcript);
    };
    recognition.onerror = (event) => {
      // Silence is an answer, not a failure.
      if (event.error !== 'no-speech' && event.error !== 'aborted') failure = FAILURES[event.error] ?? `Speech recognition failed (${event.error}).`;
    };
    recognition.onend = () => (failure ? reject(new Error(failure)) : resolve(heard.join(' ').replace(/\s+/g, ' ').trim()));
  });
  recognition.start();
  return { stop: () => recognition.stop(), result };
}
