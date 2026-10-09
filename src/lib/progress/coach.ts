import type { Course, CourseLesson, CourseLevel } from '../content/course';
import type { MissionSummary } from '../content/types';
import { bestAttempt, type QuizHistory } from '../quiz/score';
import { dueCards, type ReviewState } from '../srs/scheduler';
import { url } from '../url';
import { completion, longestStreak, weakTags, type ProgressState } from './logic';

/**
 * What to do next, and which milestones have been reached. Every rule here is a
 * plain comparison on the learner's stored answers, and every suggestion carries
 * the reason it was made, so nothing is recommended that cannot be explained.
 */

export interface Learner {
  progress: ProgressState;
  review: ReviewState;
  quizzes: QuizHistory;
  /** Level id chosen in settings, if any. */
  level?: string;
}

/** With this many cards due again (not counting new ones), reviewing comes before anything new. */
export const REVIEW_FIRST = 10;
/** A topic counts as a trouble spot below this first-try accuracy, once it has enough answers. */
const WEAK_ACCURACY = 0.7;
const WEAK_MIN_ANSWERED = 4;

const lessonDone = (progress: ProgressState, lesson: CourseLesson) =>
  completion(progress, lesson.exercises.map((exercise) => exercise.id));

const levelComplete = (progress: ProgressState, level: CourseLevel) =>
  level.lessons.length > 0 && level.lessons.every((lesson) => lessonDone(progress, lesson).complete);

export const missionComplete = (progress: ProgressState, mission: MissionSummary) =>
  completion(progress, mission.taskIds).complete;

/** Nothing stored and no level chosen: this browser has not been used to learn yet. */
export function isNewLearner(learner: Learner): boolean {
  return !learner.level && Object.keys(learner.progress.exercises).length === 0 && learner.progress.days.length === 0;
}

/**
 * The level to work on: the one chosen in settings, or else the level of the
 * exercise answered most recently, or else the first. A finished level hands
 * over to the next one that still has chapters to do.
 */
export function currentLevel(course: Course, learner: Learner): CourseLevel | undefined {
  const active = course.levels.filter((level) => level.status === 'active' && level.lessons.length > 0);
  let start = active.findIndex((level) => level.id === learner.level);
  if (start < 0) {
    let latest = '';
    active.forEach((level, index) => {
      for (const lesson of level.lessons) {
        for (const exercise of lesson.exercises) {
          const at = learner.progress.exercises[exercise.id]?.at;
          if (at && at > latest) {
            latest = at;
            start = index;
          }
        }
      }
    });
  }
  start = Math.max(start, 0);
  return active.slice(start).find((level) => !levelComplete(learner.progress, level)) ?? active[active.length - 1];
}

export type SuggestionKind = 'review' | 'lesson' | 'checkpoint' | 'weak' | 'mission' | 'exam';

