import { z } from 'astro/zod';

/**
 * The content contract. Every file under src/content is validated against these
 * schemas at build time, so a malformed lesson fails the build instead of shipping.
 */

/** Stable lesson key, e.g. "a2.01". Progress and review cards are keyed off it. */
export const lessonKey = z
  .string()
  .regex(/^[a-z][0-9]\.[0-9]{2}$/, 'Lesson key must look like "a2.01"');

/** Local id, unique within one lesson file, e.g. "mc1" or "freundlich". */
const localId = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'Use lowercase letters, digits and dashes');

export const levelSchema = z.object({
  title: z.string(),
  name: z.string(),
  description: z.string(),
  order: z.number().int(),
  status: z.enum(['active', 'planned']),
  /** Units group the chapters on the level page. A lesson's `unit` is a 1-based index into this list. */
  units: z.array(z.object({ title: z.string(), summary: z.string().optional() })).default([]),
  /** Name of the exam this level leads to, e.g. "Goethe-Zertifikat A1: Start Deutsch 1". */
  exam: z.string().optional(),
});

export const lessonSchema = z.object({
  key: lessonKey,
  title: z.string(),
  titleDe: z.string().optional(),
  summary: z.string(),
  order: z.number().int().positive(),
  minutes: z.number().int().positive(),
  topics: z.array(z.string()).default([]),
  /** What the learner will be able to do afterwards; shown at the top of the chapter. */
  objectives: z.array(z.string()).default([]),
  /** 1-based index into the level's `units`. */
  unit: z.number().int().positive().default(1),
  /** grammar and topic chapters follow the teaching template; exam chapters train one exam part. */
  kind: z.enum(['grammar', 'topic', 'exam']).default('grammar'),
});

/**
 * Something to read or listen to before answering. A text is shown; an audio
 * script is spoken by the browser and its transcript stays hidden until asked for.
 */
export const stimulusSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('text'),
    /** What kind of text this is, e.g. "E-Mail", "Anzeige", "Schild". */
    label: z.string().optional(),
    title: z.string().optional(),
    /** Paragraphs are separated by a blank line. */
    text: z.string(),
  }),
  z.object({
    kind: z.literal('audio'),
    label: z.string().optional(),
    title: z.string().optional(),
    /** One entry per turn. Speakers get different voices. */
    lines: z.array(z.object({ speaker: z.string().optional(), text: z.string() })).min(1),
    /** How often it may be played, as in the exam. */
    plays: z.number().int().positive().default(2),
  }),
]);

const exerciseBase = {
  id: localId,
  /** Grammar or vocabulary topics, used for the weak-areas stats. */
  tags: z.array(z.string()).default([]),
  hint: z.string().optional(),
  /** Shown once the item is solved or the answer is revealed. */
  explanation: z.string().optional(),
  /** A text or recording that belongs to this one item. */
  stimulus: stimulusSchema.optional(),
};

const multipleChoice = z.object({
  ...exerciseBase,
  type: z.literal('multiple-choice'),
  prompt: z.string(),
  options: z.array(z.string()).min(2),
  /** Must be one of `options`, written out in full. */
  answer: z.string(),
});

const trueFalse = z.object({
  ...exerciseBase,
  type: z.literal('true-false'),
  /** A statement to judge as richtig or falsch. */
  prompt: z.string(),
  answer: z.boolean(),
});

const fillBlank = z.object({
  ...exerciseBase,
  type: z.literal('fill-blank'),
  /** Sentence containing exactly one "___" gap. */
  prompt: z.string(),
  /** Accepted answers; the first is the one shown as the solution. */
  answers: z.array(z.string()).min(1),
  translation: z.string().optional(),
});

const cloze = z.object({
  ...exerciseBase,
  type: z.literal('cloze'),
  prompt: z.string().optional(),
  /** A text with several "___" gaps. */
  text: z.string(),
  /** Accepted answers for each gap, in order. */
  gaps: z.array(z.array(z.string()).min(1)).min(2),
  /** If given, the learner picks each gap from this list instead of typing. */
  bank: z.array(z.string()).optional(),
});

