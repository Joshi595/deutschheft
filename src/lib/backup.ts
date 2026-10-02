import { emptyNotebook, type NotebookState } from './notebook/logic';
import { emptyProgress, type ProgressState } from './progress/logic';
import type { QuizHistory } from './quiz/score';
import type { ReviewState } from './srs/scheduler';

/** Export and import of everything the learner has stored in the browser. */

export const BACKUP_APP = 'learn-german';
export const BACKUP_VERSION = 2;

export interface BackupData {
  progress: ProgressState;
  review: ReviewState;
  notebook: NotebookState;
  /** Mock exam and checkpoint results. Absent in version 1 backups. */
  quizzes: QuizHistory;
}

export interface Backup extends BackupData {
  app: typeof BACKUP_APP;
  version: number;
  exportedAt: string;
}

export function buildBackup(data: BackupData, now: Date): Backup {
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: now.toISOString(), ...data };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Parse a backup file. Throws an Error with a readable message if it is not one. */
export function parseBackup(json: string): BackupData {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error('This file is not valid JSON.');
  }
  if (!isRecord(raw) || raw.app !== BACKUP_APP) {
    throw new Error('This file is not a Learn German backup.');
  }
  if (typeof raw.version !== 'number' || raw.version > BACKUP_VERSION) {
    throw new Error('This backup was made by a newer version of the app.');
  }

  const progress = isRecord(raw.progress) ? raw.progress : {};
  const notebook = isRecord(raw.notebook) ? raw.notebook : {};

  return {
    progress: {
      exercises: isRecord(progress.exercises) ? (progress.exercises as ProgressState['exercises']) : emptyProgress.exercises,
      days: Array.isArray(progress.days) ? progress.days.filter((day): day is string => typeof day === 'string') : [],
    },
    review: isRecord(raw.review) ? (raw.review as ReviewState) : {},
    notebook: {
      notes: isRecord(notebook.notes) ? (notebook.notes as NotebookState['notes']) : emptyNotebook.notes,
      words: Array.isArray(notebook.words) ? (notebook.words as NotebookState['words']) : [],
      mistakes: Array.isArray(notebook.mistakes) ? (notebook.mistakes as NotebookState['mistakes']) : [],
    },
    quizzes: isRecord(raw.quizzes) ? (raw.quizzes as QuizHistory) : {},
  };
}
