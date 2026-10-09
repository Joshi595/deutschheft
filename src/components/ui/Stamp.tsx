import type { Milestone } from '../../lib/progress/coach';

/** A milestone as a teacher's ink stamp, with what it stands for next to it. */
export function Stamp({ milestone, fresh = false }: { milestone: Milestone; fresh?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className={`stamp ${fresh ? 'stamp-new' : ''}`} data-earned={milestone.earned} lang="de" aria-hidden="true">
        {milestone.stamp}
      </span>
      <span className="min-w-0">
        <span className="block font-semibold">{milestone.title}</span>
        <span className="text-sm text-muted tabular-nums">
          {milestone.earned ? 'Earned' : `${milestone.current.toLocaleString('en')} of ${milestone.target.toLocaleString('en')}`}
        </span>
        {!milestone.earned && (
          <span className="meter-track mt-1.5 block w-32">
            <span className="meter-fill block" style={{ width: `${(milestone.current / milestone.target) * 100}%` }} />
          </span>
        )}
      </span>
    </div>
  );
}
