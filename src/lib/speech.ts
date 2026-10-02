/** Spoken German through the browser's built-in voices (Web Speech API). */

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

function germanVoices(): SpeechSynthesisVoice[] {
  const voices = window.speechSynthesis.getVoices();
  const exact = voices.filter((voice) => voice.lang === 'de-DE');
  const other = voices.filter((voice) => voice.lang.startsWith('de') && voice.lang !== 'de-DE');
  return [...exact, ...other];
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
  const voices = germanVoices();
  if (voices.length > 0) result.voice = voices[speakerIndex % voices.length]!;
  // With a single installed voice, pitch is the only way to tell speakers apart.
  if (voices.length < 2) result.pitch = [1, 0.75, 1.3][speakerIndex % 3]!;
  return result;
}

export function speak(text: string, rate = 0.9): void {
  if (!speechSupported()) return;
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
  if (!speechSupported()) {
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
