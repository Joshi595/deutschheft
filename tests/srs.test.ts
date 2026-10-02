import { describe, expect, it } from 'vitest';
import { cardId, dueCards, enroll, isDue, newCard, schedule } from '../src/lib/srs/scheduler';

const now = new Date('2026-10-02T09:00:00Z');
const later = (minutes: number) => new Date(now.getTime() + minutes * 60_000);
const days = (count: number) => later(count * 24 * 60);

describe('scheduler', () => {
  it('makes a new card due straight away', () => {
    const card = newCard('vocab', 'a2.01.freundlich', now);
    expect(isDue(card, now)).toBe(true);
    expect(card).toMatchObject({ kind: 'vocab', ref: 'a2.01.freundlich', reps: 0 });
  });

  it('pushes a card further out for a better grade', () => {
    const card = newCard('vocab', 'x', now);
    const again = new Date(schedule(card, 'again', now).due).getTime();
    const good = new Date(schedule(card, 'good', now).due).getTime();
    const easy = new Date(schedule(card, 'easy', now).due).getTime();
    expect(again).toBeGreaterThan(now.getTime());
    expect(good).toBeGreaterThan(again);
    expect(easy).toBeGreaterThan(good);
  });

  it('grows the interval across successful reviews', () => {
    let card = newCard('vocab', 'x', now);
    card = schedule(card, 'easy', now);
    const firstGap = new Date(card.due).getTime() - now.getTime();
    const second = new Date(card.due);
    card = schedule(card, 'good', second);
    const secondGap = new Date(card.due).getTime() - second.getTime();
    expect(secondGap).toBeGreaterThan(firstGap);
    expect(card.reps).toBe(2);
  });

  it('survives a JSON round trip', () => {
    const card = schedule(newCard('exercise', 'a2.01.mc1', now), 'good', now);
    const restored = JSON.parse(JSON.stringify(card));
    expect(schedule(restored, 'good', days(1))).toEqual(schedule(card, 'good', days(1)));
  });
});

describe('deck', () => {
  it('enrols only cards that are missing', () => {
    let deck = enroll({}, 'vocab', ['a', 'b'], now);
    deck = { ...deck, [cardId('vocab', 'a')]: schedule(deck[cardId('vocab', 'a')]!, 'easy', now) };
    const after = enroll(deck, 'vocab', ['a', 'b', 'c'], later(5));
    expect(Object.keys(after).sort()).toEqual(['vocab:a', 'vocab:b', 'vocab:c']);
    expect(after['vocab:a']).toEqual(deck['vocab:a']);
  });

  it('returns the same object when nothing is new', () => {
    const deck = enroll({}, 'vocab', ['a'], now);
    expect(enroll(deck, 'vocab', ['a'], later(5))).toBe(deck);
  });

  it('lists due cards oldest first and leaves out future ones', () => {
    let deck = enroll({}, 'vocab', ['old'], now);
    deck = enroll(deck, 'vocab', ['new'], later(10));
    deck = enroll(deck, 'vocab', ['done'], now);
    deck = { ...deck, 'vocab:done': schedule(deck['vocab:done']!, 'easy', now) };
    expect(dueCards(deck, later(20)).map(([id]) => id)).toEqual(['vocab:old', 'vocab:new']);
  });
});
