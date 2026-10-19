import { useStore } from '@nanostores/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ClientExercise } from '../../lib/content/types';
import type { GradeResult, Response } from '../../lib/grading/grade';
import { headingOf, showsOwnSolution } from '../../lib/grading/response';
import { localDay, totalXp, xpOn } from '../../lib/progress/logic';
import { $progress, $settings } from '../../lib/stores';
import { ItemWidget } from '../exercises/widgets';
import { GoalRing } from '../ui/GoalRing';

/** Shared parts of a focused session: lesson practice and missions both use them. */

export interface SessionResult {
  item: ClientExercise;
  /** Solved, as opposed to having the answer shown. */
  correct: boolean;
  /** The answer that decided it, and how it was graded. */
  response: Response;
  result: GradeResult;
}

/** Collects the first outcome of each item, and the points earned since the session began. */
export function useSessionLog() {
  const [results, setResults] = useState<SessionResult[]>([]);
  const startPoints = useRef(totalXp($progress.get()));

  return {
    results,
    record(item: ClientExercise, correct: boolean, response: Response, result: GradeResult) {
      // "Try again" on a finished item must not count it twice.
      setResults((current) =>
        current.some((logged) => logged.item.id === item.id) ? current : [...current, { item, correct, response, result }],
      );
    },
    reset() {
      setResults([]);
      startPoints.current = totalXp($progress.get());
    },
    points: () => totalXp($progress.get()) - startPoints.current,
  };
}

/**
 * Moves keyboard and screen-reader focus to the new step whenever the step
 * changes; otherwise it would be left on a button that no longer exists.
 */
export function useStepFocus(step: number) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (step >= 0) ref.current?.focus({ preventScroll: true });
  }, [step]);
  return ref;
}

export function SessionBar({ position, total, label, count, onExit }: { position: number; total: number; label: string; count?: string; onExit: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <button type="button" className="btn btn-quiet btn-small -ml-2" onClick={onExit}>
        Exit
      </button>
      <div
        className="meter-track h-2.5 flex-1"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={position}
      >
        <div className="meter-fill" style={{ width: `${(position / total) * 100}%` }} />
      </div>
      <span className="text-sm text-muted tabular-nums">
        {count ?? `${Math.min(position + 1, total)} / ${total}`}
      </span>
    </div>
  );
}

interface SummaryProps {
  /** A short German line, like a remark written under finished homework. */
  remark: string;
  heading: string;
  results: SessionResult[];
  points: number;
  /** Extra content between the numbers and the buttons. */
  children?: ReactNode;
  /** The next steps, as buttons and links. */
  actions: ReactNode;
}

export function SessionSummary({ remark, heading, results, points, children, actions }: SummaryProps) {
  const progress = useStore($progress);
  const goal = useStore($settings).dailyGoal;
  const today = xpOn(progress, localDay(new Date()));
  const solved = results.filter((result) => result.correct).length;
  const missed = results.filter((result) => !result.correct);

  return (
    <div className="page rise p-5 pl-9 sm:p-8 sm:pl-12" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-5">
        <div>
          <p className="eyebrow" lang="de">{remark}</p>
          <h3 className="mt-1 text-3xl">{heading}</h3>
          <p className="mt-2 text-muted">
            <span className="font-semibold text-ink tabular-nums">
              {solved} of {results.length}
            </span>{' '}
            solved
            {points > 0 && (
              <>
                , <span className="font-semibold text-ink tabular-nums">+{points} points</span>
              </>
            )}
            .
          </p>
          <p className="text-sm text-muted">
            {goal > 0 && today >= goal
              ? 'Daily goal reached.'
              : goal > 0
                ? `${goal - today} points to your daily goal.`
                : 'Your daily goal is paused.'}
          </p>
        </div>
        <GoalRing earned={today} goal={goal} />
      </div>

      {missed.length > 0 && (
        <div className="mt-6">
          <p className="font-semibold">Worth another look</p>
          {/* Each one as it was checked: the learner's answer struck through next to the right one. */}
          <ul className="mt-2 grid gap-3">
            {missed.map(({ item, response, result }) => (
              <li key={item.id} className="rounded-xl border border-line border-l-4 border-l-bad bg-surface p-4">
                <p className="mb-2 font-semibold">{headingOf(item)}</p>
                <ItemWidget item={item} response={response} onChange={() => {}} locked result={result} />
                {(!showsOwnSolution(item) || item.explanation) && (
                  <div className="mt-3 grid gap-1 text-sm">
                    {!showsOwnSolution(item) && (
                      <p>
                        <span className="text-muted">Answer: </span>
                        <span className="de text-base" lang="de">{result.expected}</span>
                      </p>
                    )}
                    {item.explanation && <p className="text-muted">{item.explanation}</p>}
                  </div>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-muted">These are in your review queue and will come back on their own.</p>
        </div>
      )}

      {children && <div className="mt-6">{children}</div>}

      <div className="mt-6 flex flex-wrap items-center gap-2">{actions}</div>
    </div>
  );
}
