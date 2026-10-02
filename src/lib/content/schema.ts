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
});

export const lessonSchema = z.object({
  key: lessonKey,
  title: z.string(),
  titleDe: z.string().optional(),
  summary: z.string(),
  order: z.number().int().positive(),
  minutes: z.number().int().positive(),
  topics: z.array(z.string()).default([]),
});

const exerciseBase = {
  id: localId,
  /** Grammar or vocabulary topics, used for the weak-areas stats. */
  tags: z.array(z.string()).default([]),
  hint: z.string().optional(),
  /** Shown once the item is solved or the answer is revealed. */
  explanation: z.string().optional(),
};

const multipleChoice = z.object({
  ...exerciseBase,
  type: z.literal('multiple-choice'),
  prompt: z.string(),
  options: z.array(z.string()).min(2),
  /** Must be one of `options`, written out in full. */
  answer: z.string(),
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

export const exerciseSchema = z.discriminatedUnion('type', [
  multipleChoice,
  fillBlank,
  matching,
  translation,
  wordOrder,
  writing,
]);

export const exerciseSetSchema = z.object({
  title: z.string(),
  instructions: z.string().optional(),
  items: z.array(exerciseSchema).min(1),
});

export const exerciseFileSchema = z
  .object({
    lesson: lessonKey,
    sets: z.array(exerciseSetSchema).min(1),
  })
  .superRefine((file, ctx) => {
    const seen = new Set<string>();
    file.sets.forEach((set, s) => {
      set.items.forEach((item, i) => {
        const path = ['sets', s, 'items', i];
        if (seen.has(item.id)) {
          ctx.addIssue({ code: 'custom', path: [...path, 'id'], message: `Duplicate exercise id "${item.id}"` });
        }
        seen.add(item.id);
        if (item.type === 'multiple-choice' && !item.options.includes(item.answer)) {
          ctx.addIssue({ code: 'custom', path: [...path, 'answer'], message: `Answer "${item.answer}" is not one of the options` });
        }
        if (item.type === 'fill-blank' && item.prompt.split('___').length !== 2) {
          ctx.addIssue({ code: 'custom', path: [...path, 'prompt'], message: 'A fill-blank prompt needs exactly one "___" gap' });
        }
        if (item.type === 'matching') {
          const rights = new Set(item.pairs.map((p) => p.right));
          const lefts = new Set(item.pairs.map((p) => p.left));
          if (rights.size !== item.pairs.length || lefts.size !== item.pairs.length) {
            ctx.addIssue({ code: 'custom', path: [...path, 'pairs'], message: 'Matching pairs must not repeat a left or right value' });
          }
        }
      });
    });
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
export type Exercise = z.infer<typeof exerciseSchema>;
export type ExerciseSet = z.infer<typeof exerciseSetSchema>;
export type VocabItem = z.infer<typeof vocabItemSchema>;

export type ExerciseOf<T extends Exercise['type']> = Extract<Exercise, { type: T }>;
