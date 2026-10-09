interface Props {
  earned: number;
  /** 0 when the daily goal is paused: the ring then stays empty and only counts. */
  goal: number;
  size?: number;
}

const RADIUS = 42;
const LENGTH = 2 * Math.PI * RADIUS;

/** Today's points as a ring that closes when the daily goal is reached. */
export function GoalRing({ earned, goal, size = 104 }: Props) {
  const share = goal > 0 ? Math.min(1, earned / goal) : 0;
  const label = goal > 0 ? `${earned} of ${goal} points today` : `${earned} points today`;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={label} className="flex-none">
      <circle cx="50" cy="50" r={RADIUS} fill="none" stroke="var(--surface-2)" strokeWidth="10" />
      <circle
        cx="50"
        cy="50"
        r={RADIUS}
        fill="none"
        stroke={share >= 1 ? 'var(--good)' : 'var(--accent)'}
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={LENGTH}
        strokeDashoffset={LENGTH * (1 - share)}
        transform="rotate(-90 50 50)"
        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
      />
      <text x="50" y="47" textAnchor="middle" dominantBaseline="central" fontSize="27" fontWeight="600" fill="currentColor" className="font-display">
        {earned}
      </text>
      <text x="50" y="68" textAnchor="middle" fontSize="10.5" fill="var(--muted)">
        {goal > 0 ? `of ${goal}` : 'points'}
      </text>
    </svg>
  );
}
