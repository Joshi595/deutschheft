import { describe, expect, it } from 'vitest';
import type { ExerciseOf } from '../src/lib/content/schema';
import type { ClientQuiz } from '../src/lib/content/types';
import {
  countWords,
  grade,
  gradeGaps,
  gradeSpeakingTask,
  gradeTrueFalse,
  gradeWritingTask,
  partialScore,
  type Response,
} from '../src/lib/grading/grade';
import { emptyResponse, isAnswered, isReady, isSelfAssessed, spokenSolution } from '../src/lib/grading/response';
import { addAttempt, bestAttempt, MAX_ATTEMPTS_KEPT, scoreQuiz, toAttempt } from '../src/lib/quiz/score';

const trueFalse: ExerciseOf<'true-false'> = { id: 'tf1', type: 'true-false', tags: [], prompt: 'Anna wohnt in Bonn.', answer: false };

const cloze: ExerciseOf<'cloze'> = {
  id: 'c1',
  type: 'cloze',
  tags: [],
  text: 'Ich ___ Anna und ___ in Köln.',
  gaps: [['heiße', 'bin'], ['wohne']],
};

const form: ExerciseOf<'form'> = {
  id: 'f1',
  type: 'form',
  tags: [],
  situation: 'Maria Rossi kommt aus Italien und wohnt in München.',
  fields: [
    { label: 'Familienname', answers: ['Rossi'] },
    { label: 'Wohnort', answers: ['München'] },
  ],
};

const writingTask: ExerciseOf<'writing-task'> = {
  id: 'w1',
  type: 'writing-task',
  tags: [],
  prompt: 'Schreiben Sie an Ihre Freundin.',
  points: ['Warum schreiben Sie?', 'Wann kommen Sie?', 'Was bringen Sie mit?'],
  minWords: 10,
  phrases: [],
  sample: 'Liebe Anna, ich komme am Samstag um drei Uhr und bringe einen Kuchen mit. Viele Grüße',
};

const speakingTask: ExerciseOf<'speaking-task'> = {
  id: 's1',
  type: 'speaking-task',
  tags: [],
  prompt: 'Stellen Sie sich vor.',
  cards: ['Name?', 'Land?'],
  phrases: [],
  checklist: ['Name', 'Land'],
  sample: 'Ich heiße Anna und komme aus Polen.',
};

describe('true-false', () => {
  it('compares with the answer and treats no choice as wrong', () => {
    expect(gradeTrueFalse(trueFalse, false)).toEqual({ correct: true, expected: 'Falsch' });
    expect(gradeTrueFalse(trueFalse, true).correct).toBe(false);
    expect(gradeTrueFalse(trueFalse, null).correct).toBe(false);
  });
});

describe('gaps and forms', () => {
  it('grades each gap on its own and is correct only when all are', () => {
    expect(gradeGaps(['heiße', 'wohne'], cloze.gaps)).toMatchObject({ correct: true, parts: [true, true] });
    expect(gradeGaps(['bin', 'wohnt'], cloze.gaps)).toMatchObject({ correct: false, parts: [true, false] });
    expect(gradeGaps(['heiße'], cloze.gaps).parts).toEqual([true, false]);
  });

  it('keeps the tolerance of single answers: ss for ß, capitalisation', () => {
    const result = gradeGaps(['heisse', 'Wohne'], cloze.gaps);
    expect(result.correct).toBe(true);
    expect(result.note).toContain('heiße');
  });

  it('grades form fields through the same path', () => {
    expect(grade(form, { type: 'form', texts: ['Rossi', 'München'] }).correct).toBe(true);
    expect(grade(form, { type: 'form', texts: ['Maria', 'München'] })).toMatchObject({ correct: false, parts: [false, true] });
    expect(grade(form, { type: 'form', texts: ['Rossi', 'Muenchen'] }).correct).toBe(true);
  });
});

describe('writing task', () => {
  const long = 'Liebe Anna, ich komme am Samstag um drei Uhr und bringe Kuchen mit.';

  it('counts words without punctuation', () => {
    expect(countWords('Liebe Anna,  ich komme!')).toBe(4);
    expect(countWords('   ')).toBe(0);
  });

  it('fails a text that is too short, whatever is ticked', () => {
    const result = gradeWritingTask(writingTask, 'Ich komme.', [true, true, true]);
    expect(result.correct).toBe(false);
    expect(result.note).toContain('Too short');
  });

  it('passes only when every content point is ticked', () => {
    expect(gradeWritingTask(writingTask, long, [true, true, true]).correct).toBe(true);
    const partial = gradeWritingTask(writingTask, long, [true, false, true]);
    expect(partial).toMatchObject({ correct: false, parts: [true, false, true] });
    expect(partial.note).toContain('1 content point is');
  });

  it('treats a missing checklist as nothing covered', () => {
    expect(gradeWritingTask(writingTask, long, []).parts).toEqual([false, false, false]);
  });
});

describe('speaking task', () => {
  it('passes when the whole checklist is ticked', () => {
    expect(gradeSpeakingTask(speakingTask, [true, true]).correct).toBe(true);
    expect(gradeSpeakingTask(speakingTask, [true, false])).toMatchObject({ correct: false, parts: [true, false] });
  });
});

describe('partial score', () => {
  it('is 1 for correct, a share for partly right, 0 otherwise', () => {
    expect(partialScore(gradeGaps(['heiße', 'wohne'], cloze.gaps))).toBe(1);
    expect(partialScore(gradeGaps(['heiße', 'x'], cloze.gaps))).toBe(0.5);
    expect(partialScore(gradeTrueFalse(trueFalse, true))).toBe(0);
    expect(partialScore(gradeWritingTask(writingTask, 'zu kurz', [true, true, false]))).toBeCloseTo(2 / 3);
  });
});

