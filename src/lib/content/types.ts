import type { Exercise, VocabItem } from './schema';

/**
 * Serialisable shapes handed from Astro pages to client components.
 * Ids here are global: "<lessonKey>.<localId>", e.g. "a2.01.mc1".
 */

export type ClientExercise = Exercise & { lessonKey: string };

export interface ClientExerciseSet {
  title: string;
  instructions?: string;
  items: ClientExercise[];
}

export type ClientVocabItem = VocabItem & { lessonKey: string };

export interface ExerciseRef {
  id: string;
  tags: string[];
}

export interface LessonSummary {
  key: string;
  level: string;
  slug: string;
  href: string;
  title: string;
  titleDe?: string;
  summary: string;
  order: number;
  minutes: number;
  topics: string[];
  exercises: ExerciseRef[];
  vocabIds: string[];
}

export interface LevelSummary {
  id: string;
  title: string;
  name: string;
  description: string;
  status: 'active' | 'planned';
  href: string;
  lessons: LessonSummary[];
}
