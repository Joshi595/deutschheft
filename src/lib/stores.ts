import { persistentAtom } from '@nanostores/persistent';
import { buildBackup, parseBackup, type Backup } from './backup';
import {
  addWord,
  emptyNotebook,
  logMistake,
  removeWord,
  setNote,
  type Mistake,
  type NotebookState,
  type SavedWord,
} from './notebook/logic';
import { addXp, applyAttempt, attemptXp, emptyProgress, markStudyDay, XP, type ProgressState } from './progress/logic';
import { addAttempt, type QuizAttempt, type QuizHistory } from './quiz/score';
import { cardId, enroll, schedule, type CardKind, type ReviewGrade, type ReviewState } from './srs/scheduler';

/**
 * Everything the learner owns lives in the browser's localStorage, one key per
 * domain. Browser-only: import this from client components and <script> tags.
 */

export interface Settings {
  theme: 'system' | 'light' | 'dark';
  /** Playback speed for spoken German, 0.5 to 1.2. */
  speechRate: number;
  /** Name of the browser voice the learner chose. Unset means the best one available. */
  voice?: string;
  /** The learner's own Groq key. Stored in this browser only; never part of a backup. */
  aiKey: string;
  aiModel: string;
  /** Level id the learner chose, e.g. "a2". Unset until chosen; then it is inferred from progress. */
  level?: string;
  /** Points to aim for each day. 0 means the goal is paused. */
  dailyGoal: number;
}

export const DAILY_GOALS = [
  { xp: 50, label: 'Light', detail: 'about 5 minutes' },
  { xp: 100, label: 'Regular', detail: 'about 10 minutes' },
  { xp: 200, label: 'Intensive', detail: 'about 20 minutes' },
] as const;

export const defaultSettings: Settings = {
  theme: 'system',
  speechRate: 0.9,
  aiKey: '',
  aiModel: 'llama-3.3-70b-versatile',
  dailyGoal: 50,
};

function json<T>(fallback: T, revive: (value: unknown) => T = (value) => value as T) {
  return {
    encode: (value: T) => JSON.stringify(value),
    decode: (encoded: string): T => {
      try {
        return revive(JSON.parse(encoded));
      } catch {
        return fallback;
      }
    },
  };
}

export const SETTINGS_KEY = 'lg:settings:v1';

export const $progress = persistentAtom<ProgressState>('lg:progress:v1', emptyProgress, json(emptyProgress));
export const $review = persistentAtom<ReviewState>('lg:review:v1', {}, json<ReviewState>({}));
export const $notebook = persistentAtom<NotebookState>('lg:notebook:v1', emptyNotebook, json(emptyNotebook));
export const $quizzes = persistentAtom<QuizHistory>('lg:quizzes:v1', {}, json<QuizHistory>({}));
/** Ids of the milestones the learner has already been shown, so each is announced once. */
export const $seenMilestones = persistentAtom<string[]>('lg:milestones-seen:v1', [], json<string[]>([]));
export const $settings = persistentAtom<Settings>(
  SETTINGS_KEY,
  defaultSettings,
  json(defaultSettings, (value) => ({ ...defaultSettings, ...(value as Partial<Settings>) })),
);

// --- Exercises -------------------------------------------------------------

export interface AnswerEvent {
  exerciseId: string;
  lessonKey: string;
  correct: boolean;
  prompt: string;
  given: string;
  expected: string;
}

/**
 * Record one submitted answer. A wrong answer is logged and queued for review.
 * Returns the points the answer earned.
 */
export function recordAnswer(event: AnswerEvent, now = new Date()): number {
  const before = $progress.get();
  const earned = attemptXp(before.exercises[event.exerciseId], event.correct);
  $progress.set(addXp(applyAttempt(before, event.exerciseId, event.correct, now), earned, now));
  if (!event.correct) {
    const mistake: Mistake = {
      exerciseId: event.exerciseId,
      lessonKey: event.lessonKey,
      prompt: event.prompt,
      given: event.given,
      expected: event.expected,
      at: now.toISOString(),
    };
    $notebook.set(logMistake($notebook.get(), mistake));
    enrollCards('exercise', [event.exerciseId], now);
  }
  return earned;
}

// --- Review ----------------------------------------------------------------

export function enrollCards(kind: CardKind, refs: readonly string[], now = new Date()): void {
  const next = enroll($review.get(), kind, refs, now);
  if (next !== $review.get()) $review.set(next);
}

export function rateCard(id: string, grade: ReviewGrade, now = new Date()): void {
  const card = $review.get()[id];
  if (!card) return;
  $review.set({ ...$review.get(), [id]: schedule(card, grade, now) });
  $progress.set(addXp(markStudyDay($progress.get(), now), XP.review[grade], now));
}

export function removeCard(id: string): void {
  const { [id]: _removed, ...rest } = $review.get();
  $review.set(rest);
}

// --- Mock exams and checkpoints ----------------------------------------------

export function recordQuizAttempt(quizId: string, attempt: QuizAttempt, now = new Date()): void {
  $quizzes.set(addAttempt($quizzes.get(), quizId, attempt));
  const earned = XP.quizDone + (attempt.passed ? XP.quizPassed : 0);
  $progress.set(addXp(markStudyDay($progress.get(), now), earned, now));
}

// --- Notebook --------------------------------------------------------------

export function saveNote(lessonKey: string, text: string): void {
  $notebook.set(setNote($notebook.get(), lessonKey, text));
}

/** Save one of the learner's own words; it also joins the review deck. */
export function saveWord(word: Omit<SavedWord, 'id' | 'at'>, now = new Date()): void {
  const id = `w${now.getTime().toString(36)}`;
  $notebook.set(addWord($notebook.get(), { ...word, id, at: now.toISOString() }));
  enrollCards('custom', [id], now);
}

export function deleteWord(id: string): void {
  $notebook.set(removeWord($notebook.get(), id));
  removeCard(cardId('custom', id));
}

export function clearMistakes(): void {
  $notebook.set({ ...$notebook.get(), mistakes: [] });
}

// --- Settings and backup ----------------------------------------------------

export function updateSettings(patch: Partial<Settings>): void {
  $settings.set({ ...$settings.get(), ...patch });
}

export function exportBackup(now = new Date()): Backup {
  return buildBackup(
    { progress: $progress.get(), review: $review.get(), notebook: $notebook.get(), quizzes: $quizzes.get() },
    now,
  );
}

/** Replace all stored learning data with the contents of a backup file. */
export function importBackup(fileText: string): void {
  const data = parseBackup(fileText);
  $progress.set(data.progress);
  $review.set(data.review);
  $notebook.set(data.notebook);
  $quizzes.set(data.quizzes);
}

export function resetAll(): void {
  $progress.set(emptyProgress);
  $review.set({});
  $notebook.set(emptyNotebook);
  $quizzes.set({});
  $seenMilestones.set([]);
  // Starting over includes choosing a level again; the daily goal is a preference and stays.
  $settings.set({ ...$settings.get(), level: undefined });
}
