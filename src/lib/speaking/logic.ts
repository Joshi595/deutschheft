import { XP } from '../progress/logic';
import { cardId, dueCards, isDue, newCard, schedule, type ReviewGrade, type ReviewState } from '../srs/scheduler';

/**
 * Pure rules of the Speak section. The persistent store in ../stores.ts applies them.
 *
 * Everything said from memory is a card in one deck, scheduled like a review
 * card. A conversation practised today therefore comes back as single
 * sentences over the following days.
 */

export interface SpeakingState {
  /** Sentences said aloud, by card id ("phrase:<ref>"). */
  cards: ReviewState;
  /** Best ear-training score per sound, out of EAR_ROUND. */
  ears: Record<string, number>;
  /** Most demanding help level finished per conversation: 1 read, 2 prompted, 3 from memory. */
  talks: Record<string, number>;
}

export const emptySpeaking: SpeakingState = { cards: {}, ears: {}, talks: {} };

/** Trials in one ear-training round, and how many must be right to pass a sound. */
export const EAR_ROUND = 8;
export const EAR_PASS = 7;

/** Help levels of a conversation. Reading a line aloud is not recall, so level 1 is never rated. */
export const TALK_HELP = { read: 1, prompted: 2, memory: 3 } as const;
export type TalkHelp = keyof typeof TALK_HELP;

/** A learner rates their own spoken attempt; "easy" would only invite flattery. */
export type SpokenGrade = Exclude<ReviewGrade, 'easy'>;

/** One sentence that can be practised aloud. */
export interface BankPhrase {
  /** Stable id: "pack.<pack>.<phrase>", "talk.<conversation>.<line>" or "ex.<vocab id>". */
  id: string;
  de: string;
  en: string;
  /** What the learner wants to do, as an instruction. Falls back to the English. */
  cue?: string;
  level: string;
  /** Where it comes from: "pack:<id>", "talk:<id>" or a lesson key. */
  group: string;
  /** Title of that pack, conversation or chapter. */
  source: string;
}

const refOf = (id: string) => id.slice('phrase:'.length);

/**
 * Rate one spoken sentence. A new or due sentence is scheduled and earns points.
 * One that is not due is free practice: nothing changes, so repeating a
 * conversation cannot be used to collect points or to push cards away.
 */
export function rateSpoken(state: SpeakingState, ref: string, grade: SpokenGrade, now: Date): { state: SpeakingState; earned: number } {
  const id = cardId('phrase', ref);
  const card = state.cards[id] ?? newCard('phrase', ref, now);
  if (!isDue(card, now)) return { state, earned: 0 };
  return { state: { ...state, cards: { ...state.cards, [id]: schedule(card, grade, now) } }, earned: XP.review[grade] };
}

/** Refs of the sentences due now, the longest overdue first. */
export function spokenDue(state: SpeakingState, now: Date): string[] {
  return dueCards(state.cards, now).map(([id]) => refOf(id));
}

/** A sentence counts as known once it has been said from memory and has not slipped since. */
export function sentencesKnown(state: SpeakingState): number {
  return Object.values(state.cards).filter((card) => card.reps > 0 && card.state === 2).length;
}

export function soundsPassed(state: SpeakingState): number {
  return Object.values(state.ears).filter((score) => score >= EAR_PASS).length;
}

export function talksFinished(state: SpeakingState): number {
  return Object.values(state.talks).filter((help) => help >= TALK_HELP.read).length;
}

export function recordEar(state: SpeakingState, sound: string, score: number): SpeakingState {
  return score > (state.ears[sound] ?? 0) ? { ...state, ears: { ...state.ears, [sound]: score } } : state;
}

export function recordTalk(state: SpeakingState, conversation: string, help: TalkHelp): SpeakingState {
  const level = TALK_HELP[help];
  return level > (state.talks[conversation] ?? 0) ? { ...state, talks: { ...state.talks, [conversation]: level } } : state;
}

