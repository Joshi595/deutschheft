import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import {
  examFileSchema,
  exerciseFileSchema,
  lessonSchema,
  levelSchema,
  vocabFileSchema,
  type Exercise,
} from '../src/lib/content/schema';
import { grade, type Response } from '../src/lib/grading/grade';
import { normalize } from '../src/lib/grading/normalize';
import { tokenize } from '../src/lib/grading/shuffle';

/**
 * Checks the content itself, not the code: every answer key must be accepted by
 * the grader, every chapter must follow the teaching template, and every mock
 * exam must have the shape of the real one.
 */

const root = join(import.meta.dirname, '..', 'src', 'content');

/**
 * Levels whose chapters must follow the full template. A level joins this list
 * once its chapters have been written to it.
 */
const TEMPLATE_LEVELS = ['a1', 'a2'];

const REQUIRED_HEADINGS = {
  grammar: ['The idea', 'Step by step', 'Compared with English', 'Typical mistakes', 'Summary'],
  topic: ['The idea', 'Step by step', 'Compared with English', 'Typical mistakes', 'Summary'],
  exam: ['What this part tests', 'How to approach it', 'Summary'],
} as const;

const MIN = {
  grammar: { words: 700, examples: 12, vocab: 15, exercises: 20 },
  topic: { words: 700, examples: 12, vocab: 15, exercises: 20 },
  exam: { words: 350, examples: 0, vocab: 0, exercises: 6 },
} as const;

/** What each level's mock exam has to contain, after the Goethe exam regulations. */
const EXAM_FORMAT: Record<string, { skill: string; minutes: number; needs?: Exercise['type'][] }[]> = {
  // Start Deutsch 1 begins with listening; A2 and B1 begin with reading.
  a1: [
    { skill: 'listening', minutes: 20 },
    { skill: 'reading', minutes: 25 },
    { skill: 'writing', minutes: 20, needs: ['form', 'writing-task'] },
    { skill: 'speaking', minutes: 15, needs: ['speaking-task'] },
  ],
  a2: [
    { skill: 'reading', minutes: 30 },
    { skill: 'listening', minutes: 30 },
    { skill: 'writing', minutes: 30, needs: ['writing-task'] },
    { skill: 'speaking', minutes: 15, needs: ['speaking-task'] },
  ],
  b1: [
    { skill: 'reading', minutes: 65 },
    { skill: 'listening', minutes: 40 },
    { skill: 'writing', minutes: 60, needs: ['writing-task'] },
    { skill: 'speaking', minutes: 15, needs: ['speaking-task'] },
  ],
};

function files(folder: string, extension: string): string[] {
  const directory = join(root, folder);
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith(extension))
    .map((name) => join(directory, name));
}

const label = (path: string) => relative(root, path).replace(/\\/g, '/');

function splitMdx(path: string): { data: unknown; body: string } {
  const text = readFileSync(path, 'utf8');
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!match) throw new Error(`${label(path)} has no frontmatter`);
  return { data: parse(match[1]!), body: match[2]! };
}

