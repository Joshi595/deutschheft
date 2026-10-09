import { useStore } from '@nanostores/react';
import { useEffect, useMemo, useState } from 'react';
import type { ClientExercise, ClientVocabItem } from '../../lib/content/types';
import { gradeText } from '../../lib/grading/grade';
import { localDay, totalXp, xpOn } from '../../lib/progress/logic';
import { speak } from '../../lib/speech';
import { dueCards, type ReviewGrade, type StoredCard } from '../../lib/srs/scheduler';
import { $notebook, $progress, $review, $settings, rateCard } from '../../lib/stores';
import { ExerciseCard } from '../exercises/ExerciseCard';
import { GermanInput } from '../exercises/GermanInput';
import { GoalRing } from '../ui/GoalRing';

interface Props {
  vocab: ClientVocabItem[];
  exercises: ClientExercise[];
  /** Lesson titles and links by lesson key. */
  lessons: Record<string, { title: string; href: string }>;
  homeHref: string;
}

/** Cards per sitting; more than this and a review stops feeling short. */
const SESSION_SIZE = 20;

interface Flashcard {
  front: string;
  back: string;
  detail?: string;
  example?: string;
  exampleEn?: string;
  lessonKey?: string;
}

const GRADES: { grade: ReviewGrade; label: string; hint: string; className: string }[] = [
  { grade: 'again', label: 'Again', hint: 'Did not know it', className: 'hover:border-bad hover:text-bad' },
  { grade: 'hard', label: 'Hard', hint: 'Only just', className: '' },
  { grade: 'good', label: 'Good', hint: 'Knew it', className: 'hover:border-good hover:text-good' },
  { grade: 'easy', label: 'Easy', hint: 'Instantly', className: '' },
];

/** What counts as a right typed answer: the card's German, with or without a bracketed note, or one of its alternatives. */
function acceptedFor(back: string): string[] {
  const plain = back.replace(/\s*\([^)]*\)/g, '').trim();
  return [...new Set([back, plain, ...plain.split(/\s*\/\s*/)])].filter(Boolean);
}

