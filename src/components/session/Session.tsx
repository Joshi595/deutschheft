import { useStore } from '@nanostores/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ClientExercise } from '../../lib/content/types';
import { grade } from '../../lib/grading/grade';
import { emptyResponse, isSelfAssessed, promptOf } from '../../lib/grading/response';
import { localDay, totalXp, xpOn } from '../../lib/progress/logic';
import { $progress, $settings } from '../../lib/stores';
import { GoalRing } from '../ui/GoalRing';

/** Shared parts of a focused session: lesson practice and missions both use them. */

export interface SessionResult {
  item: ClientExercise;
  /** Solved, as opposed to having the answer shown. */
  correct: boolean;
}

/** Collects the first outcome of each item, and the points earned since the session began. */
export function useSessionLog() {
  const [results, setResults] = useState<SessionResult[]>([]);
  const startPoints = useRef(totalXp($progress.get()));

  return {
    results,
    record(item: ClientExercise, correct: boolean) {
      // "Try again" on a finished item must not count it twice.
      setResults((current) => (current.some((result) => result.item.id === item.id) ? current : [...current, { item, correct }]));
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

export function SessionBar({ position, total, label, onExit }: { position: number; total: number; label: string; onExit: () => void }) {
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
        {Math.min(position + 1, total)} / {total}
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
          <ul className="mt-2 grid gap-2 text-sm">
            {missed.map(({ item }) => (
              <li key={item.id} className="border-l-2 border-bad pl-3">
                <span className="block">{promptOf(item)}</span>
                {!isSelfAssessed(item) && (
                  <span className="de text-good" lang="de">{grade(item, emptyResponse(item)).expected}</span>
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
