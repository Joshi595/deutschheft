import { useStore } from '@nanostores/react';
import { useMemo, useState } from 'react';
import type { ClientExercise, ClientExerciseSet } from '../../lib/content/types';
import { completion } from '../../lib/progress/logic';
import { $progress, enrollCards } from '../../lib/stores';
import { SessionBar, SessionSummary, useSessionLog, useStepFocus } from '../session/Session';
import { ExerciseCard } from './ExerciseCard';
import { StimulusView } from './StimulusView';

interface Props {
  topic: string;
  sets: ClientExerciseSet[];
  /** The lesson's vocabulary; it joins the review deck once the learner starts practising. */
  vocabIds: string[];
  next?: { href: string; title: string };
}

/** Exercises per sitting. Short enough to finish, long enough to be worth starting. */
const SESSION_SIZE = 10;
/** Rough time per exercise, for the "about n minutes" estimate. */
const SECONDS_EACH = 40;

type View = { name: 'overview' } | { name: 'list' } | { name: 'session'; queue: Step[]; position: number } | { name: 'summary' };

interface Step {
  item: ClientExercise;
  set: ClientExerciseSet;
  setIndex: number;
}

/** A topic to practise on its own, from a link such as "?tag=dativ#practice". */
function tagFromUrl(): string | undefined {
  return new URLSearchParams(window.location.search).get('tag') ?? undefined;
}

/**
 * A lesson's exercises. By default they are worked through a few at a time, one
 * on screen, with a summary at the end; the full list is one click away.
 */
