/**
 * The translate panel: an online engine for any text, and the course's own
 * word list for the article, plural and chapter of the words in it.
 */

export type Direction = 'de-en' | 'en-de';

/** One course vocabulary entry, as served by /words.json. */
export interface CourseWord {
  de: string;
  en: string;
  article?: 'der' | 'die' | 'das';
  plural?: string;
  pos: string;
  lesson: string;
  href: string;
}

/** The engine takes at most this many characters per request. */
export const MAX_CHARS = 500;

/**
 * MyMemory's free API: no key, open to browsers, about 5,000 characters a day per user.
 * `onlyprivate` skips its crowd-sourced memory, which answers short phrases with junk
 * ("the train station" → "The Train Station"), and leaves its machine translation.
 */
export async function translate(text: string, direction: Direction, signal?: AbortSignal): Promise<string> {
  const [from, to] = direction.split('-');
  const response = await fetch(
    `https://api.mymemory.translated.net/get?onlyprivate=1&mt=1&langpair=${from}|${to}&q=${encodeURIComponent(text.slice(0, MAX_CHARS))}`,
    { signal },
  );
  const data = (await response.json().catch(() => undefined)) as
    | { responseStatus?: number | string; quotaFinished?: boolean; responseData?: { translatedText?: string } }
    | undefined;
  if (data?.quotaFinished || Number(data?.responseStatus) === 429) {
    throw new Error("Today's free translations are used up. Use the Google Translate link below instead.");
  }
  const translated = data?.responseData?.translatedText?.trim();
  if (!response.ok || Number(data?.responseStatus) !== 200 || !translated) {
    throw new Error('The translation service did not answer. Check your connection and try again.');
  }
  return translated;
}

export function googleTranslateHref(text: string, direction: Direction): string {
  const [from, to] = direction.split('-');
  return `https://translate.google.com/?sl=${from}&tl=${to}&op=translate&text=${encodeURIComponent(text)}`;
}

/** Lower case, letters only, no notes in brackets, no leading article or "to". */
const bare = (text: string) =>
  text
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^\p{L}\s]/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^(der|die|das|the|to|a|an) /, '');

/** Pronouns, prepositions and conjunctions: listed when looked up alone, not when found inside a sentence. */
const SMALL = new Set(['other', 'preposition', 'conjunction']);

/**
 * Course words in the text. German: the whole text, then each of its words in
 * order, matching singular or plural. English: the whole text only, since its
 * small words would match half the list.
 */
export function findWords(text: string, direction: Direction, words: readonly CourseWord[], limit = 6): CourseWord[] {
  const query = bare(text);
  if (!query) return [];
  const keys = (word: CourseWord) =>
    direction === 'de-en' ? [bare(word.de), bare(word.plural ?? '')] : word.en.split(/[,;/]/).map(bare);
  const tokens = direction === 'de-en' ? [query, ...query.split(' ')] : [query];
  const found = new Set<CourseWord>();
  for (const [i, token] of tokens.entries()) {
    const word = words.find((candidate) => (i === 0 || !SMALL.has(candidate.pos)) && keys(candidate).includes(token));
    if (word) found.add(word);
  }
  return [...found].slice(0, limit);
}
