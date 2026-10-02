import { createEmptyCard, fsrs, Rating, type Card, type Grade } from 'ts-fsrs';

/**
 * Spaced-repetition scheduling (FSRS). Cards are stored as plain JSON, so dates
 * are ISO strings here and converted at the boundary.
 */

export type CardKind = 'vocab' | 'exercise' | 'custom';

export interface StoredCard {
  kind: CardKind;
  /** Id of the vocab item, exercise or saved word this card reviews. */
  ref: string;
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review?: string;
}

export type ReviewState = Record<string, StoredCard>;

export type ReviewGrade = 'again' | 'hard' | 'good' | 'easy';

const GRADES: Record<ReviewGrade, Grade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

const scheduler = fsrs();

export function cardId(kind: CardKind, ref: string): string {
  return `${kind}:${ref}`;
}

function toStored(card: Card, kind: CardKind, ref: string): StoredCard {
  return {
    kind,
    ref,
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review?.toISOString(),
  };
}

/** A new card is due immediately. */
export function newCard(kind: CardKind, ref: string, now: Date): StoredCard {
  return toStored(createEmptyCard(now), kind, ref);
}

export function schedule(card: StoredCard, grade: ReviewGrade, now: Date): StoredCard {
  const { kind, ref, ...fsrsCard } = card;
  const { card: next } = scheduler.next(fsrsCard, now, GRADES[grade]);
  return toStored(next, kind, ref);
}

/** Add cards that are not in the deck yet; existing cards keep their schedule. */
export function enroll(state: ReviewState, kind: CardKind, refs: readonly string[], now: Date): ReviewState {
  const additions: ReviewState = {};
  for (const ref of refs) {
    const id = cardId(kind, ref);
    if (!state[id]) additions[id] = newCard(kind, ref, now);
  }
  return Object.keys(additions).length === 0 ? state : { ...state, ...additions };
}

export function isDue(card: StoredCard, now: Date): boolean {
  return new Date(card.due).getTime() <= now.getTime();
}

/** Cards due now, oldest first. */
export function dueCards(state: ReviewState, now: Date): [id: string, card: StoredCard][] {
  return Object.entries(state)
    .filter(([, card]) => isDue(card, now))
    .sort(([, a], [, b]) => new Date(a.due).getTime() - new Date(b.due).getTime());
}
