import { describe, expect, it } from 'vitest';
import type { ExerciseOf } from '../src/lib/content/schema';
import { grade, gradeMatching, gradeText, gradeWordOrder, gradeWriting } from '../src/lib/grading/grade';
import { editDistance, normalize } from '../src/lib/grading/normalize';
import { seededShuffle, tokenize } from '../src/lib/grading/shuffle';

describe('normalize', () => {
  it('ignores case, punctuation and extra whitespace', () => {
    expect(normalize('  Sie ist  sehr freundlich. ')).toBe('sie ist sehr freundlich');
    expect(normalize('Ich lerne Deutsch, weil es Spaß macht!')).toBe('ich lerne deutsch weil es spaß macht');
  });
});

describe('editDistance', () => {
  it('counts single edits and caps at the limit', () => {
    expect(editDistance('freundlich', 'freundlich')).toBe(0);
    expect(editDistance('freundlich', 'freundlch')).toBe(1);
    expect(editDistance('abc', 'xyz', 1)).toBe(2);
  });
});

describe('gradeText', () => {
  it('accepts an exact answer', () => {
    expect(gradeText('bin', ['bin'])).toEqual({ correct: true, expected: 'bin' });
  });

  it('accepts any of several answers and reports the one matched', () => {
    const result = gradeText('Er ist tapfer und fleißig', ['Er ist mutig und fleißig', 'Er ist tapfer und fleißig']);
    expect(result.correct).toBe(true);
    expect(result.expected).toBe('Er ist tapfer und fleißig');
  });

  it('ignores trailing punctuation and spacing', () => {
    expect(gradeText(' Sie ist nett. ', ['Sie ist nett']).note).toBeUndefined();
    expect(gradeText(' Sie ist nett. ', ['Sie ist nett']).correct).toBe(true);
  });

  it('accepts wrong capitalisation but points it out', () => {
    const result = gradeText('das kind ist schüchtern', ['Das Kind ist schüchtern']);
    expect(result.correct).toBe(true);
    expect(result.note).toContain('capitalisation');
  });

  it('accepts ae/oe/ue/ss spelling and shows the proper form', () => {
    const result = gradeText('schuechtern', ['schüchtern']);
    expect(result.correct).toBe(true);
    expect(result.note).toContain('schüchtern');
    expect(gradeText('fleissig', ['fleißig']).correct).toBe(true);
  });

  it('rejects dropped umlauts as a near miss', () => {
    const result = gradeText('schuchtern', ['schüchtern']);
    expect(result.correct).toBe(false);
    expect(result.close).toBe(true);
    expect(result.note).toContain('umlauts');
  });

  it('flags a one-letter typo as close but wrong', () => {
    const result = gradeText('freundlch', ['freundlich']);
    expect(result).toMatchObject({ correct: false, close: true });
  });

  it('does not call short wrong answers close', () => {
    expect(gradeText('bist', ['ist'])).toEqual({ correct: false, expected: 'ist' });
  });

  it('rejects a different answer', () => {
    expect(gradeText('ich bin', ['bin'])).toEqual({ correct: false, expected: 'bin' });
  });
});

const matching: ExerciseOf<'matching'> = {
  id: 'm1',
  type: 'matching',
  tags: [],
  pairs: [
    { left: 'mutig', right: 'brave' },
    { left: 'faul', right: 'lazy' },
  ],
};

describe('gradeMatching', () => {
  it('is correct only when every pair is right', () => {
    expect(gradeMatching(matching, { mutig: 'brave', faul: 'lazy' }).correct).toBe(true);
    const result = gradeMatching(matching, { mutig: 'lazy', faul: 'lazy' });
    expect(result.correct).toBe(false);
    expect(result.pairs).toEqual({ mutig: false, faul: true });
  });

  it('treats unanswered pairs as wrong', () => {
    expect(gradeMatching(matching, { mutig: 'brave' }).correct).toBe(false);
  });
});

const wordOrder: ExerciseOf<'word-order'> = {
  id: 'w1',
  type: 'word-order',
  tags: [],
  answer: 'Ich bleibe zu Hause, weil ich krank bin.',
  alternatives: ['Weil ich krank bin, bleibe ich zu Hause.'],
};

describe('gradeWordOrder', () => {
  it('accepts the answer built from its own tiles', () => {
    expect(gradeWordOrder(wordOrder, tokenize(wordOrder.answer)).correct).toBe(true);
  });

  it('accepts a listed alternative', () => {
    expect(gradeWordOrder(wordOrder, tokenize(wordOrder.alternatives[0]!)).correct).toBe(true);
  });

  it('rejects the verb in the wrong place', () => {
    const tokens = ['Ich', 'bleibe', 'zu', 'Hause,', 'weil', 'ich', 'bin', 'krank'];
    expect(gradeWordOrder(wordOrder, tokens).correct).toBe(false);
  });
});

const writing: ExerciseOf<'writing'> = {
  id: 'wr1',
  type: 'writing',
  tags: [],
  prompt: 'Say why you are learning German.',
  mustInclude: ['weil'],
  sample: 'Ich lerne Deutsch, weil ich in Deutschland arbeiten möchte.',
};

describe('gradeWriting', () => {
  it('requires the listed words as whole words', () => {
    expect(gradeWriting(writing, 'Ich lerne Deutsch, weil es schön ist.').correct).toBe(true);
    expect(gradeWriting(writing, 'Ich möchte in Berlin verweilen und arbeiten.').correct).toBe(false);
    expect(gradeWriting(writing, 'Ich lerne gern Deutsch.').note).toContain('weil');
  });

  it('rejects answers that are too short', () => {
    expect(gradeWriting(writing, 'weil ja').correct).toBe(false);
  });
});

describe('grade', () => {
  it('dispatches on exercise type', () => {
    const item: ExerciseOf<'multiple-choice'> = {
      id: 'mc1',
      type: 'multiple-choice',
      tags: [],
      prompt: 'freundlich',
      options: ['friendly', 'lazy'],
      answer: 'friendly',
    };
    expect(grade(item, { type: 'multiple-choice', choice: 'friendly' }).correct).toBe(true);
    expect(grade(item, { type: 'multiple-choice', choice: 'lazy' }).correct).toBe(false);
  });

  it('refuses a response of the wrong type', () => {
    expect(() => grade(matching, { type: 'fill-blank', text: 'x' })).toThrow();
  });
});

describe('seededShuffle', () => {
  const items = ['a', 'b', 'c', 'd', 'e'];

  it('is stable for the same seed and keeps every item', () => {
    expect(seededShuffle(items, 'a2.01.w1')).toEqual(seededShuffle(items, 'a2.01.w1'));
    expect([...seededShuffle(items, 'a2.01.w1')].sort()).toEqual(items);
  });

  it('never returns the original order', () => {
    for (let i = 0; i < 200; i++) {
      expect(seededShuffle(['x', 'y'], `seed-${i}`)).toEqual(['y', 'x']);
    }
  });
});

describe('tokenize', () => {
  it('drops the final full stop and keeps commas on their word', () => {
    expect(tokenize('Ich bleibe zu Hause, weil ich krank bin.')).toEqual([
      'Ich', 'bleibe', 'zu', 'Hause,', 'weil', 'ich', 'krank', 'bin',
    ]);
  });
});
