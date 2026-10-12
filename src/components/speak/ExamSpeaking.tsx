import { useStore } from '@nanostores/react';
import { useEffect, useState } from 'react';
import type { ClientExercise } from '../../lib/content/types';
import { $progress } from '../../lib/stores';
import { ExerciseCard } from '../exercises/ExerciseCard';

export interface ExamGroup {
  title: string;
  /** What this part asks for. */
  note?: string;
  tasks: { item: ClientExercise; from: string }[];
}

interface Props {
  groups: ExamGroup[];
  /** Speaking time to start the timer with, in seconds. */
  seconds: number;
}

const TIMES = [30, 60, 90, 120, 180];
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

/** A countdown for speaking against the clock. It only counts; nothing is cut off when it ends. */
function SpeakingTimer({ seconds }: { seconds: number }) {
  const [length, setLength] = useState(seconds);
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    if (left === null || left <= 0) return;
    const timer = window.setTimeout(() => setLeft(left - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [left]);

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl bg-surface-2 px-4 py-3">
      <label className="flex items-center gap-2 text-sm">
        Speak for
        <select className="field min-h-0 w-auto py-1" value={length} disabled={left !== null && left > 0} onChange={(event) => setLength(Number(event.target.value))}>
          {TIMES.map((time) => (
            <option key={time} value={time}>
              {clock(time)} min
            </option>
          ))}
        </select>
      </label>
      {left !== null && left > 0 ? (
        <button type="button" className="btn btn-small" onClick={() => setLeft(null)}>
          Stop the clock
        </button>
      ) : (
        <button type="button" className="btn btn-accent btn-small" onClick={() => setLeft(length)}>
          Start the clock
        </button>
      )}
      <span role="timer" aria-live="off" className={`font-display text-2xl font-semibold tabular-nums ${left !== null && left <= 10 ? 'text-bad' : ''}`}>
        {clock(left ?? length)}
      </span>
      {left === 0 && <span className="text-sm font-semibold" aria-live="polite">Time. Finish your sentence.</span>}
    </div>
  );
}

/** Every speaking task of a level in one place, each with a clock, a recorder, a model answer and a checklist. */
export default function ExamSpeaking({ groups, seconds }: Props) {
  const progress = useStore($progress);
  const [open, setOpen] = useState<string>();

  return (
    <div className="grid gap-10">
      {groups.map((group) => {
        const done = group.tasks.filter(({ item }) => progress.exercises[item.id]?.correct).length;
        return (
          <section key={group.title} aria-label={group.title}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-2xl">{group.title}</h2>
              <span className="text-sm text-muted tabular-nums">
                {done} of {group.tasks.length} done
              </span>
            </div>
            {group.note && <p className="mt-1 text-muted">{group.note}</p>}
            <ul className="mt-3 grid gap-2">
              {group.tasks.map(({ item, from }, index) => {
                const solved = progress.exercises[item.id]?.correct;
                return (
                  <li key={item.id}>
                    {open === item.id ? (
                      <div className="rise grid gap-3">
                        <SpeakingTimer seconds={seconds} />
                        <ExerciseCard item={item} number={index + 1} topic={group.title} />
                        <button type="button" className="btn btn-quiet btn-small justify-self-start" onClick={() => setOpen(undefined)}>
                          Close this task
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="card flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-1 p-4 text-left transition-colors hover:border-ink"
                        onClick={() => setOpen(item.id)}
                      >
                        <span className="min-w-0 flex-1 basis-64">
                          <span className="block font-semibold">{'prompt' in item ? item.prompt : ''}</span>
                          <span className="text-sm text-muted">{from}</span>
                        </span>
                        {solved && <span className="chip chip-good">Done</span>}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
