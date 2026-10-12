import { useStore } from '@nanostores/react';
import { useEffect, useState } from 'react';
import type { ClientSound } from '../../lib/content/types';
import { EAR_PASS, EAR_ROUND } from '../../lib/speaking/logic';
import { speak } from '../../lib/speech';
import { $settings, $speaking, saveEarScore } from '../../lib/stores';
import { useStepFocus } from '../session/Session';
import { Say, SpeakTurn } from './SpeakTurn';

interface Props {
  sound: ClientSound;
  next?: { href: string; title: string };
  listHref: string;
}

interface Trial {
  options: [string, string];
  meanings: [string, string];
  /** Which of the two is played. */
  answer: 0 | 1;
}

function makeRound(sound: ClientSound): Trial[] {
  const shuffled = [...sound.pairs].sort(() => Math.random() - 0.5);
  return Array.from({ length: EAR_ROUND }, (_, index) => {
    const [a, b] = shuffled[index % shuffled.length]!;
    return { options: [a.de, b.de], meanings: [a.en, b.en], answer: Math.random() < 0.5 ? 0 : 1 };
  });
}

/** Hear one word of a pair and say which it was. The only part of pronunciation a program can mark for certain. */
function EarRound({ sound }: { sound: ClientSound }) {
  const rate = useStore($settings).speechRate;
  const best = useStore($speaking).ears[sound.id] ?? 0;
  const [round, setRound] = useState<Trial[]>();
  const [at, setAt] = useState(0);
  const [picked, setPicked] = useState<0 | 1>();
  const [score, setScore] = useState(0);

  const trial = round?.[at];
  const done = round !== undefined && at >= round.length;

  // Each new trial is played as soon as it appears.
  useEffect(() => {
    if (trial) speak(trial.options[trial.answer], rate);
  }, [trial]);

  useEffect(() => {
    if (done) saveEarScore(sound.id, score);
  }, [done]);

  function start() {
    setRound(makeRound(sound));
    setAt(0);
    setScore(0);
    setPicked(undefined);
  }

  function pick(choice: 0 | 1) {
    if (!trial || picked !== undefined) return;
    setPicked(choice);
    if (choice === trial.answer) setScore(score + 1);
  }

  function next() {
    setPicked(undefined);
    setAt(at + 1);
  }

  // 1 and 2 choose. Enter moves on by itself, because the "Next word" button takes the focus.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey || !trial) return;
      if (picked === undefined && (event.key === '1' || event.key === '2')) pick(event.key === '1' ? 0 : 1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!round || done) {
    const passed = done && score >= EAR_PASS;
    return (
      <div className={`card p-5 sm:p-6 ${passed ? 'border-good' : ''}`} aria-live="polite">
        {done ? (
          <>
            <p className="font-display text-2xl font-semibold tabular-nums">
              {score} of {EAR_ROUND} heard right
            </p>
            <p className="mt-1 text-muted">
              {passed
                ? 'Your ear has this sound. Now make it yourself, below.'
                : `${EAR_PASS} of ${EAR_ROUND} passes. Read how the sound is made once more, then try another round.`}
            </p>
          </>
        ) : (
          <>
            <p className="font-display text-2xl font-semibold">Hear the difference</p>
            <p className="mt-1 text-muted">
              You hear one of two similar words and say which it was. {EAR_ROUND} words, {EAR_PASS} right to pass.
              {best > 0 && ` Your best so far: ${best}.`}
            </p>
          </>
        )}
        <button type="button" className="btn btn-accent mt-4" onClick={start}>
          {done ? 'Another round' : 'Start listening'}
        </button>
      </div>
    );
  }

  const correct = picked === trial!.answer;
  return (
    <div className="card p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow">Which word do you hear?</p>
        <span className="text-sm text-muted tabular-nums">
          {at + 1} / {round.length}
        </span>
      </div>
      <button type="button" className="listen btn mt-3" data-clip onClick={() => speak(trial!.options[trial!.answer], rate)}>
        Play again
      </button>
      <div key={at} className={`mt-4 grid grid-cols-2 gap-2 sm:gap-3 ${picked === undefined ? '' : correct ? 'pop' : 'shake'}`}>
        {trial!.options.map((word, index) => {
          const isAnswer = picked !== undefined && index === trial!.answer;
          const isMiss = picked === index && !correct;
          return (
            <button
              key={word}
              type="button"
              disabled={picked !== undefined}
              onClick={() => pick(index as 0 | 1)}
              className={`rounded-xl border-2 px-3 py-4 text-center transition-colors disabled:cursor-default ${
                isAnswer ? 'border-good bg-good-soft text-good' : isMiss ? 'border-bad bg-bad-soft text-bad' : 'border-line bg-surface hover:border-ink'
              }`}
              aria-keyshortcuts={String(index + 1)}
            >
              <span className="font-display block text-2xl font-semibold" lang="de">{word}</span>
              <span className="text-sm text-muted">{trial!.meanings[index]}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-4 flex min-h-11 flex-wrap items-center justify-between gap-3" aria-live="polite">
        {picked === undefined ? (
          <p className="text-sm text-muted">Pick one, or press 1 or 2.</p>
        ) : (
          <>
            <p className="text-sm">
              {correct ? (
                <span className="font-semibold text-good" lang="de">Richtig!</span>
              ) : (
                <span>
                  <span className="font-semibold text-bad" lang="de">Nicht ganz.</span> It was{' '}
                  <span className="de" lang="de">{trial!.options[trial!.answer]}</span>. Listen to both:
                </span>
              )}
              {!correct && (
                <span className="ml-2 inline-flex gap-1 align-middle">
                  <Say text={trial!.options[0]} />
                  <Say text={trial!.options[1]} />
                </span>
              )}
            </p>
            <button type="button" className="btn btn-accent btn-small" onClick={next} autoFocus>
              {at + 1 < round.length ? 'Next word' : 'See the result'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** One German sound: tell it apart by ear, then say its words and compare with the model. */
export default function SoundTrainer({ sound, next, listHref }: Props) {
  const lines = [...sound.words, sound.sentence];
  const [at, setAt] = useState(-1);
  const stepRef = useStepFocus(at);
  const line = lines[at];

  return (
    <div className="grid gap-10">
      <section aria-labelledby="ear">
        <h2 id="ear" className="sr-only">Hear the difference</h2>
        <EarRound sound={sound} />
      </section>

      <section aria-labelledby="say">
        <h2 id="say" className="text-2xl">Say it</h2>
        <p className="mt-1 mb-4 text-muted">Listen, say the word, then compare your recording with the model. Slow playback helps with a new sound.</p>
        {at < 0 ? (
          <div className="card p-5">
            <ul className="flex flex-wrap gap-x-5 gap-y-2">
              {sound.words.map((word) => (
                <li key={word.de} className="flex items-center gap-1.5">
                  <Say text={word.de} />
                  <span>
                    <span className="de" lang="de">{word.de}</span> <span className="text-sm text-muted">{word.en}</span>
                  </span>
                </li>
              ))}
            </ul>
            <button type="button" className="btn btn-accent mt-5" onClick={() => setAt(0)}>
              Say them one by one
            </button>
          </div>
        ) : line ? (
          <div key={at} ref={stepRef} tabIndex={-1} role="group" aria-label={`Word ${at + 1} of ${lines.length}`} className="rise outline-none">
            <SpeakTurn
              id={`${sound.id}-${at}`}
              cue={<span className="text-base text-muted">{at + 1} of {lines.length}: {line.en}</span>}
              text={line.de}
              show
              rated={false}
              onDone={() => setAt(at + 1)}
              doneLabel={at + 1 < lines.length ? 'Next' : 'Done'}
            />
          </div>
        ) : (
          <div className="card flex flex-wrap items-center justify-between gap-4 border-good p-5" aria-live="polite">
            <p>
              <span className="font-display block text-xl font-semibold" lang="de">Gut gemacht!</span>
              <span className="text-muted">You have said all the words of this sound.</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {next && (
                <a href={next.href} className="btn btn-accent">
                  Next sound: {next.title}
                </a>
              )}
              <button type="button" className="btn" onClick={() => setAt(0)}>
                Say them again
              </button>
              <a href={listHref} className="btn">
                All sounds
              </a>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
