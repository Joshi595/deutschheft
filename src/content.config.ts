import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { examFileSchema, exerciseFileSchema, lessonSchema, levelSchema, missionSchema, vocabFileSchema } from './lib/content/schema';

// One folder per content type, one sub-folder per level. Adding a level or a
// lesson means adding files here; nothing in src/pages or src/components changes.

const levels = defineCollection({
  loader: glob({ base: './src/content/levels', pattern: '*.yaml' }),
  schema: levelSchema,
});

const lessons = defineCollection({
  loader: glob({ base: './src/content/lessons', pattern: '**/*.mdx' }),
  schema: lessonSchema,
});

const exercises = defineCollection({
  loader: glob({ base: './src/content/exercises', pattern: '**/*.yaml' }),
  schema: exerciseFileSchema,
});

const vocab = defineCollection({
  loader: glob({ base: './src/content/vocab', pattern: '**/*.yaml' }),
  schema: vocabFileSchema,
});

const exams = defineCollection({
  loader: glob({ base: './src/content/exams', pattern: '**/*.yaml' }),
  schema: examFileSchema,
});

const missions = defineCollection({
  loader: glob({ base: './src/content/missions', pattern: '*.yaml' }),
  schema: missionSchema,
});

export const collections = { levels, lessons, exercises, vocab, exams, missions };
