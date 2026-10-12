import { useStore } from '@nanostores/react';
import { useEffect, useMemo, useState } from 'react';
import { readCourse } from '../../lib/content/course';
import { currentLevel } from '../../lib/progress/coach';
import { completion, localDay, totalXp, xpOn } from '../../lib/progress/logic';
import { freshPhrases, sentencesKnown, sessionQueue, spokenDue, type BankPhrase, type SpokenGrade } from '../../lib/speaking/logic';
import { $progress, $quizzes, $review, $settings, $speaking, rateSpokenCard } from '../../lib/stores';
import { SessionBar, useStepFocus } from '../session/Session';
import { GoalRing } from '../ui/GoalRing';
import { SpeakTurn } from './SpeakTurn';

interface Props {
  /** Address of the sentence bank (a static JSON file). */
  bankHref: string;
  speakHref: string;
  conversationsHref: string;
}

/** A sentence is either met for the first time (read aloud) or said from the cue alone. */
interface Turn {
  phrase: BankPhrase;
  intro: boolean;
}

type View = { name: 'start' } | { name: 'session'; queue: Turn[]; at: number } | { name: 'done'; said: number; points: number };

/**
 * Sentences said aloud from a cue. What is due comes first. A new sentence is
 * first read aloud with the model, and comes round again at the end of the
 * sitting to be said from the cue alone.
 */
