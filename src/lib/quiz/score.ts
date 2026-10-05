import type { ClientQuiz } from '../content/types';
import { grade, partialScore, type GradeResult, type Response } from '../grading/grade';
import { emptyResponse } from '../grading/response';

/** Scoring for mock exams and unit checkpoints. Pure, so it can be tested. */

export interface SectionScore {
  skill: string;
  /** Points earned, rounded to a whole number as on a Goethe result sheet. */
  points: number;
  max: number;
  percent: number;
  passed: boolean;
}

export interface QuizScore {
  sections: SectionScore[];
  /** Overall percentage, 0 to 100. */
  total: number;
  passed: boolean;
  /** Result of every item, by id. */
  results: Record<string, GradeResult>;
}

export interface QuizAttempt {
  at: string;
  total: number;
  passed: boolean;
  sections: { skill: string; points: number; max: number }[];
}

export type QuizHistory = Record<string, QuizAttempt[]>;

/** Attempts kept per quiz; older ones are dropped. */
export const MAX_ATTEMPTS_KEPT = 10;

export function scoreQuiz(quiz: ClientQuiz, responses: Record<string, Response>): QuizScore {
  const results: Record<string, GradeResult> = {};

  const sections: SectionScore[] = quiz.sections.map((section) => {
    const items = section.parts.flatMap((part) => part.items);
    let earned = 0;
    for (const item of items) {
      const result = grade(item, responses[item.id] ?? emptyResponse(item));
      results[item.id] = result;
      earned += partialScore(result);
    }
    const share = items.length === 0 ? 0 : earned / items.length;
    const points = Math.round(share * section.points);
    const percent = Math.round(share * 100);
    return { skill: section.skill, points, max: section.points, percent, passed: percent >= quiz.passMark };
  });

  const max = sections.reduce((sum, section) => sum + section.max, 0);
  const points = sections.reduce((sum, section) => sum + section.points, 0);
  const total = max === 0 ? 0 : Math.round((points / max) * 100);
  const passed = quiz.scoring === 'per-module' ? sections.every((section) => section.passed) : total >= quiz.passMark;

  return { sections, total, passed, results };
}

export function toAttempt(score: QuizScore, now: Date): QuizAttempt {
  return {
    at: now.toISOString(),
    total: score.total,
    passed: score.passed,
    sections: score.sections.map(({ skill, points, max }) => ({ skill, points, max })),
  };
}

export function addAttempt(history: QuizHistory, quizId: string, attempt: QuizAttempt): QuizHistory {
  return { ...history, [quizId]: [attempt, ...(history[quizId] ?? [])].slice(0, MAX_ATTEMPTS_KEPT) };
}

export function bestAttempt(history: QuizHistory, quizId: string): QuizAttempt | undefined {
  return (history[quizId] ?? []).reduce<QuizAttempt | undefined>(
    (best, attempt) => (!best || attempt.total > best.total ? attempt : best),
    undefined,
  );
}
