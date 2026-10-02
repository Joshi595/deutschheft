import type { Exercise } from '../content/schema';
import { countWords, type GradeResult, type Response } from './grade';
import { tokenize } from './shuffle';

/** Helpers shared by the lesson exercise card and the exam runner. */

export function emptyResponse(item: Exercise): Response {
  switch (item.type) {
    case 'multiple-choice':
      return { type: 'multiple-choice', choice: '' };
    case 'true-false':
      return { type: 'true-false', value: null };
    case 'cloze':
      return { type: 'cloze', texts: item.gaps.map(() => '') };
    case 'form':
      return { type: 'form', texts: item.fields.map(() => '') };
    case 'matching':
      return { type: 'matching', selection: {} };
    case 'word-order':
      return { type: 'word-order', tokens: [] };
    case 'writing-task':
      return { type: 'writing-task', text: '', covered: [] };
    case 'speaking-task':
      return { type: 'speaking-task', done: [] };
    default:
      return { type: item.type, text: '' };
  }
}

/** Self-assessed tasks: marked by the learner against a model, not by the grader. */
export function isSelfAssessed(item: Exercise): boolean {
  return item.type === 'writing-task' || item.type === 'speaking-task';
}

/** Whether there is enough of an answer to check in a lesson. */
export function isReady(item: Exercise, response: Response): boolean {
  switch (response.type) {
    case 'multiple-choice':
      return response.choice !== '';
    case 'true-false':
      return response.value !== null;
    case 'cloze':
    case 'form':
      return response.texts.every((text) => text.trim() !== '');
    case 'matching':
      return item.type === 'matching' && item.pairs.every((pair) => response.selection[pair.left]);
    case 'word-order':
      return item.type === 'word-order' && response.tokens.length === tokenize(item.answer).length;
    case 'writing-task':
      // The checklist appears once the learner has compared with the model answer.
      return (
        item.type === 'writing-task' &&
        countWords(response.text) >= item.minWords &&
        response.covered.length === item.points.length
      );
    case 'speaking-task':
      return item.type === 'speaking-task' && response.done.length === item.checklist.length;
    default:
      return response.text.trim() !== '';
  }
}

/** Whether anything at all was entered; an exam counts an untouched item as unanswered. */
export function isAnswered(response: Response): boolean {
  switch (response.type) {
    case 'multiple-choice':
      return response.choice !== '';
    case 'true-false':
      return response.value !== null;
    case 'cloze':
    case 'form':
      return response.texts.some((text) => text.trim() !== '');
    case 'matching':
      return Object.values(response.selection).some(Boolean);
    case 'word-order':
      return response.tokens.length > 0;
    case 'speaking-task':
      return response.done.length > 0;
    default:
      return response.text.trim() !== '';
  }
}

const FALLBACK_PROMPT: Partial<Record<Exercise['type'], string>> = {
  'fill-blank': 'Fill in the gap.',
  cloze: 'Fill in the gaps.',
  form: 'Fill in the form.',
  matching: 'Match each item with its partner.',
  'word-order': 'Put the words in the right order.',
};

/** The instruction line shown above an item. */
export function headingOf(item: Exercise): string {
  if (item.type === 'fill-blank') return FALLBACK_PROMPT['fill-blank']!;
  return item.prompt ?? FALLBACK_PROMPT[item.type] ?? '';
}

/** The item as one line of text, for the mistakes log and for AI context. */
export function promptOf(item: Exercise): string {
  switch (item.type) {
    case 'fill-blank':
      return item.prompt;
    case 'cloze':
      return item.text;
    case 'form':
      return item.situation;
    default:
      return headingOf(item);
  }
}

/** The full correct German sentence, if this exercise has one worth hearing. */
export function spokenSolution(item: Exercise, result: GradeResult): string | undefined {
  switch (item.type) {
    case 'fill-blank':
      return item.prompt.replace('___', result.expected).replace(/\s*\([^)]*\)\s*$/, '');
    case 'cloze': {
      let index = 0;
      return item.text.replace(/___/g, () => item.gaps[index++]?.[0] ?? '');
    }
    case 'translation':
      return result.expected;
    case 'word-order':
      return item.answer;
    case 'writing':
    case 'writing-task':
    case 'speaking-task':
      return item.sample;
    default:
      return undefined;
  }
}
