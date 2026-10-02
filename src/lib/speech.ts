/** Spoken German through the browser's built-in voices (Web Speech API). */

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

function germanVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  return voices.find((voice) => voice.lang === 'de-DE') ?? voices.find((voice) => voice.lang.startsWith('de'));
}

/**
 * Whether German can be spoken here. `undefined` while the browser has not
 * reported its voices yet (some load them late, some never list them).
 */
export function germanAvailable(): boolean | undefined {
  if (!speechSupported()) return false;
  if (window.speechSynthesis.getVoices().length === 0) return undefined;
  return germanVoice() !== undefined;
}

export function speak(text: string, rate = 0.9): void {
  if (!speechSupported()) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'de-DE';
  utterance.rate = rate;
  const voice = germanVoice();
  if (voice) utterance.voice = voice;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}
