/** Pure progress rules. The persistent store in ../stores.ts applies them. */

export interface ExerciseRecord {
  /** Number of answers submitted, right or wrong. */
  attempts: number;
  /** Solved at least once. */
  correct: boolean;
  /** Solved with the very first answer. */
  firstTry: boolean;
  /** ISO timestamp of the latest answer. */
  at: string;
}

export interface ProgressState {
  exercises: Record<string, ExerciseRecord>;
  /** Local calendar days (YYYY-MM-DD) with at least one answered exercise or review. */
  days: string[];
}

export const emptyProgress: ProgressState = { exercises: {}, days: [] };

/** Local calendar day, so a streak follows the learner's own midnight. */
export function localDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function markStudyDay(state: ProgressState, now: Date): ProgressState {
  const today = localDay(now);
  return state.days.includes(today) ? state : { ...state, days: [...state.days, today].sort() };
}

export function applyAttempt(state: ProgressState, id: string, correct: boolean, now: Date): ProgressState {
  const previous = state.exercises[id];
  const record: ExerciseRecord = {
    attempts: (previous?.attempts ?? 0) + 1,
    correct: (previous?.correct ?? false) || correct,
    firstTry: previous ? previous.firstTry : correct,
    at: now.toISOString(),
  };
  return markStudyDay({ ...state, exercises: { ...state.exercises, [id]: record } }, now);
}

function shiftDay(day: string, delta: number): string {
  const [year, month, date] = day.split('-').map(Number);
  return localDay(new Date(year!, month! - 1, date! + delta));
}

/** Consecutive study days ending today, or yesterday if today has no activity yet. */
export function currentStreak(days: readonly string[], now: Date): number {
  const set = new Set(days);
  let cursor = localDay(now);
  if (!set.has(cursor)) {
    cursor = shiftDay(cursor, -1);
    if (!set.has(cursor)) return 0;
  }
  let streak = 0;
  while (set.has(cursor)) {
    streak++;
    cursor = shiftDay(cursor, -1);
  }
  return streak;
}

export function longestStreak(days: readonly string[]): number {
  const sorted = [...new Set(days)].sort();
  let best = 0;
  let run = 0;
  let previous: string | undefined;
  for (const day of sorted) {
    run = previous && shiftDay(previous, 1) === day ? run + 1 : 1;
    best = Math.max(best, run);
    previous = day;
  }
  return best;
}

export interface Completion {
  done: number;
  total: number;
  percent: number;
  complete: boolean;
}

export function completion(state: ProgressState, ids: readonly string[]): Completion {
  const done = ids.filter((id) => state.exercises[id]?.correct).length;
  const total = ids.length;
  return {
    done,
    total,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
    complete: total > 0 && done === total,
  };
}

export interface TagStat {
  tag: string;
  answered: number;
  firstTry: number;
  accuracy: number;
}

/**
 * First-try accuracy per topic tag, weakest first. Tags with fewer than
 * `minAnswered` answered exercises are left out: too little to judge.
 */
export function weakTags(
  state: ProgressState,
  exercises: readonly { id: string; tags: readonly string[] }[],
  minAnswered = 3,
): TagStat[] {
  const stats = new Map<string, { answered: number; firstTry: number }>();
  for (const exercise of exercises) {
    const record = state.exercises[exercise.id];
    if (!record) continue;
    for (const tag of exercise.tags) {
      const stat = stats.get(tag) ?? { answered: 0, firstTry: 0 };
      stat.answered++;
      if (record.firstTry) stat.firstTry++;
      stats.set(tag, stat);
    }
  }
  return [...stats.entries()]
    .filter(([, stat]) => stat.answered >= minAnswered)
    .map(([tag, stat]) => ({ tag, ...stat, accuracy: stat.firstTry / stat.answered }))
    .sort((a, b) => a.accuracy - b.accuracy || b.answered - a.answered);
}
