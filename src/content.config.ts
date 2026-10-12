import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import {
  conversationSchema,
  examFileSchema,
  exerciseFileSchema,
  lessonSchema,
  levelSchema,
  missionSchema,
  packSchema,
  soundSchema,
  vocabFileSchema,
} from './lib/content/schema';

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

// The Speak section: sounds to train, phrase packs, and conversations to speak through.
const sounds = defineCollection({
  loader: glob({ base: './src/content/speaking/sounds', pattern: '*.yaml' }),
  schema: soundSchema,
});

const packs = defineCollection({
  loader: glob({ base: './src/content/speaking/packs', pattern: '*.yaml' }),
  schema: packSchema,
});

const conversations = defineCollection({
  loader: glob({ base: './src/content/speaking/conversations', pattern: '*.yaml' }),
  schema: conversationSchema,
});

export const collections = { levels, lessons, exercises, vocab, exams, missions, sounds, packs, conversations };
