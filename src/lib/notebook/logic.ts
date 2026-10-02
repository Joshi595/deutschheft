/** Pure notebook rules. The persistent store in ../stores.ts applies them. */

export interface SavedWord {
  id: string;
  de: string;
  en: string;
  note?: string;
  /** Lesson it was saved from, if any. */
  lessonKey?: string;
  at: string;
}

export interface Mistake {
  exerciseId: string;
  lessonKey: string;
  prompt: string;
  given: string;
  expected: string;
  at: string;
}

export interface NotebookState {
  /** Free-form notes, keyed by lesson key. */
  notes: Record<string, string>;
  words: SavedWord[];
  /** Newest first, capped at MAX_MISTAKES. */
  mistakes: Mistake[];
}

export const emptyNotebook: NotebookState = { notes: {}, words: [], mistakes: [] };

export const MAX_MISTAKES = 200;

export function setNote(state: NotebookState, lessonKey: string, text: string): NotebookState {
  const notes = { ...state.notes };
  if (text.trim()) notes[lessonKey] = text;
  else delete notes[lessonKey];
  return { ...state, notes };
}

export function addWord(state: NotebookState, word: SavedWord): NotebookState {
  return { ...state, words: [word, ...state.words.filter((existing) => existing.id !== word.id)] };
}

export function removeWord(state: NotebookState, id: string): NotebookState {
  return { ...state, words: state.words.filter((word) => word.id !== id) };
}

export function logMistake(state: NotebookState, mistake: Mistake): NotebookState {
  return { ...state, mistakes: [mistake, ...state.mistakes].slice(0, MAX_MISTAKES) };
}

/** Case- and umlaut-tolerant substring search across everything in the notebook. */
export function matches(query: string, ...fields: (string | undefined)[]): boolean {
  const fold = (text: string) =>
    text
      .toLowerCase()
      .replace(/ä/g, 'a')
      .replace(/ö/g, 'o')
      .replace(/ü/g, 'u')
      .replace(/ß/g, 'ss');
  const needle = fold(query.trim());
  return needle === '' || fields.some((field) => field !== undefined && fold(field).includes(needle));
}