const form = z.object({
  ...exerciseBase,
  type: z.literal('form'),
  prompt: z.string().optional(),
  /** The description the learner takes the information from. */
  situation: z.string(),
  fields: z.array(z.object({ label: z.string(), answers: z.array(z.string()).min(1) })).min(2),
});

const matching = z.object({
  ...exerciseBase,
  type: z.literal('matching'),
  prompt: z.string().optional(),
  pairs: z.array(z.object({ left: z.string(), right: z.string() })).min(2),
});

const translation = z.object({
  ...exerciseBase,
  type: z.literal('translation'),
  /** The sentence to translate into German. */
  prompt: z.string(),
  answers: z.array(z.string()).min(1),
});

const wordOrder = z.object({
  ...exerciseBase,
  type: z.literal('word-order'),
  /** Optional cue, usually the English meaning. */
  prompt: z.string().optional(),
  /** The correct sentence; it is split into shuffled tiles. */
  answer: z.string(),
  alternatives: z.array(z.string()).default([]),
});

const writing = z.object({
  ...exerciseBase,
  type: z.literal('writing'),
  prompt: z.string(),
  /** Words the answer has to contain, e.g. ["weil"]. */
  mustInclude: z.array(z.string()).default([]),
  sample: z.string(),
});

const writingTask = z.object({
  ...exerciseBase,
  type: z.literal('writing-task'),
  /** The situation and the task, as on an exam paper. */
  prompt: z.string(),
  /** The content points the text has to cover; the learner ticks them off against the model. */
  points: z.array(z.string()).min(1),
  minWords: z.number().int().positive(),
  /** Phrases that help with this kind of text. */
  phrases: z.array(z.string()).default([]),
  sample: z.string(),
});

const speakingTask = z.object({
  ...exerciseBase,
  type: z.literal('speaking-task'),
  prompt: z.string(),
  /** Cue words, like the cards handed out in the exam. */
  cards: z.array(z.string()).default([]),
  phrases: z.array(z.string()).default([]),
  /** What a good answer does; the learner rates their own attempt against it. */
  checklist: z.array(z.string()).min(1),
  sample: z.string(),
});

export const exerciseSchema = z.discriminatedUnion('type', [
  multipleChoice,
  trueFalse,
  fillBlank,
  cloze,
  form,
  matching,
  translation,
  wordOrder,
  writing,
  writingTask,
  speakingTask,
]);

export const exerciseSetSchema = z.object({
  title: z.string(),
  instructions: z.string().optional(),
  /** A text or recording shared by all items of the set. */
  stimulus: stimulusSchema.optional(),
  items: z.array(exerciseSchema).min(1),
});

type ExerciseSetInput = z.infer<typeof exerciseSetSchema>;
type Issue = { path: (string | number)[]; message: string };

/** Cross-field checks shared by lesson exercise files and mock exams. */
function checkSets(sets: ExerciseSetInput[], basePath: (string | number)[], seen: Set<string>): Issue[] {
  const issues: Issue[] = [];
  sets.forEach((set, s) => {
    set.items.forEach((item, i) => {
      const path = [...basePath, s, 'items', i];
      if (seen.has(item.id)) issues.push({ path: [...path, 'id'], message: `Duplicate exercise id "${item.id}"` });
      seen.add(item.id);

      if (item.type === 'multiple-choice' && !item.options.includes(item.answer)) {
        issues.push({ path: [...path, 'answer'], message: `Answer "${item.answer}" is not one of the options` });
      }
      if (item.type === 'fill-blank' && item.prompt.split('___').length !== 2) {
        issues.push({ path: [...path, 'prompt'], message: 'A fill-blank prompt needs exactly one "___" gap' });
      }
      if (item.type === 'cloze') {
        if (item.text.split('___').length - 1 !== item.gaps.length) {
          issues.push({ path: [...path, 'gaps'], message: 'The number of "___" gaps in the text must equal the number of gap entries' });
        }
        if (item.bank && item.gaps.some((accepted) => !accepted.some((answer) => item.bank!.includes(answer)))) {
          issues.push({ path: [...path, 'bank'], message: 'Every gap needs at least one accepted answer in the word bank' });
        }
      }
      if (item.type === 'matching') {
        const rights = new Set(item.pairs.map((pair) => pair.right));
        const lefts = new Set(item.pairs.map((pair) => pair.left));
        if (rights.size !== item.pairs.length || lefts.size !== item.pairs.length) {
          issues.push({ path: [...path, 'pairs'], message: 'Matching pairs must not repeat a left or right value' });
        }
      }
    });
  });
  return issues;
}