export default function SentenceSession({ bankHref, speakHref, conversationsHref }: Props) {
  const speaking = useStore($speaking);
  const progress = useStore($progress);
  const settings = useStore($settings);
  const [bank, setBank] = useState<BankPhrase[] | 'failed'>();
  const [view, setView] = useState<View>({ name: 'start' });
  const [startPoints, setStartPoints] = useState(0);
  const stepRef = useStepFocus(view.name === 'session' ? view.at : -1);

  function load() {
    setBank(undefined);
    fetch(bankHref)
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then(setBank)
      .catch(() => setBank('failed'));
  }
  useEffect(load, [bankHref]);

  const course = readCourse();
  const fresh = useMemo(() => {
    if (!Array.isArray(bank)) return [];
    const learner = { progress, review: $review.get(), quizzes: $quizzes.get(), level: settings.level };
    const finished = new Set(
      course.levels
        .flatMap((level) => level.lessons)
        .filter((lesson) => completion(progress, lesson.exercises.map((exercise) => exercise.id)).complete)
        .map((lesson) => lesson.key),
    );
    return freshPhrases(bank, speaking, {
      level: currentLevel(course, learner)?.id ?? course.levels[0]?.id ?? '',
      levels: course.levels.map((level) => level.id),
      finished,
    });
  }, [bank, speaking, progress, settings.level, course]);

  if (bank === undefined) return <div className="card p-6 text-muted">Loading your sentences …</div>;
  if (bank === 'failed') {
    return (
      <div className="card p-6">
        <p className="font-semibold">The sentences could not be loaded.</p>
        <p className="mt-1 text-muted">This needs a connection the first time. After that it also works offline.</p>
        <button type="button" className="btn mt-4" onClick={load}>
          Try again
        </button>
      </div>
    );
  }

  const byId = new Map(bank.map((phrase) => [phrase.id, phrase]));
  const due = spokenDue(speaking, new Date()).filter((ref) => byId.has(ref));

  function start() {
    const refs = sessionQueue({ ...speaking }, fresh, new Date());
    const inDeck = (ref: string) => speaking.cards[`phrase:${ref}`] !== undefined;
    const recalls = refs.filter(inDeck).map((ref) => ({ phrase: byId.get(ref)!, intro: false }));
    const news = refs.filter((ref) => !inDeck(ref)).map((ref) => byId.get(ref)!);
    // Due sentences, then the new ones read aloud, then the new ones again from the cue.
    const queue = [...recalls, ...news.map((phrase) => ({ phrase, intro: true })), ...news.map((phrase) => ({ phrase, intro: false }))].filter(
      (turn) => turn.phrase,
    );
    setStartPoints(totalXp($progress.get()));
    setView({ name: 'session', queue, at: 0 });
  }

  if (view.name === 'session') {
    const turn = view.queue[view.at]!;
    const { phrase } = turn;
    const next = (grade?: SpokenGrade) => {
      // Meeting a sentence puts it in the deck as "not known yet", so it is due again within minutes.
      rateSpokenCard(phrase.id, turn.intro ? 'again' : (grade ?? 'again'));
      const at = view.at + 1;
      setView(at < view.queue.length ? { ...view, at } : { name: 'done', said: view.queue.length, points: totalXp($progress.get()) - startPoints });
    };
    return (
      <div className="grid gap-5">
        <SessionBar position={view.at} total={view.queue.length} label="Sentences in this sitting" onExit={() => setView({ name: 'start' })} />
        <div key={`${phrase.id}-${turn.intro}`} ref={stepRef} tabIndex={-1} role="group" aria-label={`Sentence ${view.at + 1} of ${view.queue.length}`} className="rise grid gap-2 outline-none">
          <SpeakTurn
            id={phrase.id}
            cue={
              <>
                {turn.intro && <span className="chip chip-accent mr-2 align-middle">New</span>}
                {phrase.cue ?? phrase.en}
              </>
            }
            text={phrase.de}
            en={phrase.cue ? phrase.en : undefined}
            show={turn.intro}
            rated={!turn.intro}
            onDone={next}
            doneLabel="I have read it aloud"
          />
          <p className="text-sm text-muted">From: {phrase.source}</p>
        </div>
      </div>
    );
  }

  const today = xpOn(progress, localDay(new Date()));

  if (view.name === 'done') {
    return (
      <div className="page rise p-5 pl-9 sm:p-8 sm:pl-12" aria-live="polite">
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div>
            <p className="eyebrow" lang="de">Gut gesprochen!</p>
            <h2 className="mt-1 text-3xl">Sitting done</h2>
            <p className="mt-2 text-muted">
              <span className="font-semibold text-ink tabular-nums">{view.said}</span> turns spoken
              {view.points > 0 && (
                <>
                  , <span className="font-semibold text-ink tabular-nums">+{view.points} points</span>
                </>
              )}
              . What you missed comes back first next time.
            </p>
          </div>
          <GoalRing earned={today} goal={settings.dailyGoal} />
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          {(due.length > 0 || fresh.length > 0) && (
            <button type="button" className="btn btn-accent" onClick={start} autoFocus>
              Another sitting
            </button>
          )}
          <a href={speakHref} className="btn">
            Back to Speak
          </a>
        </div>
      </div>
    );
  }

  const deck = Object.keys(speaking.cards).length;
  const available = due.length > 0 || fresh.length > 0;

  return (
    <div className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
        <div>
          <p className="font-display text-2xl font-semibold">
            {due.length > 0
              ? `${due.length} ${due.length === 1 ? 'sentence is' : 'sentences are'} due`
              : fresh.length > 0
                ? 'New sentences are ready'
                : deck > 0
                  ? 'Nothing is due right now'
                  : 'No sentences yet'}
          </p>
          <p className="mt-1 text-muted">
            {available
              ? 'You get a cue, say the German aloud, then hear the model and rate yourself. About three minutes.'
              : deck > 0
                ? 'They come back when their time is up. A conversation or a finished chapter adds new ones.'
                : 'Sentences come from the phrase packs of your level, from conversations you have spoken, and from chapters you have finished.'}
          </p>
        </div>
        {available ? (
          <button type="button" className="btn btn-accent btn-lg" onClick={start}>
            Start speaking
          </button>
        ) : (
          <a href={conversationsHref} className="btn btn-accent btn-lg">
            Speak a conversation
          </a>
        )}
      </div>
      <p className="mt-5 border-t border-line pt-4 text-sm text-muted tabular-nums">
        {deck} {deck === 1 ? 'sentence' : 'sentences'} in rotation, {sentencesKnown(speaking)} you can say reliably, {fresh.length} new ones waiting.
      </p>
    </div>
  );
}
