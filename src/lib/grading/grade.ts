import type { Exercise, ExerciseOf } from '../content/schema';
import { clean, editDistance, normalize, stripUmlauts, transliterate } from './normalize';

/**
 * Deterministic grading. These functions alone decide right or wrong;
 * AI is only ever asked to explain a result, never to produce one.
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
}

export type Response =
  | { type: 'multiple-choice'; choice: string }
  | { type: 'fill-blank'; text: string }
  | { type: 'matching'; selection: Record<string, string> }
  | { type: 'translation'; text: string }
  | { type: 'word-order'; tokens: string[] }
  | { type: 'writing'; text: string };

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

export function gradeMultipleChoice(item: ExerciseOf<'multiple-choice'>, choice: string): GradeResult {
  return { correct: choice === item.answer, expected: item.answer };
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

export function grade(item: Exercise, response: Response): GradeResult {
  if (item.type !== response.type) {
    throw new Error(`Response of type "${response.type}" given to a "${item.type}" exercise`);
  }
  switch (item.type) {
    case 'multiple-choice':
      return gradeMultipleChoice(item, (response as Extract<Response, { type: 'multiple-choice' }>).choice);
    case 'fill-blank':
      return gradeText((response as Extract<Response, { type: 'fill-blank' }>).text, item.answers);
    case 'matching':
      return gradeMatching(item, (response as Extract<Response, { type: 'matching' }>).selection);
    case 'translation':
      return gradeText((response as Extract<Response, { type: 'translation' }>).text, item.answers);
    case 'word-order':
      return gradeWordOrder(item, (response as Extract<Response, { type: 'word-order' }>).tokens);
    case 'writing':
      return gradeWriting(item, (response as Extract<Response, { type: 'writing' }>).text);
  }
}

/** What the learner typed or chose, as one line of text for the mistakes log. */
export function describeResponse(response: Response): string {
  switch (response.type) {
    case 'multiple-choice':
      return response.choice;
    case 'matching':
      return Object.entries(response.selection)
        .map(([left, right]) => `${left} = ${right}`)
        .join(', ');
    case 'word-order':
      return response.tokens.join(' ');
    default:
      return response.text;
  }
}
