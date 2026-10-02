import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { exerciseFileSchema, lessonSchema, vocabFileSchema, type Exercise } from '../src/lib/content/schema';
import { grade, type Response } from '../src/lib/grading/grade';
import { tokenize } from '../src/lib/grading/shuffle';

/**
 * Checks the content itself, not the code: every answer key must be accepted by
 * the grader, and every lesson, exercise file and vocab file must line up.
 */

const root = join(import.meta.dirname, '..', 'src', 'content');

function files(folder: string, extension: string): string[] {
  return readdirSync(join(root, folder), { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith(extension))
    .map((name) => join(root, folder, name));
}

const label = (path: string) => relative(root, path).replace(/\\/g, '/');

function frontmatter(path: string): unknown {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(path, 'utf8'));
  if (!match) throw new Error(`${label(path)} has no frontmatter`);
  return parse(match[1]!);
}

const lessons = files('lessons', '.mdx').map((path) => ({ path, data: lessonSchema.parse(frontmatter(path)) }));
const exerciseFiles = files('exercises', '.yaml').map((path) => ({
  path,
  data: exerciseFileSchema.parse(parse(readFileSync(path, 'utf8'))),
}));
const vocabFiles = files('vocab', '.yaml').map((path) => ({
  path,
  data: vocabFileSchema.parse(parse(readFileSync(path, 'utf8'))),
}));

/** The responses a learner could give that the author says are right. */
function modelResponses(item: Exercise): Response[] {
  switch (item.type) {
    case 'multiple-choice':
      return [{ type: 'multiple-choice', choice: item.answer }];
    case 'fill-blank':
      return item.answers.map((text) => ({ type: 'fill-blank', text }));
    case 'translation':
      return item.answers.map((text) => ({ type: 'translation', text }));
    case 'matching':
      return [{ type: 'matching', selection: Object.fromEntries(item.pairs.map((pair) => [pair.left, pair.right])) }];
    case 'word-order':
      return [item.answer, ...item.alternatives].map((sentence) => ({ type: 'word-order', tokens: tokenize(sentence) }));
    case 'writing':
      return [{ type: 'writing', text: item.sample }];
  }
}

describe('lessons', () => {
  it('have unique keys', () => {
    const keys = lessons.map((lesson) => lesson.data.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('sit in the folder of their level', () => {
    for (const { path, data } of lessons) {
      expect(label(path), data.key).toMatch(new RegExp(`^lessons/${data.key.split('.')[0]}/`));
    }
  });

  it('have unique order numbers within a level', () => {
    const seen = new Set<string>();
    for (const { data } of lessons) {
      const slot = `${data.key.split('.')[0]}#${data.order}`;
      expect(seen.has(slot), `duplicate order ${slot}`).toBe(false);
      seen.add(slot);
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
    it(`${label(path)}: every model answer is graded correct`, () => {
      for (const item of data.sets.flatMap((set) => set.items)) {
        for (const response of modelResponses(item)) {
          const result = grade(item, response);
          expect(result.correct, `${data.lesson}.${item.id}: ${JSON.stringify(response)}`).toBe(true);
        }
      }
    });

    it(`${label(path)}: no multiple-choice distractor is also an accepted answer`, () => {
      for (const item of data.sets.flatMap((set) => set.items)) {
        if (item.type !== 'multiple-choice') continue;
        expect(new Set(item.options).size, `${data.lesson}.${item.id} repeats an option`).toBe(item.options.length);
      }
    });

    it(`${label(path)}: word-order sentences have at least three tiles`, () => {
      for (const item of data.sets.flatMap((set) => set.items)) {
        if (item.type !== 'word-order') continue;
        expect(tokenize(item.answer).length, `${data.lesson}.${item.id}`).toBeGreaterThanOrEqual(3);
        for (const alternative of item.alternatives) {
          expect([...tokenize(alternative)].sort(), `${data.lesson}.${item.id} alternative uses other words`).toEqual(
            [...tokenize(item.answer)].sort(),
          );
        }
      }
    });
  }
});
