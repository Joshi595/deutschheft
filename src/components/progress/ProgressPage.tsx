import { useStore } from '@nanostores/react';
import { readCourse } from '../../lib/content/course';
import { milestones, wordsKnown, type Learner } from '../../lib/progress/coach';
import { completion, currentStreak, longestStreak, recentDays, totalXp, weakTags } from '../../lib/progress/logic';
import { $progress, $quizzes, $review, $settings } from '../../lib/stores';
import { Stamp } from '../ui/Stamp';
import { WeekStrip } from '../ui/WeekStrip';

/** Topics with at least this many answered exercises are judged; fewer says too little. */
const MIN_ANSWERED = 4;

/** Everything the app knows about the learner's progress, all of it counted from their own answers. */
export default function ProgressPage() {
  const course = readCourse();
  const progress = useStore($progress);
  const review = useStore($review);
  const quizzes = useStore($quizzes);
  const settings = useStore($settings);
  const now = new Date();
  const learner: Learner = { progress, review, quizzes, level: settings.level };

  const week = recentDays(progress, now, 7);
  const weekStart = week[0]!.date.getTime();
  const answeredThisWeek = Object.values(progress.exercises).filter((record) => new Date(record.at).getTime() >= weekStart);
  const firstTryThisWeek = answeredThisWeek.filter((record) => record.firstTry).length;

  const lessons = course.levels.flatMap((level) => level.lessons);
  const solved = Object.values(progress.exercises).filter((record) => record.correct).length;
  const chapters = lessons.filter((lesson) => completion(progress, lesson.exercises.map((exercise) => exercise.id)).complete).length;
  const bestDay = Math.max(0, ...Object.values(progress.xp ?? {}));

  const topics = weakTags(progress, lessons.flatMap((lesson) => lesson.exercises), MIN_ANSWERED);
  const trouble = topics.filter((topic) => topic.accuracy < 0.7).slice(0, 5);
  const strong = topics.filter((topic) => topic.accuracy >= 0.9).sort((a, b) => b.answered - a.answered).slice(0, 5);

  const all = milestones(course, learner);
  const earned = all.filter((milestone) => milestone.earned);
  const open = all.filter((milestone) => !milestone.earned);
  const started = solved > 0 || progress.days.length > 0;

  const totals = [
    { label: 'Exercises solved', value: solved },
    { label: 'Chapters finished', value: chapters },
    { label: 'Words known', value: wordsKnown(review) },
    { label: 'Days studied', value: progress.days.length },
    { label: 'Longest run of days', value: longestStreak(progress.days) },
    { label: 'Best day, in points', value: bestDay },
  ];

  return (
    <div className="grid gap-12">
      <section aria-labelledby="week">
        <h2 id="week" className="text-2xl">
          The last seven days
        </h2>
        <div className="card mt-3 grid gap-6 p-5 sm:grid-cols-[1.4fr_1fr] sm:items-center">
          <WeekStrip days={week} goal={settings.dailyGoal} height={6} />
          <dl className="grid grid-cols-3 gap-3 sm:grid-cols-1">
            <Figure label="Points" value={week.reduce((sum, day) => sum + day.xp, 0)} />
            <Figure label="Days studied" value={`${week.filter((day) => day.studied).length} of 7`} />
            <Figure
              label="Right first time"
              value={answeredThisWeek.length > 0 ? `${Math.round((firstTryThisWeek / answeredThisWeek.length) * 100)}%` : 'no answers yet'}
              detail={answeredThisWeek.length > 0 ? `of ${answeredThisWeek.length} exercises` : undefined}
            />
          </dl>
        </div>
        {!started && <p className="mt-3 text-muted">Nothing here yet. Your first answers will fill this page in.</p>}
      </section>

      <section aria-labelledby="totals">
        <h2 id="totals" className="text-2xl">
          So far
        </h2>
        <dl className="card mt-3 grid grid-cols-2 gap-x-4 gap-y-5 p-5 sm:grid-cols-3 lg:grid-cols-6">
          {totals.map((total) => (
            <Figure key={total.label} label={total.label} value={total.value.toLocaleString('en')} />
          ))}
        </dl>
        <p className="mt-3 text-sm text-muted">
          {currentStreak(progress.days, now) > 1 ? `Currently ${currentStreak(progress.days, now)} days in a row. ` : ''}
          {totalXp(progress).toLocaleString('en')} points in total. A word counts as known once you have recalled it in a review and
          it has not slipped since.
        </p>
      </section>

      <section aria-labelledby="levels">
        <h2 id="levels" className="text-2xl">
          Levels
        </h2>
        <ul className="card mt-3 divide-y divide-line">
          {course.levels.map((level) => {
            const done = level.lessons.filter((lesson) => completion(progress, lesson.exercises.map((exercise) => exercise.id)).complete).length;
            const total = level.lessons.length;
            return (
              <li key={level.id}>
                <a href={level.href} className="flex flex-wrap items-center gap-x-5 gap-y-2 p-4 transition-colors hover:bg-surface-2">
                  <span className="font-display w-12 text-2xl font-semibold">{level.title}</span>
                  <span className="min-w-32 flex-1">
                    <span className="block font-semibold">{level.name}</span>
                    {total > 0 ? (
                      <span className="meter-track mt-1.5 block">
                        <span className="meter-fill block" data-complete={done === total} style={{ width: `${(done / total) * 100}%` }} />
                      </span>
                    ) : (
                      <span className="text-sm text-muted">Planned. Its chapters have not been written yet.</span>
                    )}
                  </span>
                  {total > 0 && (
                    <span className="text-sm text-muted tabular-nums">
                      {done} of {total} chapters
                    </span>
                  )}
                </a>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="topics">
        <h2 id="topics" className="text-2xl">
          Topics
        </h2>
        <p className="mt-1 text-muted">
          How often you were right on the first try, per topic. A topic appears once you have answered {MIN_ANSWERED} of its exercises.
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <TopicList title="Going well" topics={strong} empty="Topics you get right nine times out of ten will be listed here." />
          <TopicList title="Trouble spots" topics={trouble} empty={started ? 'None right now.' : 'Topics you often miss on the first try will be listed here.'} />
        </div>
      </section>

      <section aria-labelledby="stamps">
        <h2 id="stamps" className="text-2xl">
          Stamps
        </h2>
        <p className="mt-1 text-muted">
          {earned.length} of {all.length} earned. Each one stands for something you did, not for time spent.
        </p>
        <div className="mt-5 grid gap-x-6 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
          {[...earned, ...open].map((milestone) => (
            <Stamp key={milestone.id} milestone={milestone} />
          ))}
        </div>
      </section>
    </div>
  );
}

function Figure({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return (
    <div>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="font-display text-2xl font-semibold tabular-nums">{value}</dd>
      {detail && <dd className="text-sm text-muted">{detail}</dd>}
    </div>
  );
}

function TopicList({ title, topics, empty }: { title: string; topics: { tag: string; answered: number; firstTry: number; accuracy: number }[]; empty: string }) {
  return (
    <div className="card p-5">
      <h3 className="text-lg">{title}</h3>
      {topics.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{empty}</p>
      ) : (
        <ul className="mt-2 grid gap-2">
          {topics.map((topic) => (
            <li key={topic.tag} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-semibold">{topic.tag}</span>
              <span className="text-muted tabular-nums">
                {Math.round(topic.accuracy * 100)}% ({topic.firstTry}/{topic.answered})
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