export default function ExerciseRunner({ topic, sets, vocabIds, next }: Props) {
  const progress = useStore($progress);
  const [view, setView] = useState<View>({ name: 'overview' });
  const [tag, setTag] = useState(tagFromUrl);
  const log = useSessionLog();
  const stepRef = useStepFocus(view.name === 'session' ? view.position : -1);

  const steps = useMemo<Step[]>(() => sets.flatMap((set, setIndex) => set.items.map((item) => ({ item, set, setIndex }))), [sets]);
  const { done, total, complete } = completion(progress, steps.map((step) => step.item.id));
  const tagged = tag ? steps.filter((step) => step.item.tags.includes(tag)) : [];
  // A link may name a topic this lesson does not have; then it is simply ignored.
  const focus = tagged.length > 0 ? tag : undefined;

  function start() {
    const exercises = $progress.get().exercises;
    let queue: Step[];
    if (focus) {
      // The ones that went wrong first, then the ones never tried.
      const rank = (step: Step) => (exercises[step.item.id]?.firstTry === false ? 0 : exercises[step.item.id] ? 2 : 1);
      queue = [...tagged].sort((a, b) => rank(a) - rank(b));
    } else {
      const open = steps.filter((step) => !exercises[step.item.id]?.correct);
      queue = open.length > 0 ? open : steps;
    }
    log.reset();
    setView({ name: 'session', queue: queue.slice(0, SESSION_SIZE), position: 0 });
  }

  // --- One exercise at a time --------------------------------------------------

  if (view.name === 'session') {
    const step = view.queue[view.position]!;
    const last = view.position + 1 === view.queue.length;
    return (
      <div className="grid gap-5">
        <SessionBar position={view.position} total={view.queue.length} label="Session progress" onExit={() => setView({ name: 'overview' })} />
        <div
          key={step.item.id}
          ref={stepRef}
          tabIndex={-1}
          role="group"
          aria-label={`Exercise ${view.position + 1} of ${view.queue.length}`}
          className="rise grid gap-4 outline-none"
        >
          <div>
            <p className="eyebrow">
              Part {step.setIndex + 1} of {sets.length}
            </p>
            <h3 className="text-xl">{step.set.title}</h3>
            {step.set.instructions && <p className="mt-1 text-muted">{step.set.instructions}</p>}
          </div>
          {step.set.stimulus && <StimulusView stimulus={step.set.stimulus} />}
          <ExerciseCard
            item={step.item}
            number={view.position + 1}
            topic={topic}
            onAttempt={() => enrollCards('vocab', vocabIds)}
            onFinish={(correct) => log.record(step.item, correct)}
            onNext={() => setView(last ? { name: 'summary' } : { ...view, position: view.position + 1 })}
            nextLabel={last ? 'Finish' : 'Continue'}
          />
        </div>
      </div>
    );
  }

  if (view.name === 'summary') {
    const left = total - done;
    return (
      <SessionSummary
        remark={complete ? 'Kapitel geschafft!' : 'Gut gemacht!'}
        heading={complete ? 'Chapter complete' : 'Session done'}
        results={log.results}
        points={log.points()}
        actions={
          <>
            {!complete && !focus && (
              <button type="button" className="btn btn-accent" onClick={start} autoFocus>
                Keep going: {Math.min(left, SESSION_SIZE)} more
              </button>
            )}
            {complete && next && (
              <a href={next.href} className="btn btn-accent">
                Next chapter: {next.title}
              </a>
            )}
            <button type="button" className="btn" onClick={() => setView({ name: 'overview' })}>
              Done for now
            </button>
          </>
        }
      >
        {complete ? (
          <p>All {total} exercises of this chapter are solved. Its words and anything you missed will come back in Review.</p>
        ) : (
          <p className="text-muted">
            <span className="font-semibold text-ink tabular-nums">{done} of {total}</span> exercises of this chapter solved.
          </p>
        )}
      </SessionSummary>
    );
  }

  // --- The whole list ----------------------------------------------------------

  if (view.name === 'list') {
    return (
      <div className="grid gap-10">
        <button type="button" className="btn btn-small justify-self-start" onClick={() => setView({ name: 'overview' })}>
          Back to the overview
        </button>
        {sets.map((set, index) => (
          <section key={index} aria-labelledby={`set-${index}`}>
            <p className="eyebrow">Part {index + 1}</p>
            <h3 id={`set-${index}`} className="text-xl">
              {set.title}
            </h3>
            {set.instructions && <p className="mt-1 text-muted">{set.instructions}</p>}
            {set.stimulus && (
              <div className="mt-4">
                <StimulusView stimulus={set.stimulus} />
              </div>
            )}
            <div className="mt-4 grid gap-3">
              {set.items.map((item, position) => (
                <ExerciseCard key={item.id} item={item} number={position + 1} topic={topic} onAttempt={() => enrollCards('vocab', vocabIds)} />
              ))}
            </div>
          </section>
        ))}
      </div>
    );
  }

  // --- Overview ----------------------------------------------------------------

  const size = Math.min(SESSION_SIZE, focus ? tagged.length : complete ? total : total - done);
  const minutes = Math.max(1, Math.round((size * SECONDS_EACH) / 60));

  return (
    <div className={`card p-5 sm:p-6 ${complete && !focus ? 'border-good' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
        <div>
          {focus ? (
            <>
              <p className="eyebrow">Trouble spot</p>
              <p className="font-display text-2xl font-semibold">Practise “{focus}”</p>
            </>
          ) : complete ? (
            <p className="font-display text-2xl font-semibold text-good" lang="de">Kapitel geschafft!</p>
          ) : (
            <p className="font-display text-2xl font-semibold">{done > 0 ? `${total - done} exercises to go` : `${total} exercises`}</p>
          )}
          <p className="mt-1 text-muted">
            {focus
              ? `${tagged.length} exercises on this topic, the ones you missed first.`
              : complete
                ? `All ${total} exercises are solved. Reviews will keep them fresh.`
                : `${sets.length} parts. You work through them ${SESSION_SIZE} at a time and can stop after any of them.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-accent btn-lg" onClick={start}>
            {focus ? 'Start' : complete ? 'Practise again' : done > 0 ? 'Continue practice' : 'Start practice'}
          </button>
          <span className="text-sm text-muted tabular-nums">
            {size} exercises, about {minutes} min
          </span>
        </div>
      </div>

      {!focus && (
        <div className="mt-5 flex items-center gap-3">
          <div className="meter-track h-2 flex-1">
            <div className="meter-fill" data-complete={complete} style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
          </div>
          <span className="text-sm text-muted tabular-nums">
            {done}/{total} solved
          </span>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <button type="button" className="text-muted underline underline-offset-4 hover:text-ink" onClick={() => setView({ name: 'list' })}>
          Show all exercises as a list
        </button>
        {focus && (
          <button type="button" className="text-muted underline underline-offset-4 hover:text-ink" onClick={() => setTag(undefined)}>
            Practise the whole chapter instead
          </button>
        )}
      </div>
    </div>
  );
}
