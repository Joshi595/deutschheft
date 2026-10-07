import type { ExamSkill, Exercise, Stimulus, VocabItem } from './schema';

/**
 * Serialisable shapes handed from Astro pages to client components.
 * Ids here are global: "<lessonKey>.<localId>", e.g. "a2.01.mc1".
 */

export type ClientExercise = Exercise & { lessonKey: string };

export interface ClientExerciseSet {
  title: string;
  instructions?: string;
  stimulus?: Stimulus;
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
  objectives: string[];
  unit: number;
  kind: 'grammar' | 'topic' | 'exam';
  exercises: ExerciseRef[];
  vocabIds: string[];
}

export interface UnitSummary {
  number: number;
  title: string;
  summary?: string;
  lessonKeys: string[];
  /** Link to the unit's checkpoint quiz, if the unit has enough exercises for one. */
  checkpointHref?: string;
  /** Storage id of the checkpoint's results. */
  checkpointId?: string;
}

export interface LevelSummary {
  id: string;
  title: string;
  name: string;
  description: string;
  status: 'active' | 'planned';
  href: string;
  exam?: string;
  units: UnitSummary[];
  lessons: LessonSummary[];
  exams: ExamLink[];
}

export interface ExamLink {
  id: string;
  title: string;
  description: string;
  href: string;
  minutes: number;
}

/** One timed (or untimed) section of a quiz: an exam module or a checkpoint. */
export interface QuizSection {
  /** Exam skill, or "mixed" for a checkpoint. */
  skill: ExamSkill | 'mixed';
  /** Time limit; omitted for an untimed quiz. */
  minutes?: number;
  /** Points this section contributes to the total. */
  points: number;
  parts: ClientExerciseSet[];
}

export interface ClientQuiz {
  /** Storage id for results, e.g. "exam:a1/modelltest-01" or "checkpoint:a1:2". */
  id: string;
  kind: 'exam' | 'checkpoint';
  title: string;
  description: string;
  passMark: number;
  scoring: 'total' | 'per-module';
  sections: QuizSection[];
  /** Where "back" leads. */
  backHref: string;
}
