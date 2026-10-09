import { getCollection, type CollectionEntry } from 'astro:content';
import { isSelfAssessed } from '../grading/response';
import { seededShuffle } from '../grading/shuffle';
import { url } from '../url';
import type {
  ClientExercise,
  ClientExerciseSet,
  ClientMission,
  ClientQuiz,
  ClientVocabItem,
  ExamLink,
  LessonSummary,
  LevelSummary,
  UnitSummary,
} from './types';

/**
 * Build-time view of all content: levels, their units and lessons, each lesson's
 * exercises and vocabulary joined by lesson key, plus mock exams and the unit
 * checkpoints derived from the lessons. Pages read from here and never mention
 * a specific level or lesson themselves.
 */

export interface LessonBundle extends LessonSummary {
  entry: CollectionEntry<'lessons'>;
  sets: ClientExerciseSet[];
  vocab: ClientVocabItem[];
}

export interface LevelBundle extends LevelSummary {
  lessons: LessonBundle[];
  /** Full mock exams of this level. */
  quizzes: ClientQuiz[];
  /** Checkpoint quizzes, by unit number. */
  checkpoints: Map<number, ClientQuiz>;
}

export interface Catalog {
  levels: LevelBundle[];
  lessons: LessonBundle[];
  missions: ClientMission[];
}

/** Questions per checkpoint, spread evenly over the unit's lessons. */
const CHECKPOINT_SIZE = 12;
const CHECKPOINT_MIN = 6;

let cached: Promise<Catalog> | undefined;

export function getCatalog(): Promise<Catalog> {
  cached ??= build();
  return cached;
}

