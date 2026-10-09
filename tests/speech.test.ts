import { describe, expect, it } from 'vitest';
import { rankGermanVoices, speakerVoices, type VoiceInfo } from '../src/lib/speech';

/**
 * Voice lists as real browsers report them, in the browser's own order.
 * Which voice reads the German decides whether a learner hears good German.
 */

const english: VoiceInfo[] = [
  { name: 'Microsoft David - English (United States)', lang: 'en-US' },
  { name: 'Microsoft Hazel - English (United Kingdom)', lang: 'en-GB' },
];

// Edge on Windows, with no German installed in Windows itself.
const edge: VoiceInfo[] = [
  ...english,
  { name: 'Microsoft Ingrid Online (Natural) - German (Austria)', lang: 'de-AT' },
  { name: 'Microsoft Jonas Online (Natural) - German (Austria)', lang: 'de-AT' },
  { name: 'Microsoft Leni Online (Natural) - German (Switzerland)', lang: 'de-CH' },
  { name: 'Microsoft Jan Online (Natural) - German (Switzerland)', lang: 'de-CH' },
  { name: 'Microsoft Seraphina Mehrsprachig Online (Natural) - German (Germany)', lang: 'de-DE' },
  { name: 'Microsoft Florian Mehrsprachig Online (Natural) - German (Germany)', lang: 'de-DE' },
  { name: 'Microsoft Katja Online (Natural) - German (Germany)', lang: 'de-DE' },
  { name: 'Microsoft Conrad Online (Natural) - German (Germany)', lang: 'de-DE' },
  { name: 'Microsoft Amala Online (Natural) - German (Germany)', lang: 'de-DE' },
  { name: 'Microsoft Killian Online (Natural) - German (Germany)', lang: 'de-DE' },
];

// Chrome on a Windows that has the German language pack: old system voices first, Google's after.
const chromeWithSystemGerman: VoiceInfo[] = [
  ...english,
  { name: 'Microsoft Hedda - German (Germany)', lang: 'de-DE' },
  { name: 'Microsoft Stefan - German (Germany)', lang: 'de-DE' },
  { name: 'Google Deutsch', lang: 'de-DE' },
  { name: 'Google US English', lang: 'en-US' },
];

const first = (voices: VoiceInfo[], preferred?: string) => rankGermanVoices(voices, preferred)[0]?.name;
const short = (voices: VoiceInfo[]) => voices.map((voice) => voice.name.split(' ')[1]);

describe('choosing a German voice', () => {
  it('prefers a German-only voice from Germany over a multilingual one', () => {
    // A multilingual voice guesses the language of each phrase, so short German comes out wrong.
    expect(first(edge)).toBe('Microsoft Katja Online (Natural) - German (Germany)');
    expect(short(rankGermanVoices(edge)).slice(-2)).toEqual(['Seraphina', 'Florian']);
  });

  it('keeps Germany before Austria and Switzerland among equally good voices', () => {
    expect(short(rankGermanVoices(edge)).slice(0, 8)).toEqual(['Katja', 'Conrad', 'Amala', 'Killian', 'Ingrid', 'Jonas', 'Leni', 'Jan']);
  });

  it('prefers Google’s voice to the old system voices', () => {
    expect(first(chromeWithSystemGerman)).toBe('Google Deutsch');
  });

  it('finds nothing when the browser has no German voice', () => {
    expect(rankGermanVoices(english)).toEqual([]);
  });

  it('reads language codes written with an underscore or in capitals', () => {
    expect(first([{ name: 'Deutsch Deutschland', lang: 'de_DE' }])).toBe('Deutsch Deutschland');
    expect(first([{ name: 'German', lang: 'DE-de' }])).toBe('German');
  });

  it('puts the learner’s own choice first, and ignores a choice this browser does not have', () => {
    const conrad = 'Microsoft Conrad Online (Natural) - German (Germany)';
    expect(first(edge, conrad)).toBe(conrad);
    expect(rankGermanVoices(edge, conrad)).toHaveLength(10);
    expect(first(edge, 'A voice from another device')).toBe('Microsoft Katja Online (Natural) - German (Germany)');
  });
});

describe('voices for the speakers of a dialogue', () => {
  it('uses only voices as good as the best one', () => {
    expect(short(speakerVoices(rankGermanVoices(edge)))).toEqual(['Katja', 'Conrad', 'Amala', 'Killian']);
    // One good voice: the speakers are told apart by pitch instead of handing one of them a robotic voice.
    expect(speakerVoices(rankGermanVoices(chromeWithSystemGerman)).map((voice) => voice.name)).toEqual(['Google Deutsch']);
  });

  it('follows the learner’s choice', () => {
    const ingrid = 'Microsoft Ingrid Online (Natural) - German (Austria)';
    expect(short(speakerVoices(rankGermanVoices(edge, ingrid)))).toEqual(['Ingrid', 'Jonas', 'Leni', 'Jan']);
  });

  it('is empty without German voices', () => {
    expect(speakerVoices([])).toEqual([]);
  });
});