describe('response helpers', () => {
  it('starts every type empty and unanswered', () => {
    for (const item of [trueFalse, cloze, form, writingTask, speakingTask]) {
      const response = emptyResponse(item);
      expect(response.type).toBe(item.type);
      expect(isAnswered(response)).toBe(false);
      expect(isReady(item, response)).toBe(false);
    }
  });

  it('needs every gap filled before checking', () => {
    expect(isReady(cloze, { type: 'cloze', texts: ['heiße', ''] })).toBe(false);
    expect(isAnswered({ type: 'cloze', texts: ['heiße', ''] })).toBe(true);
    expect(isReady(cloze, { type: 'cloze', texts: ['heiße', 'wohne'] })).toBe(true);
  });

  it('needs a long enough text and a compared checklist for a writing task', () => {
    const text = 'eins zwei drei vier fünf sechs sieben acht neun zehn';
    expect(isReady(writingTask, { type: 'writing-task', text, covered: [] })).toBe(false);
    expect(isReady(writingTask, { type: 'writing-task', text, covered: [false, false, false] })).toBe(true);
    expect(isReady(writingTask, { type: 'writing-task', text: 'kurz', covered: [true, true, true] })).toBe(false);
  });

  it('knows which tasks the learner marks', () => {
    expect(isSelfAssessed(writingTask)).toBe(true);
    expect(isSelfAssessed(speakingTask)).toBe(true);
    expect(isSelfAssessed(cloze)).toBe(false);
  });

  it('builds the full sentence for a cloze text', () => {
    expect(spokenSolution(cloze, gradeGaps(['heiße', 'wohne'], cloze.gaps))).toBe('Ich heiße Anna und wohne in Köln.');
  });
});

const quiz: ClientQuiz = {
  id: 'exam:a1/test',
  kind: 'exam',
  title: 'Test',
  description: '',
  passMark: 60,
  scoring: 'total',
  backHref: '/',
  sections: [
    {
      skill: 'reading',
      minutes: 25,
      points: 50,
      parts: [{ title: 'Teil 1', items: [{ ...trueFalse, lessonKey: 'a1.exam' }, { ...cloze, lessonKey: 'a1.exam' }] }],
    },
    {
      skill: 'writing',
      minutes: 20,
      points: 50,
      parts: [{ title: 'Teil 1', items: [{ ...form, lessonKey: 'a1.exam' }] }],
    },
  ],
};

const allRight: Record<string, Response> = {
  tf1: { type: 'true-false', value: false },
  c1: { type: 'cloze', texts: ['heiße', 'wohne'] },
  f1: { type: 'form', texts: ['Rossi', 'München'] },
};

describe('quiz scoring', () => {
  it('gives full marks for all correct answers', () => {
    const score = scoreQuiz(quiz, allRight);
    expect(score.total).toBe(100);
    expect(score.passed).toBe(true);
    expect(score.sections.map((section) => section.points)).toEqual([50, 50]);
  });

  it('counts unanswered items as wrong and gives part credit for gaps', () => {
    const score = scoreQuiz(quiz, { c1: { type: 'cloze', texts: ['heiße', 'falsch'] } });
    // reading: (0 + 0.5) / 2 = 25% of 50 = 12.5 -> 13; writing: 0
    expect(score.sections[0]).toMatchObject({ points: 13, percent: 25, passed: false });
    expect(score.sections[1]).toMatchObject({ points: 0, passed: false });
    expect(score.total).toBe(13);
    expect(score.passed).toBe(false);
    expect(Object.keys(score.results).sort()).toEqual(['c1', 'f1', 'tf1']);
  });

  it('passes on the total when one part is weak', () => {
    const score = scoreQuiz(quiz, { ...allRight, tf1: { type: 'true-false', value: true } });
    expect(score.sections[0]!.percent).toBe(50);
    expect(score.total).toBe(75);
    expect(score.passed).toBe(true);
  });

  it('requires every part to pass when scored per module', () => {
    const score = scoreQuiz({ ...quiz, scoring: 'per-module' }, { ...allRight, tf1: { type: 'true-false', value: true } });
    expect(score.total).toBe(75);
    expect(score.passed).toBe(false);
  });
});

describe('quiz history', () => {
  const at = new Date('2026-10-02T09:00:00Z');
  const attempt = (total: number) => ({ ...toAttempt(scoreQuiz(quiz, allRight), at), total, passed: total >= 60 });

  it('keeps the newest attempts first and caps the list', () => {
    let history = {};
    for (let i = 0; i < MAX_ATTEMPTS_KEPT + 3; i++) history = addAttempt(history, quiz.id, attempt(i));
    const attempts = (history as Record<string, { total: number }[]>)[quiz.id]!;
    expect(attempts).toHaveLength(MAX_ATTEMPTS_KEPT);
    expect(attempts[0]!.total).toBe(MAX_ATTEMPTS_KEPT + 2);
  });

  it('finds the best attempt', () => {
    let history = addAttempt({}, quiz.id, attempt(40));
    history = addAttempt(history, quiz.id, attempt(80));
    history = addAttempt(history, quiz.id, attempt(65));
    expect(bestAttempt(history, quiz.id)?.total).toBe(80);
    expect(bestAttempt(history, 'other')).toBeUndefined();
  });
});
