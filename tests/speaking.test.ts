import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { missionSchema } from '../src/lib/content/schema';
import { missionToTalk, speakBank } from '../src/lib/content/speak';
import type { ClientMission } from '../src/lib/content/types';
import { compareSpoken, suggestedGrade } from '../src/lib/hearing';
import { XP } from '../src/lib/progress/logic';
import {
  EAR_PASS,
  emptySpeaking,
  freshPhrases,
  rateSpoken,
  recordEar,
  recordTalk,
  sentencesKnown,
  sessionQueue,
  speakNext,
  spokenDue,
  type BankPhrase,
} from '../src/lib/speaking/logic';
import { clipKey } from '../src/lib/speech';

const now = new Date('2026-10-10T10:00:00');
const later = (minutes: number) => new Date(now.getTime() + minutes * 60_000);

const phrase = (id: string, group: string, level = 'a1'): BankPhrase => ({ id, de: `de ${id}`, en: `en ${id}`, level, group, source: group });
const bank: BankPhrase[] = [
  phrase('talk.weg.ask', 'talk:weg'),
  phrase('talk.weg.far', 'talk:weg'),
  phrase('pack.weiter.again', 'pack:weiter'),
  phrase('pack.termine.move', 'pack:termine', 'a2'),
  phrase('ex.a1.01.hallo', 'a1.01'),
  phrase('ex.a1.02.name', 'a1.02'),
];
const context = { level: 'a1', levels: ['a1', 'a2', 'b1'], finished: new Set(['a1.01']) };

describe('rating a spoken sentence', () => {
  it('schedules a new sentence and pays for it', () => {
    const { state, earned } = rateSpoken(emptySpeaking, 'pack.weiter.again', 'good', now);
    expect(earned).toBe(XP.review.good);
    expect(Object.keys(state.cards)).toEqual(['phrase:pack.weiter.again']);
    expect(spokenDue(state, now)).toEqual([]);
  });

  it('treats a sentence that is not due as free practice', () => {
    const first = rateSpoken(emptySpeaking, 'x', 'good', now).state;
    const again = rateSpoken(first, 'x', 'again', later(1));
    expect(again.earned).toBe(0);
    expect(again.state).toBe(first);
  });

  it('brings a missed sentence back within minutes, and pays again only then', () => {
    const missed = rateSpoken(emptySpeaking, 'x', 'again', now).state;
    expect(spokenDue(missed, later(30))).toEqual(['x']);
    expect(rateSpoken(missed, 'x', 'good', later(30)).earned).toBe(XP.review.good);
  });

  it('does not count a sentence as known until it has left the learning steps', () => {
    const once = rateSpoken(emptySpeaking, 'x', 'good', now).state;
    expect(sentencesKnown(once)).toBe(0);
  });
});

describe('new sentences', () => {
  it('come from packs up to the learner’s level and from finished chapters, in that order', () => {
    expect(freshPhrases(bank, emptySpeaking, context).map((item) => item.id)).toEqual(['pack.weiter.again', 'ex.a1.01.hallo']);
    expect(freshPhrases(bank, emptySpeaking, { ...context, level: 'a2' }).map((item) => item.id)).toContain('pack.termine.move');
  });

  it('put the lines of a conversation already spoken first', () => {
    const state = recordTalk(emptySpeaking, 'weg', 'read');
    expect(freshPhrases(bank, state, context).map((item) => item.id).slice(0, 2)).toEqual(['talk.weg.ask', 'talk.weg.far']);
  });

  it('leave out what is already in the deck', () => {
    const state = rateSpoken(emptySpeaking, 'pack.weiter.again', 'good', now).state;
    expect(freshPhrases(bank, state, context).map((item) => item.id)).toEqual(['ex.a1.01.hallo']);
  });
});

describe('a sitting', () => {
  it('takes what is due first, then a few new ones, within the size', () => {
    let state = emptySpeaking;
    for (const ref of ['a', 'b', 'c']) state = rateSpoken(state, ref, 'again', now).state;
    const fresh = freshPhrases(bank, state, { ...context, finished: new Set(['a1.01', 'a1.02']) });
    expect(sessionQueue(state, fresh, later(30), 10, 2)).toEqual(['a', 'b', 'c', 'pack.weiter.again', 'ex.a1.01.hallo']);
    expect(sessionQueue(state, fresh, later(30), 3, 2)).toEqual(['a', 'b', 'c']);
    expect(sessionQueue(state, fresh, later(30), 4, 2)).toHaveLength(4);
  });
});

