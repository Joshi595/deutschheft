import type { Exercise, ExerciseOf } from '../content/schema';
import { clean, editDistance, normalize, stripUmlauts, transliterate } from './normalize';

/**
 * Deterministic grading. These functions alone decide right or wrong;
 * AI is only ever asked to explain a result, never to produce one.
 *
 * Writing and speaking tasks cannot be marked by a program. For those the
 * learner compares their attempt with a model and ticks off a checklist, and
 * the functions here turn that self-assessment into a result.
 */

export interface GradeResult {
  correct: boolean;
  /** A wrong answer that was nearly right (spelling or umlauts). */
  close?: boolean;
  /** Extra feedback: a capitalisation or umlaut reminder, or what is missing. */
  note?: string;
  /** The model answer, shown once the item is solved or revealed. */
  expected: string;
  /** Matching only: which left-hand items were paired correctly. */
  pairs?: Record<string, boolean>;
  /** Cloze, form, writing and speaking tasks: which gap, field or point was right. */
  parts?: boolean[];
}

export type Response =
  | { type: 'multiple-choice'; choice: string }
  | { type: 'true-false'; value: boolean | null }
  | { type: 'fill-blank'; text: string }
  | { type: 'cloze'; texts: string[] }
  | { type: 'form'; texts: string[] }
  | { type: 'matching'; selection: Record<string, string> }
  | { type: 'translation'; text: string }
  | { type: 'word-order'; tokens: string[] }
  | { type: 'writing'; text: string }
  | { type: 'writing-task'; text: string; covered: boolean[] }
  | { type: 'speaking-task'; done: boolean[] };

export type ResponseOf<T extends Response['type']> = Extract<Response, { type: T }>;

export function countWords(text: string): number {
  return clean(text).split(' ').filter(Boolean).length;
}

/** Compare free text against a list of accepted answers. */
export function gradeText(given: string, accepted: readonly string[]): GradeResult {
  const expected = accepted[0] ?? '';
  const givenClean = clean(given);
  const givenNorm = givenClean.toLowerCase();

  for (const answer of accepted) {
    if (givenNorm === normalize(answer)) {
      return givenClean === clean(answer)
        ? { correct: true, expected: answer }
        : { correct: true, expected: answer, note: `Watch the capitalisation: ${answer}` };
    }
  }

  for (const answer of accepted) {
    if (transliterate(givenNorm) === transliterate(normalize(answer))) {
      return { correct: true, expected: answer, note: `Correct. With the proper letters it is written: ${answer}` };
    }
  }

  for (const answer of accepted) {
    if (stripUmlauts(givenNorm) === stripUmlauts(normalize(answer))) {
      return { correct: false, close: true, expected, note: 'Almost. Check the umlauts (ä, ö, ü): they change the word.' };
    }
  }

  for (const answer of accepted) {
    const target = normalize(answer);
    if (target.length >= 5 && editDistance(givenNorm, target, 1) <= 1) {
      return { correct: false, close: true, expected, note: 'Almost. Check your spelling.' };
    }
  }

  return { correct: false, expected };
}

/** Several typed answers at once: the gaps of a cloze text or the fields of a form. */
export function gradeGaps(given: readonly string[], accepted: readonly (readonly string[])[]): GradeResult {
  const results = accepted.map((answers, index) => gradeText(given[index] ?? '', answers));
  const parts = results.map((result) => result.correct);
  const notes = [...new Set(results.map((result) => result.note).filter((note): note is string => Boolean(note)))];
  return {
    correct: parts.every(Boolean),
    close: results.some((result) => result.close) || undefined,
    note: notes.length > 0 ? notes.join(' ') : undefined,
    expected: accepted.map((answers) => answers[0]).join(' · '),
    parts,
  };
}

export function gradeMultipleChoice(item: ExerciseOf<'multiple-choice'>, choice: string): GradeResult {
  return { correct: choice === item.answer, expected: item.answer };
}

export function gradeTrueFalse(item: ExerciseOf<'true-false'>, value: boolean | null): GradeResult {
  return { correct: value === item.answer, expected: item.answer ? 'Richtig' : 'Falsch' };
}

export function gradeMatching(item: ExerciseOf<'matching'>, selection: Record<string, string>): GradeResult {
  const pairs: Record<string, boolean> = {};
  for (const pair of item.pairs) {
    pairs[pair.left] = selection[pair.left] === pair.right;
  }
  return {
    correct: Object.values(pairs).every(Boolean),
    expected: item.pairs.map((pair) => `${pair.left} = ${pair.right}`).join(', '),
    pairs,
  };
}

export function gradeWordOrder(item: ExerciseOf<'word-order'>, tokens: readonly string[]): GradeResult {
  const given = normalize(tokens.join(' '));
  const correct = [item.answer, ...item.alternatives].some((answer) => normalize(answer) === given);
  return { correct, expected: item.answer };
}

