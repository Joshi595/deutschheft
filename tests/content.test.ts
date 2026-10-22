import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
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
  type Exercise,
} from '../src/lib/content/schema';
import { chapterMentions, lessonOf } from '../src/lib/content/chapter-links';
import { clipKey } from '../src/lib/speech';
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
const TEMPLATE_LEVELS = ['a1', 'a2', 'b1'];

/**
 * Levels where every exercise marked by the app explains its answer, so a
 * wrong answer always says why. A level joins once its explanations are written.
 */
const EXPLAINED_LEVELS: string[] = ['a1', 'a2'];

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
const missionFiles = files('missions', '.yaml').map((path) => ({
  path,
  data: missionSchema.parse(parse(readFileSync(path, 'utf8'))),
}));
const soundFiles = files('speaking/sounds', '.yaml').map((path) => ({ path, data: soundSchema.parse(parse(readFileSync(path, 'utf8'))) }));
const packFiles = files('speaking/packs', '.yaml').map((path) => ({ path, data: packSchema.parse(parse(readFileSync(path, 'utf8'))) }));
const talkFiles = files('speaking/conversations', '.yaml').map((path) => ({
  path,
  data: conversationSchema.parse(parse(readFileSync(path, 'utf8'))),
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

  it('mention only chapters that exist, and only a few of them', () => {
    const keys = new Set(lessons.map((lesson) => lesson.data.key));
    for (const { path, body } of lessons) {
      const lesson = lessonOf(path)!;
      const mentioned = new Set(chapterMentions(body, lesson.level, lesson.number).map((mention) => mention.key));
      for (const key of mentioned) expect(keys.has(key), `${label(path)} mentions ${key}`).toBe(true);
      // Each mentioned chapter becomes a link; more than a few would clutter the page.
      expect(mentioned.size, `${label(path)} links to ${[...mentioned].join(', ')}`).toBeLessThanOrEqual(3);
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

describe('explanations', () => {
  for (const { path, data } of exerciseFiles.filter((file) => EXPLAINED_LEVELS.includes(levelOf(file.data.lesson)))) {
    it(`${label(path)}: every exercise the app marks says why`, () => {
      const missing = data.sets
        .flatMap((set) => set.items)
        .filter((item) => item.type !== 'writing-task' && item.type !== 'speaking-task' && !item.explanation?.trim())
        .map((item) => item.id);
      expect(missing, 'items without an explanation').toEqual([]);
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

describe('missions', () => {
  const lessonKeys = new Set(lessons.map((lesson) => lesson.data.key));

  it('exist for every level that has chapters', () => {
    for (const level of new Set(lessons.map((lesson) => levelOf(lesson.data.key)))) {
      expect(missionFiles.some((file) => file.data.level === level), `no mission for ${level}`).toBe(true);
    }
  });

  for (const { path, data } of missionFiles) {
    const where = label(path);

    it(`${where}: every model answer is accepted by the grader`, () => {
      checkItems(data.steps.map((step) => step.task), where);
    });

    it(`${where}: belongs to a level and draws on chapters that exist`, () => {
      expect(levels.some((level) => level.id === data.level), `no level ${data.level}`).toBe(true);
      for (const key of data.lessons) expect(lessonKeys.has(key), `unknown lesson ${key}`).toBe(true);
    });

    it(`${where}: mixes task types and asks the learner to speak`, () => {
      const types = new Set(data.steps.map((step) => step.task.type));
      expect(types.size, 'different task types').toBeGreaterThanOrEqual(4);
      expect(types.has('speaking-task'), 'a speaking task').toBe(true);
    });

    it(`${where}: explains every wrong choice in a decision`, () => {
      for (const { task } of data.steps) {
        // Options that are numbers or single words explain themselves less; sentences must be explained.
        if (task.type !== 'multiple-choice' || !task.options.some((option) => option.includes(' '))) continue;
        const wrong = task.options.filter((option) => option !== task.answer);
        for (const option of wrong) expect(task.feedback?.[option], `${task.id}: no feedback for "${option}"`).toBeTruthy();
      }
    });
  }
});

describe('speak section', () => {
  const levelIds = new Set(levels.map((level) => level.id));
  const withChapters = new Set(lessons.map((lesson) => levelOf(lesson.data.key)));

  it('numbers the sounds without gaps or repeats', () => {
    const orders = soundFiles.map((file) => file.data.order).sort((a, b) => a - b);
    expect(orders).toEqual(orders.map((_, index) => index + 1));
  });

  it('gives every level with chapters phrase packs and conversations', () => {
    for (const level of withChapters) {
      expect(packFiles.some((file) => file.data.level === level), `no phrase pack for ${level}`).toBe(true);
      expect(talkFiles.some((file) => file.data.level === level), `no conversation for ${level}`).toBe(true);
    }
  });

  it('puts packs and conversations on levels that exist, under names no mission uses', () => {
    const missionNames = new Set(missionFiles.map((file) => label(file.path).replace(/^missions\/|\.yaml$/g, '')));
    for (const { path, data } of [...packFiles, ...talkFiles]) expect(levelIds.has(data.level), label(path)).toBe(true);
    for (const { path } of talkFiles) {
      const name = label(path).replace(/^.*\/|\.yaml$/g, '');
      expect(missionNames.has(name), `${label(path)} shares its name with a mission`).toBe(false);
    }
  });

  it('lets both sides speak in every conversation', () => {
    for (const { path, data } of talkFiles) {
      const sides = new Set(data.lines.map((line) => line.who));
      expect(sides.size, `${label(path)} needs both sides`).toBe(2);
    }
  });

  // Once clips have been recorded, every German line of the section must have one, or it would
  // fall back to the browser's voice in the middle of a recorded conversation.
  const index = join(import.meta.dirname, '..', 'public', 'audio', 'index.json');
  const recorded: Record<string, string[]> = existsSync(index) ? JSON.parse(readFileSync(index, 'utf8')) : {};
  it.skipIf(!recorded.a?.length)('has a recorded clip for every German line', () => {
    // Each clip is in one of the two voices.
    const main = new Set([...(recorded.a ?? []), ...(recorded.b ?? [])]);
    const spoken = [
      ...soundFiles.flatMap(({ data }) => [...data.words, ...data.pairs.flat(), data.sentence].map((word) => word.de)),
      ...packFiles.flatMap(({ data }) => data.phrases.map((phrase) => phrase.de)),
    ];
    const dialogue = [
      ...talkFiles.flatMap(({ data }) => data.lines.map((line) => line.text)),
      ...missionFiles.flatMap(({ data }) => data.steps.flatMap((step) => [...step.lines.map((line) => line.text), ...(step.you ? [step.you.text] : [])])),
    ];
    for (const text of [...spoken, ...dialogue]) expect(main.has(clipKey(text)), `no clip for "${text}". Run scripts/make_audio.py`).toBe(true);
  });
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