export const exerciseFileSchema = z
  .object({
    lesson: lessonKey,
    sets: z.array(exerciseSetSchema).min(1),
  })
  .superRefine((file, ctx) => {
    for (const issue of checkSets(file.sets, ['sets'], new Set())) {
      ctx.addIssue({ code: 'custom', path: issue.path, message: issue.message });
    }
  });

export const examSkill = z.enum(['reading', 'listening', 'writing', 'speaking']);

export const examModuleSchema = z.object({
  skill: examSkill,
  /** Time allowed, as in the real exam. */
  minutes: z.number().int().positive(),
  /** Points this module contributes; the modules of one exam add up to 100. */
  points: z.number().int().positive(),
  /** Each part is one "Teil" of the module. */
  parts: z.array(exerciseSetSchema).min(1),
});

export const examFileSchema = z
  .object({
    /** Level id, e.g. "a1". */
    level: z.string().regex(/^[a-z][0-9]$/),
    title: z.string(),
    description: z.string(),
    /** Percentage needed to pass. */
    passMark: z.number().int().min(1).max(100).default(60),
    /** B1 is passed module by module; A1 and A2 on the total. */
    scoring: z.enum(['total', 'per-module']).default('total'),
    modules: z.array(examModuleSchema).min(1),
  })
  .superRefine((file, ctx) => {
    const seen = new Set<string>();
    file.modules.forEach((module, m) => {
      for (const issue of checkSets(module.parts, ['modules', m, 'parts'], seen)) {
        ctx.addIssue({ code: 'custom', path: issue.path, message: issue.message });
      }
    });
    if (file.scoring === 'total' && file.modules.reduce((sum, module) => sum + module.points, 0) !== 100) {
      ctx.addIssue({ code: 'custom', path: ['modules'], message: 'Module points must add up to 100' });
    }
  });

export const vocabItemSchema = z.object({
  id: localId,
  /** The German word without its article, e.g. "Stadt". */
  de: z.string(),
  en: z.string(),
  pos: z.enum(['noun', 'verb', 'adjective', 'adverb', 'preposition', 'conjunction', 'phrase', 'other']),
  article: z.enum(['der', 'die', 'das']).optional(),
  /** Plural form with its article left out, e.g. "Städte". Use "-" for no plural. */
  plural: z.string().optional(),
  example: z.string().optional(),
  exampleEn: z.string().optional(),
});

export const vocabFileSchema = z
  .object({
    lesson: lessonKey,
    items: z.array(vocabItemSchema).min(1),
  })
  .superRefine((file, ctx) => {
    const seen = new Set<string>();
    file.items.forEach((item, i) => {
      if (seen.has(item.id)) {
        ctx.addIssue({ code: 'custom', path: ['items', i, 'id'], message: `Duplicate vocab id "${item.id}"` });
      }
      seen.add(item.id);
      if (item.pos === 'noun' && !item.article) {
        ctx.addIssue({ code: 'custom', path: ['items', i, 'article'], message: `Noun "${item.de}" needs an article` });
      }
    });
  });

export type Level = z.infer<typeof levelSchema>;
export type LessonMeta = z.infer<typeof lessonSchema>;
export type Stimulus = z.infer<typeof stimulusSchema>;
export type Exercise = z.infer<typeof exerciseSchema>;
export type ExerciseSet = z.infer<typeof exerciseSetSchema>;
export type ExamFile = z.infer<typeof examFileSchema>;
export type ExamSkill = z.infer<typeof examSkill>;
export type VocabItem = z.infer<typeof vocabItemSchema>;

export type ExerciseOf<T extends Exercise['type']> = Extract<Exercise, { type: T }>;