export function gradeWriting(item: ExerciseOf<'writing'>, text: string): GradeResult {
  const given = normalize(text);
  const words = given.split(' ').filter(Boolean);
  if (words.length < 3) {
    return { correct: false, expected: item.sample, note: 'Write a full sentence.' };
  }
  // Whole-word match, so "weil" is not satisfied by "weilen"; multi-word phrases work too.
  const haystack = ` ${transliterate(given)} `;
  const missing = item.mustInclude.filter(
    (required) => !haystack.includes(` ${transliterate(normalize(required))} `),
  );
  if (missing.length > 0) {
    return { correct: false, expected: item.sample, note: `Your sentence needs to include: ${missing.join(', ')}` };
  }
  return { correct: true, expected: item.sample };
}

/** Long enough, and the learner judged every content point covered. */
export function gradeWritingTask(item: ExerciseOf<'writing-task'>, text: string, covered: readonly boolean[]): GradeResult {
  const parts = item.points.map((_, index) => covered[index] === true);
  const words = countWords(text);
  if (words < item.minWords) {
    return {
      correct: false,
      expected: item.sample,
      parts,
      note: `Too short: ${words} of at least ${item.minWords} words.`,
    };
  }
  const missing = parts.filter((done) => !done).length;
  return {
    correct: missing === 0,
    expected: item.sample,
    parts,
    note: missing === 0 ? undefined : `${missing} content ${missing === 1 ? 'point is' : 'points are'} still missing. Rewrite and compare again.`,
  };
}

/** The learner judged their spoken answer against every point of the checklist. */
export function gradeSpeakingTask(item: ExerciseOf<'speaking-task'>, done: readonly boolean[]): GradeResult {
  const parts = item.checklist.map((_, index) => done[index] === true);
  const missing = parts.filter((ticked) => !ticked).length;
  return {
    correct: missing === 0,
    expected: item.sample,
    parts,
    note: missing === 0 ? undefined : 'Say it again and aim for the points you left unticked.',
  };
}

export function grade(item: Exercise, response: Response): GradeResult {
  if (item.type !== response.type) {
    throw new Error(`Response of type "${response.type}" given to a "${item.type}" exercise`);
  }
  switch (item.type) {
    case 'multiple-choice':
      return gradeMultipleChoice(item, (response as ResponseOf<'multiple-choice'>).choice);
    case 'true-false':
      return gradeTrueFalse(item, (response as ResponseOf<'true-false'>).value);
    case 'fill-blank':
      return gradeText((response as ResponseOf<'fill-blank'>).text, item.answers);
    case 'cloze':
      return gradeGaps((response as ResponseOf<'cloze'>).texts, item.gaps);
    case 'form':
      return gradeGaps(
        (response as ResponseOf<'form'>).texts,
        item.fields.map((field) => field.answers),
      );
    case 'matching':
      return gradeMatching(item, (response as ResponseOf<'matching'>).selection);
    case 'translation':
      return gradeText((response as ResponseOf<'translation'>).text, item.answers);
    case 'word-order':
      return gradeWordOrder(item, (response as ResponseOf<'word-order'>).tokens);
    case 'writing':
      return gradeWriting(item, (response as ResponseOf<'writing'>).text);
    case 'writing-task': {
      const given = response as ResponseOf<'writing-task'>;
      return gradeWritingTask(item, given.text, given.covered);
    }
    case 'speaking-task':
      return gradeSpeakingTask(item, (response as ResponseOf<'speaking-task'>).done);
  }
}

/**
 * Share of an item answered correctly, from 0 to 1. Used for exam scores, where
 * four of five gaps right should count for more than nothing.
 */
export function partialScore(result: GradeResult): number {
  if (result.correct) return 1;
  const flags = result.parts ?? (result.pairs ? Object.values(result.pairs) : undefined);
  if (!flags || flags.length === 0) return 0;
  return flags.filter(Boolean).length / flags.length;
}

/** What the learner typed or chose, as one line of text for the mistakes log. */
export function describeResponse(response: Response): string {
  switch (response.type) {
    case 'multiple-choice':
      return response.choice;
    case 'true-false':
      return response.value === null ? '' : response.value ? 'Richtig' : 'Falsch';
    case 'matching':
      return Object.entries(response.selection)
        .map(([left, right]) => `${left} = ${right}`)
        .join(', ');
    case 'word-order':
      return response.tokens.join(' ');
    case 'cloze':
    case 'form':
      return response.texts.map((text) => text || '(empty)').join(' · ');
    case 'speaking-task':
      return `${response.done.filter(Boolean).length} of ${response.done.length} points`;
    default:
      return response.text;
  }
}