async function build(): Promise<Catalog> {
  const [levelEntries, lessonEntries, exerciseEntries, vocabEntries, examEntries, missionEntries] = await Promise.all([
    getCollection('levels'),
    getCollection('lessons'),
    getCollection('exercises'),
    getCollection('vocab'),
    getCollection('exams'),
    getCollection('missions'),
  ]);

  const lessonKeys = new Set<string>();
  for (const entry of lessonEntries) {
    if (lessonKeys.has(entry.data.key)) {
      throw new Error(`Two lessons share the key "${entry.data.key}" (${entry.id})`);
    }
    lessonKeys.add(entry.data.key);
  }

  const exercisesByLesson = indexByLesson(exerciseEntries, 'exercises', lessonKeys);
  const vocabByLesson = indexByLesson(vocabEntries, 'vocab', lessonKeys);

  const lessons: LessonBundle[] = lessonEntries.map((entry) => {
    const { key } = entry.data;
    const level = key.split('.')[0]!;
    const [folder, slug] = entry.id.split('/');
    if (folder !== level || !slug) {
      throw new Error(`Lesson "${entry.id}" has key "${key}", so it belongs in lessons/${level}/`);
    }

    const sets: ClientExerciseSet[] = (exercisesByLesson.get(key)?.data.sets ?? []).map((set) => ({
      title: set.title,
      instructions: set.instructions,
      stimulus: set.stimulus,
      items: set.items.map((item) => ({ ...item, id: `${key}.${item.id}`, lessonKey: key })),
    }));
    const vocab: ClientVocabItem[] = (vocabByLesson.get(key)?.data.items ?? []).map((item) => ({
      ...item,
      id: `${key}.${item.id}`,
      lessonKey: key,
    }));

    return {
      entry,
      key,
      level,
      slug,
      href: url(`${level}/${slug}/`),
      title: entry.data.title,
      titleDe: entry.data.titleDe,
      summary: entry.data.summary,
      order: entry.data.order,
      minutes: entry.data.minutes,
      topics: entry.data.topics,
      objectives: entry.data.objectives,
      unit: entry.data.unit,
      kind: entry.data.kind,
      exercises: sets.flatMap((set) => set.items.map((item) => ({ id: item.id, tags: item.tags }))),
      vocabIds: vocab.map((item) => item.id),
      sets,
      vocab,
    };
  });

  const levelIds = new Set(levelEntries.map((entry) => entry.id));
  for (const lesson of lessons) {
    if (!levelIds.has(lesson.level)) {
      throw new Error(`Lesson "${lesson.key}" refers to level "${lesson.level}", which has no file in content/levels/`);
    }
  }
  for (const exam of examEntries) {
    if (!levelIds.has(exam.data.level) || !exam.id.startsWith(`${exam.data.level}/`)) {
      throw new Error(`Exam "${exam.id}" has level "${exam.data.level}", so it belongs in exams/${exam.data.level}/`);
    }
  }

  const levels: LevelBundle[] = levelEntries
    .sort((a, b) => a.data.order - b.data.order)
    .map((entry) => {
      const levelLessons = lessons.filter((lesson) => lesson.level === entry.id).sort((a, b) => a.order - b.order);
      const href = url(`${entry.id}/`);

      // A level without declared units is shown as one unnamed unit.
      const declared = entry.data.units.length > 0 ? entry.data.units : [{ title: '' }];
      for (const lesson of levelLessons) {
        if (lesson.unit > declared.length) {
          throw new Error(`Lesson "${lesson.key}" is in unit ${lesson.unit}, but level "${entry.id}" declares ${declared.length}`);
        }
      }

      const checkpoints = new Map<number, ClientQuiz>();
      const units: UnitSummary[] = declared.map((unit, index) => {
        const number = index + 1;
        const unitLessons = levelLessons.filter((lesson) => lesson.unit === number);
        const quiz = buildCheckpoint(entry.id, entry.data.title, number, unit.title, unitLessons, href);
        if (quiz) checkpoints.set(number, quiz);
        return {
          number,
          title: unit.title,
          summary: unit.summary,
          lessonKeys: unitLessons.map((lesson) => lesson.key),
          checkpointHref: quiz && url(`${entry.id}/checkpoint/${number}/`),
          checkpointId: quiz?.id,
        };
      });

      const quizzes = examEntries
        .filter((exam) => exam.data.level === entry.id)
        .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
        .map((exam) => buildExam(exam, href));

      const exams: ExamLink[] = quizzes.map((quiz) => ({
        id: quiz.id,
        title: quiz.title,
        description: quiz.description,
        href: url(`${entry.id}/exam/${quiz.id.split('/')[1]}/`),
        minutes: quiz.sections.reduce((sum, section) => sum + (section.minutes ?? 0), 0),
      }));

      return {
        id: entry.id,
        title: entry.data.title,
        name: entry.data.name,
        description: entry.data.description,
        status: entry.data.status,
        exam: entry.data.exam,
        href,
        units,
        lessons: levelLessons,
        exams,
        quizzes,
        checkpoints,
      };
    });

  const byKey = new Map(lessons.map((lesson) => [lesson.key, lesson]));
  const missions: ClientMission[] = missionEntries
    .sort((a, b) => a.data.level.localeCompare(b.data.level) || a.data.order - b.data.order)
    .map((entry) => {
      const { lessons: lessonKeys, steps, order: _order, ...data } = entry.data;
      if (!levelIds.has(data.level)) throw new Error(`Mission "${entry.id}" has level "${data.level}", which does not exist`);
      for (const key of lessonKeys) {
        if (!byKey.has(key)) throw new Error(`Mission "${entry.id}" refers to lesson "${key}", which does not exist`);
      }
      // Tasks are stored and reviewed like lesson exercises, under a key of their own.
      const lessonKey = `mission.${entry.id}`;
      const tasks = steps.map((step) => ({ ...step, task: { ...step.task, id: `${lessonKey}.${step.task.id}`, lessonKey } }));
      return {
        ...data,
        id: entry.id,
        href: url(`missions/${entry.id}/`),
        lessonKeys,
        lessons: lessonKeys.map((key) => ({ title: byKey.get(key)!.title, href: byKey.get(key)!.href })),
        taskIds: tasks.map((step) => step.task.id),
        steps: tasks,
      };
    });

  return { levels, lessons: levels.flatMap((level) => level.lessons), missions };
}

