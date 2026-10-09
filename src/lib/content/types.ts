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

export interface DialogueLine {
  speaker: string;
  text: string;
  en?: string;
}

export interface MissionStep {
  lines: DialogueLine[];
  task: ClientExercise;
  you?: { text: string; en?: string };
}

export type MissionIcon = 'bakery' | 'train' | 'doctor' | 'restaurant' | 'home' | 'work';

/** A mission as listed: enough to show it and to tell whether it is done. */
export interface MissionSummary {
  /** File name without extension, e.g. "baeckerei". */
  id: string;
  href: string;
  title: string;
  titleDe: string;
  level: string;
  minutes: number;
  icon: MissionIcon;
  objective: string;
  /** Keys of the chapters it draws on. */
  lessonKeys: string[];
  /** Ids of its tasks, as stored in progress. */
  taskIds: string[];
}

export interface ClientMission extends MissionSummary {
  scene: string;
  lessons: { title: string; href: string }[];
  phrases: { de: string; en: string }[];
  practised: string[];
  steps: MissionStep[];
  outro: DialogueLine[];
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
