import { describe, expect, it } from 'vitest';
import { findWords, type CourseWord } from '../src/lib/translate';

const word = (de: string, en: string, extra: Partial<CourseWord> = {}): CourseWord => ({ de, en, pos: 'noun', lesson: 'A1 · Test', href: '/a1/test/', ...extra });

const words = [
  word('Zeit', 'time', { article: 'die', plural: 'Zeiten' }),
  word('Stadt', 'town, city', { article: 'die', plural: 'Städte' }),
  word('gehen', 'to go', { pos: 'verb' }),
  word('ich', 'I', { pos: 'other' }),
  word('Gute Nacht', 'good night (at bedtime)'),
  word('Zeit', 'time', { article: 'die', lesson: 'A2 · Later' }),
  word('Das geht.', 'That works.', { pos: 'phrase' }),
];

describe('findWords', () => {
  it('finds the course words in a German sentence, in sentence order, once each', () => {
    expect(findWords('Ich habe keine Zeit für die Städte!', 'de-en', words).map((w) => w.de)).toEqual(['Zeit', 'Stadt']);
    expect(findWords('Zeit, Zeit', 'de-en', words)).toEqual([words[0]]);
  });

  it('leaves out small words inside a sentence but finds them alone', () => {
    expect(findWords('ich gehen', 'de-en', words).map((w) => w.de)).toEqual(['gehen']);
    expect(findWords('Ich', 'de-en', words).map((w) => w.de)).toEqual(['ich']);
  });

  it('matches a whole German phrase', () => {
    expect(findWords('Gute Nacht!', 'de-en', words)[0]).toBe(words[4]);
    expect(findWords('Das geht.', 'de-en', words)[0]).toBe(words[6]);
  });

  it('does not cut the article off a course phrase', () => {
    expect(findWords('Wie geht es dir?', 'de-en', words)).toEqual([]);
    expect(findWords('der Zeit', 'de-en', words)[0]).toBe(words[0]);
  });

  it('matches one English sense, ignoring articles, "to" and notes in brackets', () => {
    expect(findWords('the city', 'en-de', words)).toEqual([words[1]]);
    expect(findWords('to go', 'en-de', words)).toEqual([words[2]]);
    expect(findWords('Good night', 'en-de', words)).toEqual([words[4]]);
    expect(findWords('I go to the city', 'en-de', words)).toEqual([]);
  });

  it('finds nothing in empty text', () => {
    expect(findWords(' … ', 'de-en', words)).toEqual([]);
  });
});
