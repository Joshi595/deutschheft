import { describe, expect, it } from 'vitest';
import { packCourse, unpackCourse, type Course } from '../src/lib/content/course';
import { currentLevel, greeting, isNewLearner, milestones, suggest, upcoming, type Learner } from '../src/lib/progress/coach';
import { addXp, applyAttempt, attemptXp, emptyProgress, recentDays, totalXp, XP, xpOn, type ProgressState } from '../src/lib/progress/logic';
import { enroll, schedule } from '../src/lib/srs/scheduler';

const now = new Date('2026-10-09T10:00:00');

const lesson = (key: string, unit: number, count = 2, tag = 'verbs') => ({
  key,
  href: `/${key}/`,
  title: `Chapter ${key}`,
  summary: '',
  minutes: 30,
  unit,
  exercises: Array.from({ length: count }, (_, index) => ({ id: `${key}.x${index}`, tags: [tag] })),
});

const course: Course = {
  levels: [
    {
      id: 'a1',
      title: 'A1',
      name: 'Beginner',
      href: '/a1/',
      status: 'active',
      units: [{ number: 1, title: 'First contact', checkpointHref: '/a1/checkpoint/1/', checkpointId: 'checkpoint:a1:1' }, { number: 2, title: 'Things' }],
      lessons: [lesson('a1.01', 1), lesson('a1.02', 1), lesson('a1.03', 2)],
      exams: [{ id: 'exam:a1/modelltest-01', href: '/a1/exam/modelltest-01/', title: 'Modelltest 01', minutes: 80 }],
    },
    { id: 'a2', title: 'A2', name: 'Elementary', href: '/a2/', status: 'active', units: [{ number: 1, title: '' }], lessons: [lesson('a2.01', 1, 6, 'dativ')], exams: [] },
    { id: 'b2', title: 'B2', name: 'Upper intermediate', href: '/b2/', status: 'planned', units: [], lessons: [], exams: [] },
  ],
  missions: [
    { id: 'baeckerei', href: '/missions/baeckerei/', title: 'At the bakery', titleDe: 'In der Bäckerei', level: 'a1', minutes: 6, icon: 'bakery', objective: '', lessonKeys: ['a1.01'], taskIds: ['mission.baeckerei.t1'] },
  ],
};

const fresh: Learner = { progress: emptyProgress, review: {}, quizzes: {} };

function solve(progress: ProgressState, ids: string[], correct = true): ProgressState {
  return ids.reduce((state, id) => applyAttempt(state, id, correct, now), progress);
}
const ids = (key: string) => course.levels.flatMap((level) => level.lessons).find((item) => item.key === key)!.exercises.map((exercise) => exercise.id);

describe('points', () => {
  it('pays for a first solve only, and less after a miss', () => {
    expect(attemptXp(undefined, true)).toBe(XP.firstTry);
    expect(attemptXp(undefined, false)).toBe(0);
    const missed = applyAttempt(emptyProgress, 'x', false, now).exercises.x;
    expect(attemptXp(missed, true)).toBe(XP.afterMiss);
    const solved = applyAttempt(emptyProgress, 'x', true, now).exercises.x;
    expect(attemptXp(solved, true)).toBe(0);
  });

  it('adds up per local day and reads data saved before points existed', () => {
    let state = addXp(emptyProgress, 10, now);
    state = addXp(state, 5, now);
    state = addXp(state, 0, now);
    expect(xpOn(state, '2026-10-09')).toBe(15);
    expect(totalXp(state)).toBe(15);
    expect(xpOn({ exercises: {}, days: [] }, '2026-10-09')).toBe(0);
    expect(emptyProgress.xp).toBeUndefined();
  });

  it('lists recent days oldest first, ending today', () => {
    const state = addXp(applyAttempt(emptyProgress, 'x', true, now), 10, now);
    const days = recentDays(state, now, 7);
    expect(days.map((day) => day.day)).toEqual(['2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09']);
    expect(days.at(-1)).toMatchObject({ xp: 10, studied: true });
    expect(days[0]).toMatchObject({ xp: 0, studied: false });
  });
});