function indexByLesson<C extends 'exercises' | 'vocab'>(
  entries: CollectionEntry<C>[],
  name: C,
  lessonKeys: Set<string>,
): Map<string, CollectionEntry<C>> {
  const map = new Map<string, CollectionEntry<C>>();
  for (const entry of entries) {
    const key = entry.data.lesson;
    if (!lessonKeys.has(key)) {
      throw new Error(`${name}/${entry.id} refers to lesson "${key}", which does not exist`);
    }
    if (map.has(key)) {
      throw new Error(`Lesson "${key}" has more than one ${name} file`);
    }
    map.set(key, entry);
  }
  return map;
}

function buildExam(entry: CollectionEntry<'exams'>, backHref: string): ClientQuiz {
  const lessonKey = `${entry.data.level}.exam`;
  return {
    id: `exam:${entry.id}`,
    kind: 'exam',
    title: entry.data.title,
    description: entry.data.description,
    passMark: entry.data.passMark,
    scoring: entry.data.scoring,
    backHref,
    sections: entry.data.modules.map((module) => ({
      skill: module.skill,
      minutes: module.minutes,
      points: module.points,
      parts: module.parts.map((part) => ({
        title: part.title,
        instructions: part.instructions,
        stimulus: part.stimulus,
        items: part.items.map((item) => ({ ...item, id: `${entry.id}.${item.id}`, lessonKey })),
      })),
    })),
  };
}

/**
 * A short mixed quiz over one unit, drawn from its lessons' own exercises.
 * Only items the grader can mark, and only ones that stand on their own
 * (no shared reading text).
 */
function buildCheckpoint(
  level: string,
  levelTitle: string,
  number: number,
  title: string,
  lessons: LessonBundle[],
  backHref: string,
): ClientQuiz | undefined {
  const teaching = lessons.filter((lesson) => lesson.kind !== 'exam');
  if (teaching.length === 0) return undefined;
  const perLesson = Math.max(2, Math.ceil(CHECKPOINT_SIZE / teaching.length));

  const parts: ClientExerciseSet[] = teaching
    .map((lesson) => {
      const eligible: ClientExercise[] = lesson.sets
        .filter((set) => !set.stimulus)
        .flatMap((set) => set.items)
        .filter((item) => !item.stimulus && !isSelfAssessed(item) && item.type !== 'writing');
      return {
        title: lesson.title,
        items: seededShuffle(eligible, `${level}-${number}-${lesson.key}`).slice(0, perLesson),
      };
    })
    .filter((part) => part.items.length > 0);

  if (parts.reduce((sum, part) => sum + part.items.length, 0) < CHECKPOINT_MIN) return undefined;

  return {
    id: `checkpoint:${level}:${number}`,
    kind: 'checkpoint',
    title: title ? `Checkpoint: ${title}` : `${levelTitle} checkpoint`,
    description: 'A short mixed quiz over this unit. No hints, no second tries; you see the results at the end.',
    passMark: 60,
    scoring: 'total',
    backHref,
    sections: [{ skill: 'mixed', points: 100, parts }],
  };
}

/** Strip a lesson bundle down to what client components may receive. */
export function toSummary(lesson: LessonBundle): LessonSummary {
  const { entry: _entry, sets: _sets, vocab: _vocab, ...summary } = lesson;
  return summary;
}

export function toLevelSummary(level: LevelBundle): LevelSummary {
  const { quizzes: _quizzes, checkpoints: _checkpoints, ...summary } = level;
  return { ...summary, lessons: level.lessons.map(toSummary) };
}

export function toLevelSummaries(catalog: Catalog): LevelSummary[] {
  return catalog.levels.map(toLevelSummary);
}