export interface FreshContext {
  /** The learner's level, e.g. "a2". */
  level: string;
  /** Every level id in course order. */
  levels: readonly string[];
  /** Keys of the chapters the learner has finished. */
  finished: ReadonlySet<string>;
}

/**
 * Sentences not yet in the deck, in the order they should be introduced:
 * lines of conversations the learner has already spoken, then the phrase packs
 * up to their level, then example sentences of chapters they finished.
 */
export function freshPhrases(bank: readonly BankPhrase[], state: SpeakingState, context: FreshContext): BankPhrase[] {
  const reach = context.levels.indexOf(context.level);
  const withinLevel = (phrase: BankPhrase) => context.levels.indexOf(phrase.level) <= reach;
  const unseen = bank.filter((phrase) => !state.cards[cardId('phrase', phrase.id)]);
  return [
    ...unseen.filter((phrase) => phrase.group.startsWith('talk:') && (state.talks[phrase.group.slice(5)] ?? 0) > 0),
    ...unseen.filter((phrase) => phrase.group.startsWith('pack:') && withinLevel(phrase)),
    ...unseen.filter((phrase) => context.finished.has(phrase.group)),
  ];
}

/** One sitting: what is due first, then a few new sentences, never more than `size` in all. */
export function sessionQueue(state: SpeakingState, fresh: readonly BankPhrase[], now: Date, size = 10, maxNew = 5): string[] {
  const due = spokenDue(state, now).slice(0, size);
  return [...due, ...fresh.slice(0, Math.min(maxNew, size - due.length)).map((phrase) => phrase.id)];
}

export interface SpeakStep {
  kind: 'sentences' | 'conversation' | 'sound' | 'exam';
  title: string;
  /** Why this is suggested, from what the learner has done. */
  reason: string;
  action: string;
  href: string;
}

export interface SpeakNextInput {
  state: SpeakingState;
  now: Date;
  level: string;
  conversations: readonly { id: string; level: string; titleDe: string; href: string }[];
  sounds: readonly { id: string; title: string; href: string }[];
  sentencesHref: string;
  examHref: string;
}

/**
 * The one thing to do next in the Speak section: sentences that are due, else a
 * conversation of the learner's level not yet spoken without the text, else the
 * next sound not yet passed by ear, else a timed exam task.
 */
export function speakNext({ state, now, level, conversations, sounds, sentencesHref, examHref }: SpeakNextInput): SpeakStep {
  const due = spokenDue(state, now).length;
  if (due > 0) {
    const count = Math.min(due, 10);
    return {
      kind: 'sentences',
      title: `Say ${count} ${count === 1 ? 'sentence' : 'sentences'}`,
      reason: `${due === 1 ? 'One sentence is' : `${due} sentences are`} due again. Saying them now, before they fade, is what makes them automatic.`,
      action: 'Start speaking',
      href: sentencesHref,
    };
  }

  const talk = conversations.find((candidate) => candidate.level === level && (state.talks[candidate.id] ?? 0) < TALK_HELP.prompted);
  if (talk) {
    const started = (state.talks[talk.id] ?? 0) > 0;
    return {
      kind: 'conversation',
      title: talk.titleDe,
      reason: started
        ? 'You have read this conversation aloud. Now say your lines with only a cue to go on.'
        : 'A short conversation. The app speaks the other person, you speak your part.',
      action: started ? 'Speak it with less help' : 'Start the conversation',
      href: talk.href,
    };
  }

  const sound = sounds.find((candidate) => (state.ears[candidate.id] ?? 0) < EAR_PASS);
  if (sound) {
    return {
      kind: 'sound',
      title: `The sound ${sound.title}`,
      reason: 'Train your ear first: you can only say a difference that you can hear.',
      action: 'Practise this sound',
      href: sound.href,
    };
  }

  return {
    kind: 'exam',
    title: 'A timed speaking task',
    reason: 'Nothing is due, and you have been through the conversations and sounds of your level. Speak against the clock, as in the exam.',
    action: 'Open the exam tasks',
    href: examHref,
  };
}