describe('course data', () => {
  it('survives packing, and cannot close its script element', () => {
    const tricky: Course = { ...course, missions: [{ ...course.missions[0]!, objective: '</script><b>' }] };
    const packed = packCourse(tricky);
    expect(packed).not.toContain('<');
    expect(unpackCourse(packed)).toEqual(tricky);
  });
});

describe('currentLevel', () => {
  it('starts a new learner at the first level and knows they are new', () => {
    expect(isNewLearner(fresh)).toBe(true);
    expect(currentLevel(course, fresh)?.id).toBe('a1');
  });

  it('uses the chosen level', () => {
    expect(currentLevel(course, { ...fresh, level: 'a2' })?.id).toBe('a2');
    expect(isNewLearner({ ...fresh, level: 'a2' })).toBe(false);
  });

  it('infers the level from the latest answer when none was chosen', () => {
    const learner = { ...fresh, progress: solve(emptyProgress, ['a2.01.x0']) };
    expect(currentLevel(course, learner)?.id).toBe('a2');
    expect(isNewLearner(learner)).toBe(false);
  });

  it('moves on when the chosen level is finished, and never to a planned level', () => {
    const a1Done = solve(emptyProgress, [...ids('a1.01'), ...ids('a1.02'), ...ids('a1.03')]);
    expect(currentLevel(course, { ...fresh, level: 'a1', progress: a1Done })?.id).toBe('a2');
    const allDone = solve(a1Done, ids('a2.01'));
    expect(currentLevel(course, { ...fresh, level: 'a1', progress: allDone })?.id).toBe('a2');
  });
});

describe('suggest', () => {
  it('gives a new learner one thing: the first chapter of their level', () => {
    const list = suggest(course, fresh, now);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ kind: 'lesson', title: 'Chapter a1.01', action: 'Start chapter', href: '/a1.01/' });
    expect(suggest(course, { ...fresh, level: 'a2' }, now)[0]).toMatchObject({ title: 'Chapter a2.01' });
  });

  it('resumes a started chapter at its exercises', () => {
    const learner = { ...fresh, progress: solve(emptyProgress, ['a1.01.x0']) };
    const first = suggest(course, learner, now)[0]!;
    expect(first).toMatchObject({ kind: 'lesson', action: 'Continue chapter', href: '/a1.01/#practice', minutes: 15 });
    expect(first.reason).toContain('1 of 2');
  });

  it('puts review first only when a pile of cards seen before is due', () => {
    const refs = Array.from({ length: 12 }, (_, index) => `w${index}`);
    const yesterday = new Date(now.getTime() - 86_400_000);
    const reviewedOnce = (count: number) =>
      Object.fromEntries(
        Object.entries(enroll({}, 'vocab', refs.slice(0, count), yesterday)).map(([id, card]) => [id, schedule(card, 'again', yesterday)]),
      );

    const few = { ...fresh, review: reviewedOnce(2) };
    expect(suggest(course, few, now).map((item) => item.kind)).toEqual(['lesson', 'review']);

    const many = { ...fresh, review: reviewedOnce(12) };
    const list = suggest(course, many, now);
    expect(list.map((item) => item.kind)).toEqual(['review', 'lesson']);
    expect(list[0]!.title).toBe('Review 12 cards');
  });

  it('does not let brand-new cards jump the queue', () => {
    const untouched = { ...fresh, review: enroll({}, 'vocab', Array.from({ length: 25 }, (_, index) => `w${index}`), now) };
    const list = suggest(course, untouched, now);
    expect(list.map((item) => item.kind)).toEqual(['lesson', 'review']);
    expect(list[1]!.reason).toContain('25 new cards');
  });

  it('offers the checkpoint once a unit is finished, until it is passed', () => {
    const progress = solve(emptyProgress, [...ids('a1.01'), ...ids('a1.02')]);
    expect(suggest(course, { ...fresh, progress }, now).map((item) => item.kind)).toContain('checkpoint');
    const quizzes = { 'checkpoint:a1:1': [{ at: now.toISOString(), total: 80, passed: true, sections: [] }] };
    expect(suggest(course, { ...fresh, progress, quizzes }, now).map((item) => item.kind)).not.toContain('checkpoint');
  });

  it('offers a mission only after the chapters it draws on', () => {
    expect(suggest(course, fresh, now).map((item) => item.kind)).not.toContain('mission');
    const ready = { ...fresh, progress: solve(emptyProgress, ids('a1.01')) };
    expect(suggest(course, ready, now).find((item) => item.kind === 'mission')?.href).toBe('/missions/baeckerei/');
    const done = { ...fresh, progress: solve(ready.progress, ['mission.baeckerei.t1']) };
    expect(suggest(course, done, now).map((item) => item.kind)).not.toContain('mission');
  });

  it('names a trouble spot from first-try misses and links to the chapter where they happened', () => {
    let progress = solve(emptyProgress, ids('a2.01').slice(0, 4), false);
    progress = solve(progress, ids('a2.01').slice(4));
    const weak = suggest(course, { ...fresh, progress }, now).find((item) => item.kind === 'weak')!;
    expect(weak.title).toBe('Trouble spot: dativ');
    expect(weak.reason).toContain('2 of 6');
    expect(weak.href).toBe('/a2.01/?tag=dativ#practice');
  });

  it('says nothing about weaknesses without enough answers', () => {
    const progress = solve(emptyProgress, ['a2.01.x0', 'a2.01.x1'], false);
    expect(suggest(course, { ...fresh, progress }, now).map((item) => item.kind)).not.toContain('weak');
  });

  it('suggests the mock exam for a finished level', () => {
    const progress = solve(emptyProgress, [...ids('a1.01'), ...ids('a1.02'), ...ids('a1.03')]);
    const list = suggest(course, { ...fresh, progress }, now);
    expect(list[0]).toMatchObject({ kind: 'lesson', title: 'Chapter a2.01' });
    expect(list.find((item) => item.kind === 'exam')?.href).toBe('/a1/exam/modelltest-01/');
  });
});

