import { getCollection, type CollectionEntry } from 'astro:content';
import { url } from '../url';
import type { ClientExerciseSet, ClientVocabItem, LessonSummary, LevelSummary } from './types';

/**
 * Build-time view of all content: levels, their lessons, and each lesson's
 * exercises and vocabulary joined by lesson key. Pages read from here and never
 * mention a specific level or lesson themselves.
 */

export interface LessonBundle extends LessonSummary {
  entry: CollectionEntry<'lessons'>;
  sets: ClientExerciseSet[];
  vocab: ClientVocabItem[];
}

export interface Catalog {
  levels: (LevelSummary & { lessons: LessonBundle[] })[];
  lessons: LessonBundle[];
}

let cached: Promise<Catalog> | undefined;

export function getCatalog(): Promise<Catalog> {
  cached ??= build();
  return cached;
}

async function build(): Promise<Catalog> {
  const [levelEntries, lessonEntries, exerciseEntries, vocabEntries] = await Promise.all([
    getCollection('levels'),
    getCollection('lessons'),
    getCollection('exercises'),
    getCollection('vocab'),
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

  const levels = levelEntries
    .sort((a, b) => a.data.order - b.data.order)
    .map((entry) => ({
      id: entry.id,
      ...entry.data,
      href: url(`${entry.id}/`),
      lessons: lessons.filter((lesson) => lesson.level === entry.id).sort((a, b) => a.order - b.order),
    }));

  return { levels, lessons: levels.flatMap((level) => level.lessons) };
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

/** Strip a lesson bundle down to what client components may receive. */
export function toSummary(lesson: LessonBundle): LessonSummary {
  const { entry: _entry, sets: _sets, vocab: _vocab, ...summary } = lesson;
  return summary;
}

export function toLevelSummaries(catalog: Catalog): LevelSummary[] {
  return catalog.levels.map((level) => ({ ...level, lessons: level.lessons.map(toSummary) }));
}
