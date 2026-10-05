import { describe, expect, it } from 'vitest';
import {
  applyAttempt,
  completion,
  currentStreak,
  emptyProgress,
  localDay,
  longestStreak,
  weakTags,
} from '../src/lib/progress/logic';

const at = (day: string, hour = 12) => new Date(`${day}T${String(hour).padStart(2, '0')}:00:00`);

describe('applyAttempt', () => {
  it('records a first-try success', () => {
    const state = applyAttempt(emptyProgress, 'a2.01.mc1', true, at('2026-10-02'));
    expect(state.exercises['a2.01.mc1']).toMatchObject({ attempts: 1, correct: true, firstTry: true });
    expect(state.days).toEqual(['2026-10-02']);
  });

  it('keeps firstTry false after a wrong first answer', () => {
    let state = applyAttempt(emptyProgress, 'x', false, at('2026-10-02'));
    state = applyAttempt(state, 'x', true, at('2026-10-02', 13));
    expect(state.exercises.x).toMatchObject({ attempts: 2, correct: true, firstTry: false });
  });

  it('never un-solves an exercise', () => {
    let state = applyAttempt(emptyProgress, 'x', true, at('2026-10-02'));
    state = applyAttempt(state, 'x', false, at('2026-10-03'));
    expect(state.exercises.x).toMatchObject({ attempts: 2, correct: true, firstTry: true });
  });

  it('does not mutate the previous state', () => {
    const before = applyAttempt(emptyProgress, 'x', true, at('2026-10-02'));
    applyAttempt(before, 'y', true, at('2026-10-03'));
    expect(Object.keys(before.exercises)).toEqual(['x']);
    expect(before.days).toEqual(['2026-10-02']);
  });
});

describe('localDay', () => {
  it('uses the local calendar date', () => {
    expect(localDay(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});

describe('streaks', () => {
  it('is zero with no activity', () => {
    expect(currentStreak([], at('2026-10-02'))).toBe(0);
  });

  it('counts consecutive days ending today', () => {
    expect(currentStreak(['2026-09-30', '2026-10-01', '2026-10-02'], at('2026-10-02'))).toBe(3);
  });

  it('still counts when today has no activity yet', () => {
    expect(currentStreak(['2026-09-30', '2026-10-01'], at('2026-10-02'))).toBe(2);
  });

  it('resets after a missed day', () => {
    expect(currentStreak(['2026-09-29', '2026-09-30'], at('2026-10-02'))).toBe(0);
  });

  it('crosses month and year boundaries', () => {
    expect(currentStreak(['2025-12-31', '2026-01-01'], at('2026-01-01'))).toBe(2);
  });

  it('finds the longest run', () => {
    expect(longestStreak(['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-10', '2026-09-11'])).toBe(3);
    expect(longestStreak([])).toBe(0);
  });
});

describe('completion', () => {
  it('counts solved exercises', () => {
    let state = applyAttempt(emptyProgress, 'a', true, at('2026-10-02'));
    state = applyAttempt(state, 'b', false, at('2026-10-02'));
    expect(completion(state, ['a', 'b', 'c', 'd'])).toEqual({ done: 1, total: 4, percent: 25, complete: false });
    expect(completion(state, ['a']).complete).toBe(true);
    expect(completion(state, [])).toEqual({ done: 0, total: 0, percent: 0, complete: false });
  });
});

describe('weakTags', () => {
  it('ranks tags by first-try accuracy and ignores thin data', () => {
    const exercises = [
      { id: '1', tags: ['weil'] },
      { id: '2', tags: ['weil'] },
      { id: '3', tags: ['weil'] },
      { id: '4', tags: ['sein'] },
      { id: '5', tags: ['sein'] },
      { id: '6', tags: ['sein'] },
      { id: '7', tags: ['dative'] },
    ];
    let state = emptyProgress;
    const now = at('2026-10-02');
    state = applyAttempt(state, '1', false, now);
    state = applyAttempt(state, '2', false, now);
    state = applyAttempt(state, '3', true, now);
    state = applyAttempt(state, '4', true, now);
    state = applyAttempt(state, '5', true, now);
    state = applyAttempt(state, '6', false, now);
    state = applyAttempt(state, '7', false, now);

    const tags = weakTags(state, exercises);
    expect(tags.map((t) => t.tag)).toEqual(['weil', 'sein']);
    expect(tags[0]).toMatchObject({ answered: 3, firstTry: 1 });
  });
});