const levels = files('levels', '.yaml').map((path) => ({
  id: label(path).replace(/^levels\//, '').replace(/\.yaml$/, ''),
  data: levelSchema.parse(parse(readFileSync(path, 'utf8'))),
}));
const lessons = files('lessons', '.mdx').map((path) => {
  const { data, body } = splitMdx(path);
  return { path, body, data: lessonSchema.parse(data) };
});
const exerciseFiles = files('exercises', '.yaml').map((path) => ({
  path,
  data: exerciseFileSchema.parse(parse(readFileSync(path, 'utf8'))),
}));
const vocabFiles = files('vocab', '.yaml').map((path) => ({
  path,
  data: vocabFileSchema.parse(parse(readFileSync(path, 'utf8'))),
}));
const examFiles = files('exams', '.yaml').map((path) => ({
  path,
  data: examFileSchema.parse(parse(readFileSync(path, 'utf8'))),
}));

const levelOf = (key: string) => key.split('.')[0]!;

/** The responses a learner could give that the author says are right. */
function modelResponses(item: Exercise): Response[] {
  switch (item.type) {
    case 'multiple-choice':
      return [{ type: 'multiple-choice', choice: item.answer }];
    case 'true-false':
      return [{ type: 'true-false', value: item.answer }];
    case 'fill-blank':
      return item.answers.map((text) => ({ type: 'fill-blank', text }));
    case 'cloze':
      return [{ type: 'cloze', texts: item.gaps.map((accepted) => accepted[0]!) }];
    case 'form':
      return [{ type: 'form', texts: item.fields.map((field) => field.answers[0]!) }];
    case 'translation':
      return item.answers.map((text) => ({ type: 'translation', text }));
    case 'matching':
      return [{ type: 'matching', selection: Object.fromEntries(item.pairs.map((pair) => [pair.left, pair.right])) }];
    case 'word-order':
      return [item.answer, ...item.alternatives].map((sentence) => ({ type: 'word-order', tokens: tokenize(sentence) }));
    case 'writing':
      return [{ type: 'writing', text: item.sample }];
    case 'writing-task':
      // The model answer itself has to be long enough to pass.
      return [{ type: 'writing-task', text: item.sample, covered: item.points.map(() => true) }];
    case 'speaking-task':
      return [{ type: 'speaking-task', done: item.checklist.map(() => true) }];
  }
}

function checkItems(items: Exercise[], where: string) {
  for (const item of items) {
    for (const response of modelResponses(item)) {
      const result = grade(item, response);
      expect(result.correct, `${where}.${item.id}: ${JSON.stringify(response)} -> ${result.note ?? ''}`).toBe(true);
    }
    if (item.type === 'multiple-choice') {
      expect(new Set(item.options).size, `${where}.${item.id} repeats an option`).toBe(item.options.length);
    }
    if (item.type === 'word-order') {
      expect(tokenize(item.answer).length, `${where}.${item.id} is too short`).toBeGreaterThanOrEqual(3);
      for (const alternative of item.alternatives) {
        expect([...tokenize(alternative)].sort(), `${where}.${item.id} alternative uses other words`).toEqual(
          [...tokenize(item.answer)].sort(),
        );
      }
    }
  }
}

describe('lessons', () => {
  it('have unique keys', () => {
    const keys = lessons.map((lesson) => lesson.data.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('sit in the folder of their level', () => {
    for (const { path, data } of lessons) {
      expect(label(path), data.key).toMatch(new RegExp(`^lessons/${levelOf(data.key)}/`));
    }
  });

  it('have unique order numbers within a level', () => {
    const seen = new Set<string>();
    for (const { data } of lessons) {
      const slot = `${levelOf(data.key)}#${data.order}`;
      expect(seen.has(slot), `duplicate order ${slot}`).toBe(false);
      seen.add(slot);
    }
  });

  it('point at a unit their level declares', () => {
    for (const { data } of lessons) {
      const level = levels.find((candidate) => candidate.id === levelOf(data.key));
      expect(level, `no level file for ${data.key}`).toBeDefined();
      expect(data.unit, `${data.key} unit`).toBeLessThanOrEqual(Math.max(1, level!.data.units.length));
    }
  });
});

describe('exercise and vocab files', () => {
  const keys = new Set(lessons.map((lesson) => lesson.data.key));

  it('belong to an existing lesson, one file per lesson', () => {
    for (const group of [exerciseFiles, vocabFiles]) {
      const used = new Set<string>();
      for (const { path, data } of group) {
        expect(keys.has(data.lesson), `${label(path)} -> ${data.lesson}`).toBe(true);
        expect(used.has(data.lesson), `second file for ${data.lesson}: ${label(path)}`).toBe(false);
        used.add(data.lesson);
      }
    }
  });

  it('give every lesson some exercises', () => {
    const covered = new Set(exerciseFiles.map((file) => file.data.lesson));
    for (const key of keys) expect(covered.has(key), `no exercises for ${key}`).toBe(true);
  });
});

describe('answer keys', () => {
  for (const { path, data } of exerciseFiles) {
    it(`${label(path)}: every model answer is accepted by the grader`, () => {
      checkItems(data.sets.flatMap((set) => set.items), data.lesson);
    });
  }
});

describe('chapter template', () => {
  const enforced = lessons.filter((lesson) => TEMPLATE_LEVELS.includes(levelOf(lesson.data.key)));

  for (const { path, body, data } of enforced) {
    const minimum = MIN[data.kind];
    const exercises = exerciseFiles.find((file) => file.data.lesson === data.key);
    const vocab = vocabFiles.find((file) => file.data.lesson === data.key);

    it(`${label(path)}: states what the learner will be able to do`, () => {
      expect(data.objectives.length, 'objectives').toBeGreaterThanOrEqual(2);
    });

    it(`${label(path)}: has every section of the template`, () => {
      const headings = [...body.matchAll(/^## (.+)$/gm)].map((match) => match[1]!.trim());
      for (const required of REQUIRED_HEADINGS[data.kind]) {
        expect(headings, `missing section "${required}"`).toContain(required);
      }
    });

    it(`${label(path)}: explains at length, with examples`, () => {
      const words = body.replace(/[<>/="*|#\-—]/g, ' ').split(/\s+/).filter(Boolean).length;
      expect(words, 'words of explanation').toBeGreaterThanOrEqual(minimum.words);
      const examples = (body.match(/<(Example|Compare|Mistake)\b/g) ?? []).length;
      expect(examples, 'examples').toBeGreaterThanOrEqual(minimum.examples);
    });

    it(`${label(path)}: has enough vocabulary and practice`, () => {
      expect(vocab?.data.items.length ?? 0, 'vocabulary items').toBeGreaterThanOrEqual(minimum.vocab);
      const count = exercises?.data.sets.reduce((sum, set) => sum + set.items.length, 0) ?? 0;
      expect(count, 'exercises').toBeGreaterThanOrEqual(minimum.exercises);
    });
  }
});

describe('mock exams', () => {
  it('have distinct titles within a level', () => {
    const titles = examFiles.map((file) => `${file.data.level}: ${file.data.title}`);
    expect(new Set(titles).size).toBe(titles.length);
  });

  for (const { path, data } of examFiles) {
    const where = label(path);

    it(`${where}: sits in the folder of its level`, () => {
      expect(where).toMatch(new RegExp(`^exams/${data.level}/`));
      expect(levels.some((level) => level.id === data.level), `no level ${data.level}`).toBe(true);
    });

    it(`${where}: every model answer is accepted by the grader`, () => {
      checkItems(data.modules.flatMap((module) => module.parts.flatMap((part) => part.items)), where);
    });

    it(`${where}: has the modules, timing and task types of the real exam`, () => {
      const format = EXAM_FORMAT[data.level];
      expect(format, `no exam format defined for ${data.level}`).toBeDefined();
      expect(data.modules.map((module) => module.skill)).toEqual(format!.map((module) => module.skill));
      data.modules.forEach((module, index) => {
        const expected = format![index]!;
        expect(module.minutes, `${module.skill} minutes`).toBe(expected.minutes);
        const types = new Set(module.parts.flatMap((part) => part.items.map((item) => item.type)));
        for (const needed of expected.needs ?? []) {
          expect(types.has(needed), `${module.skill} needs a ${needed} task`).toBe(true);
        }
      });
    });

    it(`${where}: listening tasks have a recording and reading tasks have a text`, () => {
      for (const module of data.modules) {
        if (module.skill !== 'listening' && module.skill !== 'reading') continue;
        const kind = module.skill === 'listening' ? 'audio' : 'text';
        for (const part of module.parts) {
          for (const item of part.items) {
            const stimulus = item.stimulus ?? part.stimulus;
            expect(stimulus?.kind, `${module.skill} ${part.title} ${item.id}`).toBe(kind);
          }
        }
      }
    });
  }
});

/**
 * Optional. Save a level's official word list as plain text, one word per line,
 * in reference/goethe-<level>.txt (the folder is not committed). The test then
 * prints the words the course does not teach yet.
 */
describe('vocabulary coverage', () => {
  for (const level of levels) {
    const reference = join(import.meta.dirname, '..', 'reference', `goethe-${level.id}.txt`);
    it.skipIf(!existsSync(reference))(`${level.id}: reports words from the official list that are not taught`, () => {
      const taught = new Set(
        vocabFiles
          .filter((file) => levelOf(file.data.lesson) <= level.id)
          .flatMap((file) => file.data.items.map((item) => normalize(item.de))),
      );
      const wanted = readFileSync(reference, 'utf8')
        .split(/\r?\n/)
        .map((line) => normalize(line.replace(/^(der|die|das)\s+/i, '')))
        .filter(Boolean);
      const missing = wanted.filter((word) => !taught.has(word));
      console.info(`${level.id}: ${wanted.length - missing.length} of ${wanted.length} listed words taught.`);
      if (missing.length > 0) console.info(`Missing: ${missing.join(', ')}`);
      expect(wanted.length).toBeGreaterThan(0);
    });
  }
});