export interface Suggestion {
  kind: SuggestionKind;
  /** What it is, e.g. the chapter title. */
  title: string;
  /** Button text: what happens on click. */
  action: string;
  /** Why this is suggested, from the learner's own data. */
  reason: string;
  href: string;
  minutes: number;
}

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** Suggestions in order of usefulness; the first is the one to show most prominently. */
export function suggest(course: Course, learner: Learner, now: Date): Suggestion[] {
  const { progress } = learner;
  const level = currentLevel(course, learner);
  if (!level) return [];
  const suggestions: Suggestion[] = [];

  const dueNow = dueCards(learner.review, now);
  const due = dueNow.length;
  // Cards never reviewed are new material, not something about to be forgotten.
  const seen = dueNow.filter(([, card]) => card.reps > 0).length;
  const reviewFirst = seen >= REVIEW_FIRST;
  const review: Suggestion = {
    kind: 'review',
    title: `Review ${plural(due, 'card')}`,
    action: 'Start review',
    reason: reviewFirst
      ? `${seen} cards you have seen before are due. Going over them before anything new is what makes them stay.`
      : seen === 0
        ? `${plural(due, 'new card')} from your chapters and missions, waiting for a first look.`
        : `${plural(seen, 'card is', 'cards are')} due again, timed for just before you would forget${seen < due ? `, and ${due - seen} are new` : ''}.`,
    href: url('review/'),
    minutes: Math.max(1, Math.round(due / 4)),
  };
  if (reviewFirst) suggestions.push(review);

  const next = level.lessons.find((lesson) => !lessonDone(progress, lesson).complete);
  if (next) {
    const state = lessonDone(progress, next);
    const left = state.total - state.done;
    suggestions.push({
      kind: 'lesson',
      title: next.title,
      action: state.done > 0 ? 'Continue chapter' : 'Start chapter',
      reason:
        state.done > 0
          ? `You have solved ${state.done} of ${state.total} exercises in this chapter. ${left} to go.`
          : `The next chapter of ${level.title}.`,
      href: state.done > 0 ? `${next.href}#practice` : next.href,
      // A started chapter needs time for what is left, not for the whole of it.
      minutes: state.done > 0 ? Math.max(2, Math.round((next.minutes * left) / state.total)) : next.minutes,
    });
  }

  if (due > 0 && !reviewFirst) suggestions.push(review);

  const unit = level.units.find(
    (candidate) =>
      candidate.checkpointId &&
      candidate.checkpointHref &&
      !bestAttempt(learner.quizzes, candidate.checkpointId)?.passed &&
      level.lessons.some((lesson) => lesson.unit === candidate.number) &&
      level.lessons.filter((lesson) => lesson.unit === candidate.number).every((lesson) => lessonDone(progress, lesson).complete),
  );
  if (unit) {
    suggestions.push({
      kind: 'checkpoint',
      title: unit.title ? `Checkpoint: ${unit.title}` : 'Unit checkpoint',
      action: 'Take the checkpoint',
      reason: `You finished every chapter of unit ${unit.number}. The checkpoint tests it with no hints.`,
      href: unit.checkpointHref!,
      minutes: 8,
    });
  }

  const lessons = course.levels.flatMap((candidate) => candidate.lessons);
  const weak = weakTags(progress, lessons.flatMap((lesson) => lesson.exercises), WEAK_MIN_ANSWERED).find(
    (tag) => tag.accuracy < WEAK_ACCURACY,
  );
  if (weak) {
    // The chapter where this topic went wrong most often.
    const misses = (lesson: CourseLesson) =>
      lesson.exercises.filter((exercise) => exercise.tags.includes(weak.tag) && progress.exercises[exercise.id]?.firstTry === false).length;
    const home = lessons.reduce((best, lesson) => (misses(lesson) > misses(best) ? lesson : best));
    suggestions.push({
      kind: 'weak',
      title: `Trouble spot: ${weak.tag}`,
      action: 'Practise this topic',
      reason: `You got ${weak.firstTry} of ${weak.answered} right first time on “${weak.tag}”.`,
      href: `${home.href}?tag=${encodeURIComponent(weak.tag)}#practice`,
      minutes: 5,
    });
  }

  // A mission is offered once the chapters of this level it draws on are finished.
  const open = new Set(level.lessons.filter((lesson) => !lessonDone(progress, lesson).complete).map((lesson) => lesson.key));
  const mission = course.missions.find(
    (candidate) =>
      candidate.level === level.id && !missionComplete(progress, candidate) && !candidate.lessonKeys.some((key) => open.has(key)),
  );
  if (mission) {
    suggestions.push({
      kind: 'mission',
      title: `Mission: ${mission.titleDe}`,
      action: 'Start mission',
      reason:
        mission.lessonKeys.length > 0
          ? 'You have finished the chapters this situation draws on. Time to use them.'
          : 'A real situation to try what you know.',
      href: mission.href,
      minutes: mission.minutes,
    });
  }

  // A finished level whose mock exam has not been passed yet.
  const examLevel = [...course.levels]
    .reverse()
    .find(
      (candidate) =>
        candidate.exams.length > 0 &&
        levelComplete(progress, candidate) &&
        !candidate.exams.some((exam) => bestAttempt(learner.quizzes, exam.id)?.passed),
    );
  if (examLevel) {
    const exam = examLevel.exams.find((candidate) => !bestAttempt(learner.quizzes, candidate.id)) ?? examLevel.exams[0]!;
    suggestions.push({
      kind: 'exam',
      title: `${examLevel.title} mock exam: ${exam.title}`,
      action: 'Open the mock exam',
      reason: `Every ${examLevel.title} chapter is finished. A full mock exam shows whether it holds under time pressure.`,
      href: exam.href,
      minutes: exam.minutes,
    });
  }

  return suggestions;
}

export interface Milestone {
  id: string;
  /** Short German text for the stamp. */
  stamp: string;
  title: string;
  current: number;
  target: number;
  earned: boolean;
}

