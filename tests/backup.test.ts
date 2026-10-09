import { describe, expect, it } from 'vitest';
import { buildBackup, parseBackup, type BackupData } from '../src/lib/backup';
import { addWord, emptyNotebook, logMistake, matches, MAX_MISTAKES, setNote } from '../src/lib/notebook/logic';
import { addXp, applyAttempt, emptyProgress } from '../src/lib/progress/logic';
import { enroll } from '../src/lib/srs/scheduler';

const now = new Date('2026-10-02T09:00:00Z');

describe('backup', () => {
  it('round-trips everything the learner has stored', () => {
    const data: BackupData = {
      progress: addXp(applyAttempt(emptyProgress, 'a2.01.mc1', true, now), 10, now),
      review: enroll({}, 'vocab', ['a2.01.freundlich'], now),
      notebook: setNote(emptyNotebook, 'a2.01', 'Predicate adjectives take no ending.'),
      quizzes: {
        'exam:a1/modelltest-1': [
          { at: now.toISOString(), total: 72, passed: true, sections: [{ skill: 'reading', points: 18, max: 25 }] },
        ],
      },
    };
    const json = JSON.stringify(buildBackup(data, now));
    expect(parseBackup(json)).toEqual(data);
  });

  it('rejects files that are not backups', () => {
    expect(() => parseBackup('not json')).toThrow('not valid JSON');
    expect(() => parseBackup('{"hello":1}')).toThrow('not a Learn German backup');
    expect(() => parseBackup('{"app":"learn-german","version":99}')).toThrow('newer version');
  });

  it('fills in missing sections with empty values, including in a version 1 backup', () => {
    expect(parseBackup('{"app":"learn-german","version":1}')).toEqual({
      progress: emptyProgress,
      review: {},
      notebook: emptyNotebook,
      quizzes: {},
    });
  });
});

describe('notebook', () => {
  it('removes a note when it is cleared', () => {
    const withNote = setNote(emptyNotebook, 'a2.01', 'hello');
    expect(setNote(withNote, 'a2.01', '   ').notes).toEqual({});
  });

  it('replaces a saved word with the same id and puts it first', () => {
    let state = addWord(emptyNotebook, { id: '1', de: 'der Hund', en: 'dog', at: now.toISOString() });
    state = addWord(state, { id: '2', de: 'die Katze', en: 'cat', at: now.toISOString() });
    state = addWord(state, { id: '1', de: 'der Hund', en: 'the dog', at: now.toISOString() });
    expect(state.words.map((w) => w.id)).toEqual(['1', '2']);
    expect(state.words[0]!.en).toBe('the dog');
  });

  it('caps the mistakes log, newest first', () => {
    let state = emptyNotebook;
    for (let i = 0; i < MAX_MISTAKES + 5; i++) {
      state = logMistake(state, {
        exerciseId: `e${i}`, lessonKey: 'a2.01', prompt: '', given: '', expected: '', at: now.toISOString(),
      });
    }
    expect(state.mistakes).toHaveLength(MAX_MISTAKES);
    expect(state.mistakes[0]!.exerciseId).toBe(`e${MAX_MISTAKES + 4}`);
  });

  it('searches without caring about case or umlauts', () => {
    expect(matches('schuch', 'schüchtern')).toBe(true);
    expect(matches('STRASSE', 'die Straße')).toBe(true);
    expect(matches('', 'anything')).toBe(true);
    expect(matches('hund', 'die Katze', undefined)).toBe(false);
  });
});
