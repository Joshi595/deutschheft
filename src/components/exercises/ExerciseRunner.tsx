import { useStore } from '@nanostores/react';
import { useMemo, useState } from 'react';
import { splitParts } from '../../lib/content/parts';
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

/** Exercises in a session on one topic ("?tag="). A chapter is practised in parts instead. */
const FOCUS_SIZE = 10;
/** Rough time per exercise, for the "about n minutes" estimate. */
const SECONDS_EACH = 40;

type View =
  | { name: 'overview' }
  | { name: 'list' }
  /** `part` is unset in a session on one topic. */
  | { name: 'session'; queue: Step[]; position: number; part?: number }
  | { name: 'summary'; part?: number };

interface Step {
  item: ClientExercise;
  set: ClientExerciseSet;
  setIndex: number;
}

/** A topic to practise on its own, from a link such as "?tag=dativ#practice". */
function tagFromUrl(): string | undefined {
  return new URLSearchParams(window.location.search).get('tag') ?? undefined;
}

const minutesFor = (count: number) => Math.max(1, Math.round((count * SECONDS_EACH) / 60));

/**
 * A lesson's exercises, in one or two parts (see splitParts), one on screen,
 * with a summary after each part; the full list is one click away.
 */
export default function ExerciseRunner({ topic, sets, vocabIds, next }: Props) {
  const progress = useStore($progress);
  const [view, setView] = useState<View>({ name: 'overview' });
  const [tag, setTag] = useState(tagFromUrl);
  const log = useSessionLog();
  const stepRef = useStepFocus(view.name === 'session' ? view.position : -1);

  const parts = useMemo<Step[][]>(
    () =>
      splitParts(sets.map((set) => set.items.length)).map((indices) =>
        indices.flatMap((setIndex) => sets[setIndex]!.items.map((item) => ({ item, set: sets[setIndex]!, setIndex }))),
      ),
    [sets],
  );
  const steps = useMemo(() => parts.flat(), [parts]);
  const { done, total, complete } = completion(progress, steps.map((step) => step.item.id));
  const solved = (step: Step) => progress.exercises[step.item.id]?.correct;
  const partOpen = (index: number) => parts[index]!.filter((step) => !solved(step)).length;
  const firstOpen = Math.max(0, parts.findIndex((_, index) => partOpen(index) > 0));
  const tagged = tag ? steps.filter((step) => step.item.tags.includes(tag)) : [];
  // A link may name a topic this lesson does not have; then it is simply ignored.
  const focus = tagged.length > 0 ? tag : undefined;

  /** A session of this part: its unsolved steps, or all of them once the part is done. */
  function queueFor(part: number): Step[] {
    const open = parts[part]!.filter((step) => !solved(step));
    return open.length > 0 ? open : parts[part]!;
  }

  function start(part = firstOpen) {
    log.reset();
    if (focus) {
      const exercises = $progress.get().exercises;
      // The ones that went wrong first, then the ones never tried.
      const rank = (step: Step) => (exercises[step.item.id]?.firstTry === false ? 0 : exercises[step.item.id] ? 2 : 1);
      setView({ name: 'session', queue: [...tagged].sort((a, b) => rank(a) - rank(b)).slice(0, FOCUS_SIZE), position: 0 });
      return;
    }
    setView({ name: 'session', queue: queueFor(part), position: 0, part });
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
            {view.part !== undefined && parts.length > 1 && (
              <p className="eyebrow">
                Part {view.part + 1} of {parts.length}
              </p>
            )}
            <h3 className="text-xl">{step.set.title}</h3>
            {step.set.instructions && <p className="mt-1 text-muted">{step.set.instructions}</p>}
          </div>
          {step.set.stimulus && <StimulusView stimulus={step.set.stimulus} />}
          <ExerciseCard
            item={step.item}
            number={view.position + 1}
            topic={topic}
            onAttempt={() => enrollCards('vocab', vocabIds)}
            onFinish={(correct, response, result) => log.record(step.item, correct, response, result)}
            onNext={() => setView(last ? { name: 'summary', part: view.part } : { ...view, position: view.position + 1 })}
            nextLabel={last ? 'Finish' : 'Continue'}
          />
        </div>
      </div>
    );
  }

  if (view.name === 'summary') {
    // Straight on to the other part while it is still open: stopping after the first is how a chapter is usually left half done.
    const nextPart = view.part === undefined ? -1 : parts.findIndex((_, index) => index !== view.part && partOpen(index) > 0);
    const missedHere = view.part === undefined ? 0 : partOpen(view.part);
    const partDone = view.part !== undefined && parts.length > 1 && !complete;
    const nextSize = nextPart >= 0 ? queueFor(nextPart).length : 0;
    return (
      <SessionSummary
        remark={complete ? 'Kapitel geschafft!' : 'Gut gemacht!'}
        heading={complete ? 'Chapter complete' : partDone ? `Part ${view.part! + 1} done` : 'Session done'}
        results={log.results}
        points={log.points()}
        actions={
          <>
            {nextPart >= 0 && (
              <button type="button" className="btn btn-accent" onClick={() => start(nextPart)} autoFocus>
                Start part {nextPart + 1}: {nextSize} exercises, about {minutesFor(nextSize)} min
              </button>
            )}
            {nextPart < 0 && missedHere > 0 && (
              <button type="button" className="btn btn-accent" onClick={() => start(view.part)} autoFocus>
                Redo the {missedHere} you missed
              </button>
            )}
            {complete && next && (
              <a href={next.href} className="btn btn-accent">
                Next chapter: {next.title}
              </a>
            )}
            <button type="button" className={nextPart >= 0 ? 'btn btn-quiet' : 'btn'} onClick={() => setView({ name: 'overview' })}>
              Done for now
            </button>
          </>
        }
      >
        {complete ? (
          <p>All {total} exercises of this chapter are solved. Its words and anything you missed will come back in Review.</p>
        ) : (
          <p className="text-muted">
            {nextPart >= 0 && 'One more part and the chapter is done. '}
            <span className="font-semibold text-ink tabular-nums">
              {done} of {total}
            </span>{' '}
            exercises of this chapter solved.
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
        {sets.map((set, index) => {
          const part = parts.findIndex((partSteps) => partSteps[0]!.setIndex === index);
          return (
            <section key={index} aria-labelledby={`set-${index}`}>
              {part >= 0 && parts.length > 1 && (
                <p className="eyebrow mb-1">
                  Part {part + 1} of {parts.length}
                </p>
              )}
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
          );
        })}
      </div>
    );
  }

  // --- Overview ----------------------------------------------------------------

  const size = focus ? Math.min(FOCUS_SIZE, tagged.length) : queueFor(firstOpen).length;
  const minutes = minutesFor(size);

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
                : parts.length > 1
                  ? `Two parts, of about ${[...new Set(parts.map((part) => minutesFor(part.length)))].join(' and ')} minutes, one exercise at a time.`
                  : `One part of about ${minutesFor(total)} minutes, one exercise at a time.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-accent btn-lg" onClick={() => start()}>
            {focus
              ? 'Start'
              : complete
                ? 'Practise again'
                : parts.length > 1
                  ? `${done > 0 ? 'Continue with' : 'Start'} part ${firstOpen + 1}`
                  : done > 0
                    ? 'Continue practice'
                    : 'Start practice'}
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

      {!focus && parts.length > 1 && (
        <ol className="mt-5 grid gap-2">
          {parts.map((part, index) => {
            const left = partOpen(index);
            return (
              <li key={index} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-surface-2 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    Part {index + 1}{' '}
                    <span className="font-normal text-muted tabular-nums">
                      · {part.length - left}/{part.length} solved
                    </span>
                  </p>
                  <p className="text-sm text-muted">{[...new Set(part.map((step) => step.set.title))].join(' · ')}</p>
                </div>
                {left === 0 ? (
                  <button type="button" className="btn btn-quiet btn-small" onClick={() => start(index)}>
                    <span className="text-good">✓ Done</span> · Practise again
                  </button>
                ) : (
                  <button type="button" className="btn btn-small" onClick={() => start(index)}>
                    {left < part.length ? `Continue: ${left} left` : 'Start'}
                  </button>
                )}
              </li>
            );
          })}
        </ol>
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
