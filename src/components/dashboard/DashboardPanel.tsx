import { useStore } from '@nanostores/react';
import type { LevelSummary } from '../../lib/content/types';
import { completion, currentStreak, localDay, longestStreak, weakTags } from '../../lib/progress/logic';
import { dueCards } from '../../lib/srs/scheduler';
import { $progress, $review } from '../../lib/stores';

interface Props {
  levels: LevelSummary[];
  reviewHref: string;
}

const ACTIVITY_DAYS = 14;

export default function DashboardPanel({ levels, reviewHref }: Props) {
  const progress = useStore($progress);
  const review = useStore($review);
  const now = new Date();

  const lessons = levels.filter((level) => level.status === 'active').flatMap((level) => level.lessons);
  const exercises = lessons.flatMap((lesson) => lesson.exercises);
  const overall = completion(progress, exercises.map((exercise) => exercise.id));

  const withProgress = lessons.map((lesson) => ({
    lesson,
    state: completion(progress, lesson.exercises.map((exercise) => exercise.id)),
  }));
  const upNext = withProgress.find(({ state }) => !state.complete);
  const started = overall.done > 0 || progress.days.length > 0;

  const streak = currentStreak(progress.days, now);
  const best = longestStreak(progress.days);
  const due = dueCards(review, now).length;
  const deckSize = Object.keys(review).length;
  const studiedToday = progress.days.includes(localDay(now));
  const weak = weakTags(progress, exercises).filter((tag) => tag.accuracy < 0.8).slice(0, 4);

  const activity = Array.from({ length: ACTIVITY_DAYS }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (ACTIVITY_DAYS - 1 - index));
    return { day: localDay(date), label: date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) };
  });

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="card flex flex-col justify-between gap-6 bg-ink p-6 text-bg sm:p-8" style={{ borderColor: 'var(--ink)' }}>
          {upNext ? (
            <>
              <div>
                <p className="text-xs font-bold uppercase tracking-widest opacity-70">
                  {started ? 'Continue' : 'Start here'} · {upNext.lesson.level.toUpperCase()} lesson {upNext.lesson.order}
                </p>
                <h2 className="mt-2 text-3xl sm:text-4xl">{upNext.lesson.title}</h2>
                <p className="mt-2 opacity-80">{upNext.lesson.summary}</p>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <a href={upNext.lesson.href} className="btn btn-accent">
                  {upNext.state.done > 0 ? 'Pick up where you left off' : 'Open lesson'}
                </a>
                <span className="text-sm opacity-70 tabular-nums">
                  {upNext.state.done}/{upNext.state.total} solved · {upNext.lesson.minutes} min
                </span>
              </div>
            </>
          ) : (
            <div>
              <p className="text-xs font-bold uppercase tracking-widest opacity-70">Alles geschafft</p>
              <h2 className="mt-2 text-3xl sm:text-4xl">Every exercise is solved.</h2>
              <p className="mt-2 opacity-80">Reviews keep it from fading. New lessons will show up here.</p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Stat
            label="Day streak"
            value={streak}
            detail={streak > 0 && !studiedToday ? 'Study today to keep it' : best > streak ? `Best: ${best}` : 'days in a row'}
            highlight={streak > 0 && !studiedToday}
          />
          <a href={reviewHref} className="contents">
            <Stat label="Due for review" value={due} detail={due > 0 ? 'Review now' : `${deckSize} cards in deck`} highlight={due > 0} />
          </a>
          <Stat label="Exercises solved" value={overall.done} detail={`of ${overall.total}`} />
          <Stat label="Lessons finished" value={withProgress.filter(({ state }) => state.complete).length} detail={`of ${lessons.length}`} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <p className="eyebrow">Last {ACTIVITY_DAYS} days</p>
          <ol className="mt-3 flex gap-1.5" aria-label="Study activity">
            {activity.map(({ day, label }) => {
              const active = progress.days.includes(day);
              return (
                <li
                  key={day}
                  title={`${label}: ${active ? 'studied' : 'no activity'}`}
                  aria-label={`${label}: ${active ? 'studied' : 'no activity'}`}
                  className={`h-8 flex-1 rounded-md ${active ? 'bg-accent' : 'bg-surface-2'}`}
                />
              );
            })}
          </ol>
          <p className="mt-3 text-sm text-muted">
            {progress.days.length === 0
              ? 'Each day you answer an exercise or a review card lights up.'
              : `${progress.days.length} study ${progress.days.length === 1 ? 'day' : 'days'} in total.`}
          </p>
        </div>

        <div className="card p-5">
          <p className="eyebrow">Needs work</p>
          {weak.length === 0 ? (
            <p className="mt-3 text-sm text-muted">
              {started
                ? 'No weak spots so far. Topics you often miss on the first try will be listed here.'
                : 'Once you have answered a few exercises, the topics you miss most will be listed here.'}
            </p>
          ) : (
            <ul className="mt-3 grid gap-2">
              {weak.map((tag) => (
                <li key={tag.tag} className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-semibold">{tag.tag}</span>
                  <span className="text-muted tabular-nums">
                    {Math.round(tag.accuracy * 100)}% right first time ({tag.firstTry}/{tag.answered})
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, detail, highlight }: { label: string; value: number; detail: string; highlight?: boolean }) {
  return (
    <div className={`card flex flex-col justify-between p-4 ${highlight ? 'border-accent bg-accent-soft' : ''}`}>
      <p className="eyebrow">{label}</p>
      <p className="font-display mt-2 text-4xl font-semibold tabular-nums">{value}</p>
      <p className="text-sm text-muted">{detail}</p>
    </div>
  );
}