/** A word counts as known once it has been reviewed and is not being relearned. */
export function wordsKnown(review: ReviewState): number {
  return Object.values(review).filter((card) => card.kind !== 'exercise' && card.reps > 0 && card.state === 2).length;
}

/** Every milestone with how far along it is. All of it is counted from stored answers. */
export function milestones(course: Course, learner: Learner): Milestone[] {
  const { progress, quizzes } = learner;
  const lessons = course.levels.flatMap((level) => level.lessons);
  const solved = Object.values(progress.exercises).filter((record) => record.correct).length;
  const chapters = lessons.filter((lesson) => lessonDone(progress, lesson).complete).length;
  const streak = longestStreak(progress.days);
  const words = wordsKnown(learner.review);
  const passed = (prefix: string) =>
    Object.keys(quizzes).filter((id) => id.startsWith(prefix) && bestAttempt(quizzes, id)?.passed).length;
  const missions = course.missions.filter((mission) => missionComplete(progress, mission)).length;

  const list: Omit<Milestone, 'earned'>[] = [
    { id: 'start', stamp: 'Los geht’s', title: 'Solve your first exercise', current: solved, target: 1 },
    { id: 'solved-50', stamp: '50 Aufgaben', title: 'Solve 50 exercises', current: solved, target: 50 },
    { id: 'solved-250', stamp: '250 Aufgaben', title: 'Solve 250 exercises', current: solved, target: 250 },
    { id: 'solved-1000', stamp: '1000 Aufgaben', title: 'Solve 1,000 exercises', current: solved, target: 1000 },
    { id: 'chapter-1', stamp: 'Erstes Kapitel', title: 'Finish a chapter', current: chapters, target: 1 },
    { id: 'chapter-10', stamp: 'Zehn Kapitel', title: 'Finish 10 chapters', current: chapters, target: 10 },
    { id: 'streak-3', stamp: 'Drei Tage', title: 'Study 3 days in a row', current: streak, target: 3 },
    { id: 'streak-7', stamp: 'Eine Woche', title: 'Study 7 days in a row', current: streak, target: 7 },
    { id: 'streak-30', stamp: 'Ein Monat', title: 'Study 30 days in a row', current: streak, target: 30 },
    { id: 'words-25', stamp: '25 Wörter', title: 'Know 25 words in review', current: words, target: 25 },
    { id: 'words-100', stamp: '100 Wörter', title: 'Know 100 words in review', current: words, target: 100 },
    { id: 'words-500', stamp: '500 Wörter', title: 'Know 500 words in review', current: words, target: 500 },
    { id: 'checkpoint', stamp: 'Kontrolle', title: 'Pass a unit checkpoint', current: passed('checkpoint:'), target: 1 },
    { id: 'mission-1', stamp: 'Unterwegs', title: 'Complete a mission', current: missions, target: 1 },
  ];
  if (course.missions.length > 1) {
    list.push({ id: 'mission-all', stamp: 'Alle Missionen', title: 'Complete every mission', current: missions, target: course.missions.length });
  }
  for (const level of course.levels) {
    if (level.lessons.length === 0) continue;
    const finished = level.lessons.filter((lesson) => lessonDone(progress, lesson).complete).length;
    list.push({ id: `level-${level.id}`, stamp: `${level.title} geschafft`, title: `Finish every ${level.title} chapter`, current: finished, target: level.lessons.length });
    if (level.exams.length > 0) {
      const article = level.title.startsWith('A') ? 'an' : 'a';
      list.push({ id: `exam-${level.id}`, stamp: `${level.title} bestanden`, title: `Pass ${article} ${level.title} mock exam`, current: passed(`exam:${level.id}/`), target: 1 });
    }
  }

  return list.map((milestone) => ({
    ...milestone,
    current: Math.min(milestone.current, milestone.target),
    earned: milestone.current >= milestone.target,
  }));
}

/** The milestones still open, closest to done first. */
export function upcoming(all: readonly Milestone[], count = 3): Milestone[] {
  return all
    .filter((milestone) => !milestone.earned)
    .sort((a, b) => b.current / b.target - a.current / a.target)
    .slice(0, count);
}

export function greeting(now: Date): string {
  const hour = now.getHours();
  return hour >= 5 && hour < 11 ? 'Guten Morgen' : hour >= 11 && hour < 18 ? 'Guten Tag' : 'Guten Abend';
}
