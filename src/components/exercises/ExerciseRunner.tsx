import { useStore } from '@nanostores/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { splitParts } from '../../lib/content/parts';
import type { ClientExercise, ClientExerciseSet } from '../../lib/content/types';
import { completion } from '../../lib/progress/logic';
import { $progress, enrollCards } from '../../lib/stores';
import { SessionSummary, useSessionLog } from '../session/Session';
import { Icon } from '../ui/Icon';
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
/** Long enough to see the green, short enough not to wait for it. */
const GLIDE_DELAY = 600;

type View =
  | { name: 'overview' }
  /** `part` is unset in a session on one topic. */
  | { name: 'session'; queue: Step[]; part?: number }
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
const motion = (): ScrollBehavior => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');

/**
 * A lesson's exercises, in one or two parts (see splitParts). A part opens in
 * a full-screen dialog as one column to scroll through: the exercise to do
 * next is marked, the ones after it wait dimmed, a tap answers a choice, and a
 * right answer glides on to the next one. A wrong answer stays put so its
 * explanation can be read. A summary ends the part.
 */
export default function ExerciseRunner({ topic, sets, vocabIds, next }: Props) {
  const progress = useStore($progress);
  const [view, setView] = useState<View>({ name: 'overview' });
  const [tag, setTag] = useState(tagFromUrl);
  const log = useSessionLog();
  const dialog = useRef<HTMLDialogElement>(null);
  const glide = useRef(false);

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
  const inDialog = view.name !== 'overview';

  // The dialog is open for as long as a session or its summary is shown. Back closes it, like any screen.
  useEffect(() => {
    if (!inDialog) return;
    const element = dialog.current!;
    if (!element.open) element.showModal();
    let pushed = true;
    history.pushState({ practice: true }, '');
    const onPop = () => {
      pushed = false;
      setView({ name: 'overview' });
    };
    window.addEventListener('popstate', onPop);
    // On the document: an answered option is disabled, which drops focus out of the dialog.
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('popstate', onPop);
      document.removeEventListener('keydown', onKey);
      if (pushed) history.back();
      if (element.open) element.close();
    };
  }, [inDialog]);

  // A new session or a summary starts at the top.
  useEffect(() => {
    dialog.current?.scrollTo({ top: 0 });
  }, [view]);

  // After a right answer, glide on to the next exercise still to do, or to the end of the part.
  useEffect(() => {
    if (!glide.current) return;
    glide.current = false;
    const timer = setTimeout(() => {
      const target = dialog.current?.querySelector<HTMLElement>('[data-active]') ?? dialog.current?.querySelector<HTMLElement>('[data-finish]');
      if (!target) return;
      target.scrollIntoView({ behavior: motion(), block: target.dataset.finish === undefined ? 'start' : 'center' });
      // With a keyboard, typing can start straight away; on a phone a keyboard popping up uninvited is worse.
      const field = matchMedia('(pointer: fine)').matches ? target.querySelector<HTMLElement>('input, textarea') : null;
      (field ?? target).focus({ preventScroll: true });
    }, GLIDE_DELAY);
    return () => clearTimeout(timer);
  }, [log.results.length]);

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
      setView({ name: 'session', queue: [...tagged].sort((a, b) => rank(a) - rank(b)).slice(0, FOCUS_SIZE) });
      return;
    }
    setView({ name: 'session', queue: queueFor(part), part });
  }

  /** Number keys pick an option of the exercise to do next. */
  function onKey(event: globalThis.KeyboardEvent) {
    const target = event.target as HTMLElement;
    if (!/^[1-9]$/.test(event.key) || event.altKey || event.ctrlKey || event.metaKey || target.closest('input, textarea, select')) return;
    const active = dialog.current?.querySelector('[data-active]');
    const option = active?.querySelectorAll<HTMLButtonElement>('[role="radio"]:not(:disabled)')[Number(event.key) - 1];
    if (!option) return;
    event.preventDefault();
    option.click();
  }

  let content = null;

  // --- A part: one column, the next exercise marked -----------------------------

  if (view.name === 'session') {
    const results = new Map(log.results.map((entry) => [entry.item.id, entry.correct]));
    const finished = log.results.length;
    const left = view.queue.length - finished;
    const active = view.queue.findIndex((step) => !results.has(step.item.id));
    const title = focus && view.part === undefined ? `Practise “${focus}”` : parts.length > 1 ? `Part ${view.part! + 1} of ${parts.length}` : 'Practice';
    content = (
      <>
        <div className="sticky top-0 z-10 border-b border-line bg-bg/95 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-2.5">
            <button type="button" className="btn btn-quiet btn-small -ml-2 px-2" onClick={() => setView({ name: 'overview' })} aria-label="Close practice" title="Close (Esc)">
              <Icon name="cross" />
            </button>
            <p className="hidden font-semibold whitespace-nowrap sm:block">{title}</p>
            {/* One segment per exercise: green right first time, red missed, blue the one to do. */}
            <div
              className="flex h-2 flex-1 gap-0.5"
              role="progressbar"
              aria-label="Exercises checked"
              aria-valuemin={0}
              aria-valuemax={view.queue.length}
              aria-valuenow={finished}
            >
              {view.queue.map((step, index) => (
                <span
                  key={step.item.id}
                  className={`flex-1 transition-colors ${results.get(step.item.id) === true ? 'bg-good' : results.get(step.item.id) === false ? 'bg-bad' : index === active ? 'bg-accent' : 'bg-surface-2'}`}
                />
              ))}
            </div>
            <span className="text-sm whitespace-nowrap text-muted tabular-nums">
              {finished} of {view.queue.length} checked
            </span>
          </div>
        </div>

        <div className="mx-auto grid max-w-3xl gap-8 px-4 pt-8 pb-[40vh]">
          {view.queue.map((step, index) => {
            const state = results.has(step.item.id) ? 'done' : index === active ? 'active' : 'later';
            return (
              <section
                key={step.item.id}
                data-active={state === 'active' ? '' : undefined}
                tabIndex={-1}
                className={`relative grid scroll-mt-20 gap-4 outline-none transition-opacity duration-300 ${state === 'later' ? 'opacity-40 focus-within:opacity-100 hover:opacity-100' : ''}`}
              >
                {state === 'active' && <span className="absolute inset-y-0 -left-3 w-1 bg-accent sm:-left-5" aria-hidden="true" />}
                {/* A set's title, instructions and text appear once, above its first exercise. */}
                {view.queue[index - 1]?.setIndex !== step.setIndex && (
                  <>
                    <div className={index > 0 ? 'mt-6 border-t-2 border-ink pt-5' : ''}>
                      <h3 className="text-2xl">{step.set.title}</h3>
                      {step.set.instructions && <p className="mt-1 text-muted">{step.set.instructions}</p>}
                    </div>
                    {step.set.stimulus && <StimulusView stimulus={step.set.stimulus} />}
                  </>
                )}
                <ExerciseCard
                  item={step.item}
                  number={index + 1}
                  topic={topic}
                  onAttempt={() => enrollCards('vocab', vocabIds)}
                  onFinish={(correct, response, result) => {
                    glide.current = correct;
                    log.record(step.item, correct, response, result);
                  }}
                />
              </section>
            );
          })}
          <div data-finish tabIndex={-1} className="flex flex-wrap items-center justify-between gap-3 border-t-2 border-ink pt-5 outline-none">
            <p className="text-muted">
              {left === 0 ? 'All checked.' : `${left} of ${view.queue.length} still to check. You can also finish now.`}
            </p>
            <button type="button" className={left === 0 ? 'btn btn-accent btn-lg' : 'btn'} onClick={() => setView({ name: 'summary', part: view.part })}>
              {left === 0 ? 'See how it went' : 'Finish here'}
            </button>
          </div>
        </div>
      </>
    );
  }

  if (view.name === 'summary') {
    // Straight on to the other part while it is still open: stopping after the first is how a chapter is usually left half done.
    const nextPart = view.part === undefined ? -1 : parts.findIndex((_, index) => index !== view.part && partOpen(index) > 0);
    const missedHere = view.part === undefined ? 0 : partOpen(view.part);
    const partDone = view.part !== undefined && parts.length > 1 && !complete;
    const nextSize = nextPart >= 0 ? queueFor(nextPart).length : 0;
    content = (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <SessionSummary
          remark={complete ? 'Kapitel geschafft!' : 'Gut gemacht!'}
          heading={complete ? 'Chapter complete' : partDone ? `Part ${view.part! + 1} done` : 'Session done'}
          results={log.results}
          points={log.points()}
          actions={
            <>
              {nextPart >= 0 && (
                <button type="button" className="btn btn-accent btn-lg" onClick={() => start(nextPart)} autoFocus>
                  Start part {nextPart + 1}: {nextSize} exercises, about {minutesFor(nextSize)} min
                </button>
              )}
              {nextPart < 0 && missedHere > 0 && (
                <button type="button" className="btn btn-accent btn-lg" onClick={() => start(view.part)} autoFocus>
                  Redo the {missedHere} you missed
                </button>
              )}
              {complete && next && (
                <a href={next.href} className="btn btn-accent btn-lg">
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
      </div>
    );
  }

  // --- Overview, on the lesson page ------------------------------------------------

  const size = focus ? Math.min(FOCUS_SIZE, tagged.length) : queueFor(firstOpen).length;
  const minutes = minutesFor(size);

  return (
    <>
      <div className={`card p-5 sm:p-6 ${complete && !focus ? 'border-good' : ''}`}>
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
          <div>
            {focus ? (
              <>
                <p className="eyebrow">Trouble spot</p>
                <p className="font-display text-2xl">Practise “{focus}”</p>
              </>
            ) : complete ? (
              <p className="font-display text-2xl text-good" lang="de">
                Kapitel geschafft!
              </p>
            ) : (
              <p className="font-display text-2xl">{done > 0 ? `${total - done} exercises to go` : `${total} exercises`}</p>
            )}
            <p className="mt-1 text-muted">
              {focus
                ? `${tagged.length} exercises on this topic, the ones you missed first.`
                : complete
                  ? `All ${total} exercises are solved. Reviews will keep them fresh.`
                  : parts.length > 1
                    ? `Two parts, of about ${[...new Set(parts.map((part) => minutesFor(part.length)))].join(' and ')} minutes each.`
                    : `One part of about ${minutesFor(total)} minutes.`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
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
            <div className="meter-track flex-1">
              <div className="meter-fill" data-complete={complete} style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
            </div>
            <span className="text-sm text-muted tabular-nums">
              {done}/{total} solved
            </span>
          </div>
        )}

        {!focus && parts.length > 1 && (
          <ol className="mt-5 grid gap-px border border-line bg-line">
            {parts.map((part, index) => {
              const left = partOpen(index);
              return (
                <li key={index} className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-surface px-4 py-3">
                  <span className="numeral text-3xl text-muted" aria-hidden="true">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">
                      Part {index + 1}{' '}
                      <span className="font-normal text-muted tabular-nums">
                        {part.length - left} of {part.length} solved
                      </span>
                    </p>
                    <p className="text-sm text-muted">{[...new Set(part.map((step) => step.set.title))].join(', ')}</p>
                  </div>
                  {left === 0 ? (
                    <button type="button" className="btn btn-quiet btn-small" onClick={() => start(index)}>
                      <Icon name="check" size={16} className="text-good" />
                      Practise again
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

        {focus && (
          <button type="button" className="mt-4 text-sm text-muted underline underline-offset-4 hover:text-ink" onClick={() => setTag(undefined)}>
            Practise the whole chapter instead
          </button>
        )}
      </div>

      <dialog
        ref={dialog}
        aria-label={`Practice: ${topic}`}
        onClose={() => setView({ name: 'overview' })}
        className="m-0 h-dvh max-h-none w-full max-w-none overflow-y-auto overscroll-contain bg-bg p-0 text-ink backdrop:bg-transparent"
      >
        {content}
      </dialog>
    </>
  );
}