describe('what to do next in Speak', () => {
  const input = {
    state: emptySpeaking,
    now,
    level: 'a1',
    conversations: [
      { id: 'weg', level: 'a1', titleDe: 'Nach dem Weg fragen', href: '/speak/conversations/weg/' },
      { id: 'friseur', level: 'a2', titleDe: 'Einen Termin vereinbaren', href: '/speak/conversations/friseur/' },
    ],
    sounds: [{ id: 'ue', title: 'ü', href: '/speak/sounds/ue/' }],
    sentencesHref: '/speak/sentences/',
    examHref: '/speak/exam/a1/',
  };

  it('starts a new learner with a conversation of their level', () => {
    expect(speakNext(input)).toMatchObject({ kind: 'conversation', title: 'Nach dem Weg fragen', action: 'Start the conversation' });
    expect(speakNext({ ...input, level: 'a2' }).title).toBe('Einen Termin vereinbaren');
  });

  it('puts due sentences before anything else', () => {
    const state = rateSpoken(emptySpeaking, 'x', 'again', now).state;
    expect(speakNext({ ...input, state, now: later(30) })).toMatchObject({ kind: 'sentences', title: 'Say 1 sentence' });
  });

  it('asks for less help once a conversation has been read aloud, then moves on to sounds', () => {
    const read = recordTalk(emptySpeaking, 'weg', 'read');
    expect(speakNext({ ...input, state: read }).action).toBe('Speak it with less help');
    const prompted = recordTalk(read, 'weg', 'prompted');
    expect(speakNext({ ...input, state: prompted })).toMatchObject({ kind: 'sound', href: '/speak/sounds/ue/' });
  });

  it('ends at the exam tasks, and never lowers a best score', () => {
    let state = recordTalk(emptySpeaking, 'weg', 'memory');
    state = recordEar(state, 'ue', EAR_PASS);
    expect(recordEar(state, 'ue', 3)).toBe(state);
    expect(recordTalk(state, 'weg', 'read')).toBe(state);
    expect(speakNext({ ...input, state }).kind).toBe('exam');
  });
});

describe('a mission as a conversation', () => {
  const read = (name: string): ClientMission => {
    const data = missionSchema.parse(parse(readFileSync(join(import.meta.dirname, '..', 'src', 'content', 'missions', `${name}.yaml`), 'utf8')));
    const { lessons, steps, order: _order, ...rest } = data;
    const tasks = steps.map((step) => ({ ...step, task: { ...step.task, id: `mission.${name}.${step.task.id}`, lessonKey: `mission.${name}` } }));
    return { ...rest, id: name, href: `/missions/${name}/`, lessonKeys: lessons, lessons: [], taskIds: tasks.map((step) => step.task.id), steps: tasks };
  };

  it('keeps the order of the dialogue and gives every learner line a cue and a stable card', () => {
    const talk = missionToTalk(read('baeckerei'), '/speak/conversations/baeckerei/');
    expect(talk.lines[0]).toMatchObject({ who: 'partner', speaker: 'Verkäuferin', text: 'Guten Morgen! Was darf es sein?' });
    expect(talk.lines[1]).toMatchObject({ who: 'you', ref: 'talk.baeckerei.order', cue: 'You want four bread rolls. What do you say?' });
    const mine = talk.lines.filter((line) => line.who === 'you');
    expect(mine.length).toBeGreaterThanOrEqual(5);
    expect(mine.every((line) => line.cue && line.ref)).toBe(true);
    expect(talk.lines.map((line) => line.text)).toContain('Das macht zusammen vier Euro achtzig.');
    expect(talk.lines.at(-1)?.text).toBe('Danke, gleichfalls! Tschüss!');
    expect(mine.at(-1)?.cue).not.toContain('Listen first');
    expect(talk.missionHref).toBe('/missions/baeckerei/');
  });

  it('does not repeat a line that two listening tasks share', () => {
    const talk = missionToTalk(read('bahnhof'), '/x/');
    const texts = talk.lines.map((line) => line.text);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it('feeds the sentence bank with unique ids', () => {
    const talk = missionToTalk(read('arzt'), '/x/');
    const all = speakBank({ packs: [], talks: [talk], lessons: [] });
    expect(all.length).toBeGreaterThanOrEqual(5);
    expect(new Set(all.map((item) => item.id)).size).toBe(all.length);
    expect(all.every((item) => item.group === 'talk:arzt' && item.de)).toBe(true);
  });
});

describe('what it heard', () => {
  it('ignores capitals, punctuation and the keyboard spelling of umlauts', () => {
    const match = compareSpoken('Können Sie das bitte wiederholen?', 'koennen sie das bitte wiederholen');
    expect(match).toMatchObject({ matched: 5, total: 5 });
    expect(suggestedGrade(match)).toBe('good');
  });

  it('marks the words that were not heard, in place', () => {
    const match = compareSpoken('Ich hätte gern zwei Brötchen, bitte.', 'ich hatte gern zwei bitte');
    expect(match.words.map((word) => (word.heard ? word.text : `(${word.text})`)).join(' ')).toBe('Ich (hätte) gern zwei (Brötchen,) bitte.');
    expect(match).toMatchObject({ matched: 4, total: 6 });
    expect(suggestedGrade(match)).toBe('hard');
  });

  it('accepts small numbers written as digits', () => {
    expect(compareSpoken('Hier sind fünf Euro.', 'hier sind 5 €')).toMatchObject({ matched: 4, total: 4 });
  });

  it('suggests "not yet" when little or nothing was heard', () => {
    expect(suggestedGrade(compareSpoken('Wie spät ist es?', ''))).toBe('again');
    expect(suggestedGrade(compareSpoken('Wie spät ist es?', 'Modellbagger'))).toBe('again');
  });
});

describe('clip names', () => {
  it('are the same in the browser and in scripts/make_audio.py', () => {
    // Values printed by `python scripts/make_audio.py --self-test`.
    expect(clipKey('Tür')).toBe('78e8ad72');
    expect(clipKey('Guten Morgen! Was darf es sein?')).toBe('0f5f80c7');
    expect(clipKey('  Straße ')).toBe('1dc32e38');
    expect(clipKey('  Straße ')).toBe(clipKey('Straße'));
    // The same letter typed as one character or as a + combining dots.
    expect(clipKey('ä')).toBe(clipKey('ä'));
  });
});