describe('milestones', () => {
  it('are all open for a new learner', () => {
    const all = milestones(course, fresh);
    expect(all.every((milestone) => !milestone.earned && milestone.current === 0)).toBe(true);
    expect(new Set(all.map((milestone) => milestone.id)).size).toBe(all.length);
    expect(all.some((milestone) => milestone.id === 'level-b2')).toBe(false);
  });

  it('are earned from stored answers, never past their target', () => {
    const progress = solve(emptyProgress, [...ids('a1.01'), 'mission.baeckerei.t1']);
    const byId = Object.fromEntries(milestones(course, { ...fresh, progress }).map((milestone) => [milestone.id, milestone]));
    expect(byId.start).toMatchObject({ earned: true, current: 1 });
    expect(byId['chapter-1']!.earned).toBe(true);
    expect(byId['mission-1']!.earned).toBe(true);
    expect(byId['solved-50']).toMatchObject({ earned: false, current: 3 });
    expect(byId['level-a1']).toMatchObject({ earned: false, current: 1, target: 3 });
  });

  it('does not count a wrong answer as solved', () => {
    const progress = solve(emptyProgress, ['a1.01.x0'], false);
    expect(milestones(course, { ...fresh, progress }).find((milestone) => milestone.id === 'start')!.earned).toBe(false);
  });

  it('lists the closest open ones first', () => {
    const progress = solve(emptyProgress, ['a1.01.x0']);
    const next = upcoming(milestones(course, { ...fresh, progress }), 2);
    expect(next).toHaveLength(2);
    expect(next.every((milestone) => !milestone.earned)).toBe(true);
    expect(next[0]!.current / next[0]!.target).toBeGreaterThanOrEqual(next[1]!.current / next[1]!.target);
  });
});

describe('greeting', () => {
  it('follows the time of day', () => {
    expect(greeting(new Date(2026, 9, 9, 7))).toBe('Guten Morgen');
    expect(greeting(new Date(2026, 9, 9, 14))).toBe('Guten Tag');
    expect(greeting(new Date(2026, 9, 9, 21))).toBe('Guten Abend');
    expect(greeting(new Date(2026, 9, 9, 2))).toBe('Guten Abend');
  });
});
