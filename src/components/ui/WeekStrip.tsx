import type { DayActivity } from '../../lib/progress/logic';

interface Props {
  days: DayActivity[];
  /** Daily goal in points; 0 when paused. Bars are drawn relative to it. */
  goal: number;
  /** Height of the tallest bar, in rem. */
  height?: number;
}

/** The last days as bars: how many points each one brought, against the daily goal. */
export function WeekStrip({ days, goal, height = 3 }: Props) {
  const top = Math.max(goal, ...days.map((day) => day.xp), 1);
  return (
    <ol className="flex items-end gap-1.5" aria-label="Points per day">
      {days.map(({ day, date, xp, studied }) => {
        const reached = goal > 0 && xp >= goal;
        const label = date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
        return (
          <li key={day} className="flex flex-1 flex-col items-center gap-1" title={`${label}: ${xp} points`}>
            <span className="flex w-full items-end rounded-md bg-surface-2" style={{ height: `${height}rem` }}>
              <span
                className={`w-full rounded-md ${reached ? 'bg-good' : 'bg-accent'}`}
                // A day studied before points existed still shows as a sliver.
                style={{ height: xp > 0 ? `${Math.max(12, (xp / top) * 100)}%` : studied ? '12%' : 0 }}
              />
            </span>
            <span className="text-xs text-muted" lang="de" aria-hidden="true">
              {date.toLocaleDateString('de-DE', { weekday: 'short' }).replace('.', '')}
            </span>
            <span className="sr-only">
              {label}: {xp} points{reached ? ', goal reached' : ''}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