function untilText(due: Date, now: Date): string {
  const minutes = Math.max(1, Math.round((due.getTime() - now.getTime()) / 60_000));
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `in ${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  const days = Math.round(hours / 24);
  return `in ${days} ${days === 1 ? 'day' : 'days'}`;
}

export default function ReviewSession({ vocab, exercises, lessons, homeHref }: Props) {
  const review = useStore($review);
  const notebook = useStore($notebook);
  const settings = useStore($settings);

  const vocabById = useMemo(() => new Map(vocab.map((item) => [item.id, item])), [vocab]);
  const exerciseById = useMemo(() => new Map(exercises.map((item) => [item.id, item])), [exercises]);

  function flashcardFor(card: StoredCard): Flashcard | undefined {
    if (card.kind === 'vocab') {
      const item = vocabById.get(card.ref);
      if (!item) return undefined;
      return {
        front: item.en,
        back: item.article ? `${item.article} ${item.de}` : item.de,
        detail: item.plural && item.plural !== '-' ? `pl. die ${item.plural}` : undefined,
        example: item.example,
        exampleEn: item.exampleEn,
        lessonKey: item.lessonKey,
      };
    }
    if (card.kind === 'custom') {
      const word = notebook.words.find((candidate) => candidate.id === card.ref);
      return word && { front: word.en, back: word.de, detail: word.note, lessonKey: word.lessonKey };
    }
    return undefined;
  }

  /** Cards whose content was removed stay in storage but are never shown. */
  function resolvable(card: StoredCard): boolean {
    return card.kind === 'exercise' ? exerciseById.has(card.ref) : flashcardFor(card) !== undefined;
  }

  function dueNow(): string[] {
    return dueCards($review.get(), new Date())
      .filter(([, card]) => resolvable(card))
      .map(([id]) => id);
  }

  // The queue is a snapshot: a card rated "again" comes back in a later round, not instantly.
  const [queue, setQueue] = useState<string[]>(() => dueNow().slice(0, SESSION_SIZE));
  const [position, setPosition] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [typed, setTyped] = useState('');
  const [exerciseResult, setExerciseResult] = useState<boolean | null>(null);
  const [reviewed, setReviewed] = useState(0);
  const [startPoints] = useState(() => totalXp($progress.get()));
  const goal = settings.dailyGoal;
  const progress = useStore($progress);

  const currentId = queue[position];
  const current = currentId ? review[currentId] : undefined;
  const flashcard = current ? flashcardFor(current) : undefined;
  const exercise = current?.kind === 'exercise' ? exerciseById.get(current.ref) : undefined;

  // A typed answer is checked against the card; the learner still decides how well they knew it.
  const check = flashcard && typed.trim() ? gradeText(typed, acceptedFor(flashcard.back)) : undefined;
  const suggested: ReviewGrade | undefined = check ? (check.correct ? 'good' : 'again') : undefined;

  function advance(grade: ReviewGrade) {
    if (!currentId) return;
    rateCard(currentId, grade);
    setReviewed(reviewed + 1);
    setRevealed(false);
    setTyped('');
    setExerciseResult(null);
    setPosition(position + 1);
  }

  function nextRound() {
    setQueue(dueNow().slice(0, SESSION_SIZE));
    setPosition(0);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!flashcard || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (!revealed && (event.key === ' ' || event.key === 'Enter')) {
        event.preventDefault();
        setRevealed(true);
      } else if (revealed && ['1', '2', '3', '4'].includes(event.key)) {
        advance(GRADES[Number(event.key) - 1]!.grade);
      } else if (revealed && suggested && event.key === 'Enter') {
        advance(suggested);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // --- Nothing to show ------------------------------------------------------

  if (!current) {
    const remaining = dueNow().length;
    const deckSize = Object.values(review).filter(resolvable).length;
    const upcoming = Object.values(review)
      .filter(resolvable)
      .map((card) => new Date(card.due))
      .filter((due) => due.getTime() > Date.now())
      .sort((a, b) => a.getTime() - b.getTime())[0];

    // Words that have slipped at least twice, worst first: the learner's own difficult list.
    const slipping = Object.values(review)
      .filter((card) => card.kind !== 'exercise' && card.lapses >= 2)
      .sort((a, b) => b.lapses - a.lapses)
      .flatMap((card) => {
        const word = flashcardFor(card);
        return word ? [{ ...word, lapses: card.lapses }] : [];
      })
      .slice(0, 8);
    const earned = totalXp(progress) - startPoints;

    return (
      <div className="grid gap-6">
      <div className="card p-6 sm:p-8">
        {reviewed > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-5">
            <div>
              <p className="eyebrow" lang="de">Geschafft!</p>
              <h2 className="mt-1 text-3xl">
                {reviewed} {reviewed === 1 ? 'card' : 'cards'} reviewed
              </h2>
              {earned > 0 && <p className="mt-1 text-muted tabular-nums">+{earned} points</p>}
            </div>
            <GoalRing earned={xpOn(progress, localDay(new Date()))} goal={goal} />
          </div>
        ) : deckSize === 0 ? (
          <>
            <p className="eyebrow">Nothing here yet</p>
            <h2 className="mt-2 text-3xl">Your review deck is empty.</h2>
            <p className="mt-3 text-muted">
              Cards are added for you: a lesson's vocabulary when you start its exercises, every exercise you miss,
              and any word you save in your notebook.
            </p>
          </>
        ) : (
          <>
            <p className="eyebrow">All caught up</p>
            <h2 className="mt-2 text-3xl">Nothing is due right now.</h2>
          </>
        )}

        {remaining > 0 ? (
          <div className="mt-5">
            <p className="text-muted">
              {remaining} {remaining === 1 ? 'card is' : 'cards are'} due.
            </p>
            <button type="button" className="btn btn-primary mt-3" onClick={nextRound}>
              Keep going
            </button>
          </div>
        ) : (
          <div className="mt-5">
            {upcoming && (
              <p className="text-muted">
                Next card due {untilText(upcoming, new Date())}. {deckSize} {deckSize === 1 ? 'card' : 'cards'} in your deck.
              </p>
            )}
            <a href={homeHref} className="btn mt-3">
              Back to Today
            </a>
          </div>
        )}
      </div>

      {slipping.length > 0 && (
        <section className="card p-5" aria-labelledby="slipping">
          <h2 id="slipping" className="text-xl">Words that keep slipping</h2>
          <p className="mt-1 text-sm text-muted">
            The ones you have forgotten most often. They already come up more often in review; saying them aloud helps too.
          </p>
          <ul className="mt-3 divide-y divide-line">
            {slipping.map((word) => (
              <li key={word.back} className="flex items-center gap-2 py-2">
                <button type="button" className="speak" onClick={() => speak(word.back, settings.speechRate)} aria-label={`Listen: ${word.back}`} title="Listen">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M11 5 6 9H3v6h3l5 4z" />
                    <path d="M15.5 8.5a5 5 0 0 1 0 7" />
                  </svg>
                </button>
                <span className="min-w-0 flex-1">
                  <span className="de" lang="de">{word.back}</span> <span className="text-muted">{word.front}</span>
                </span>
                <span className="text-sm text-muted tabular-nums">slipped {word.lapses} times</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      </div>
    );
  }
  // --- A card ---------------------------------------------------------------

  const lesson = lessons[exercise?.lessonKey ?? flashcard?.lessonKey ?? ''];

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-3">
        <div className="meter-track flex-1">
          <div className="meter-fill" style={{ width: `${(position / queue.length) * 100}%` }} />
        </div>
        <span className="text-sm text-muted tabular-nums">
          {position + 1} / {queue.length}
        </span>
      </div>

      {exercise && (
        <>
          <p className="text-sm text-muted">
            An exercise you missed{lesson && <> in <a href={lesson.href} className="underline underline-offset-4">{lesson.title}</a></>}.
          </p>
          <ExerciseCard
            key={currentId}
            item={exercise}
            number={position + 1}
            topic={lesson?.title ?? ''}
            maxAttempts={1}
            onFinish={setExerciseResult}
            onNext={() => advance(exerciseResult ? 'good' : 'again')}
            nextLabel="Next card"
          />
        </>
      )}

      {flashcard && (
        <div className="card p-6 sm:p-10">
          <p className="eyebrow">How do you say it in German?</p>
          <p className="font-display mt-3 text-3xl sm:text-4xl">{flashcard.front}</p>

          {!revealed ? (
            <div className="mt-6 grid gap-3">
              <GermanInput
                label="Your answer in German"
                placeholder="Type it, or just say it"
                value={typed}
                onChange={setTyped}
                onSubmit={() => setRevealed(true)}
              />
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" className="btn btn-accent" onClick={() => setRevealed(true)}>
                  {typed.trim() ? 'Check' : 'Show answer'}
                </button>
                <span className="text-sm text-muted">Typing is optional. A noun needs its article.</span>
              </div>
            </div>
          ) : (
            <div className="mt-8 border-t border-line pt-6">
              {check && (
                <p className={`mb-5 rounded-xl px-4 py-3 ${check.correct ? 'pop bg-good-soft text-good' : 'shake bg-bad-soft text-bad'}`}>
                  <span className="font-semibold" lang="de">{check.correct ? 'Richtig!' : 'Nicht ganz.'}</span> You wrote{' '}
                  <span className="de" lang="de">{typed.trim()}</span>. {check.note}
                </p>
              )}
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="de font-display text-3xl sm:text-4xl" lang="de">{flashcard.back}</span>
                <button type="button" className="listen btn btn-small" onClick={() => speak(flashcard.back, settings.speechRate)}>
                  Listen
                </button>
              </p>
              {flashcard.detail && <p className="mt-1 text-muted">{flashcard.detail}</p>}
              {flashcard.example && (
                <p className="mt-4">
                  <span lang="de">{flashcard.example}</span>
                  {flashcard.exampleEn && <span className="block text-sm text-muted">{flashcard.exampleEn}</span>}
                </p>
              )}
              <p className="mt-8 text-sm text-muted">
                How well did you know it?{suggested && ' Enter takes the highlighted one.'}
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {GRADES.map(({ grade, label, hint, className }, index) => (
                  <button
                    key={grade}
                    type="button"
                    className={`btn h-auto flex-col gap-0 py-2 ${className} ${grade === suggested ? 'border-ink bg-accent-soft' : ''}`}
                    onClick={() => advance(grade)}
                  >
                    <span>{label}</span>
                    <span className="text-xs font-normal text-muted">{hint} · {index + 1}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
