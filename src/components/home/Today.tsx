import { useStore } from '@nanostores/react';
import { useEffect, useState } from 'react';
import { readCourse, type CourseLevel } from '../../lib/content/course';
import {
  currentLevel,
  greeting,
  isNewLearner,
  milestones,
  suggest,
  upcoming,
  type Learner,
  type Suggestion,
  type SuggestionKind,
} from '../../lib/progress/coach';
import { completion, currentStreak, localDay, recentDays, xpOn } from '../../lib/progress/logic';
import { $progress, $quizzes, $review, $seenMilestones, $settings, DAILY_GOALS, updateSettings } from '../../lib/stores';
import { url } from '../../lib/url';
import { GoalRing } from '../ui/GoalRing';
import { Stamp } from '../ui/Stamp';
import { WeekStrip } from '../ui/WeekStrip';

/** What each level assumes, in the learner's own terms, for choosing where to start. */
const STARTING_POINT: Record<string, { claim: string; detail: string }> = {
  a1: { claim: 'I am new to German', detail: 'Start with greetings, numbers and your first sentences.' },
  a2: { claim: 'I know the basics', detail: 'You can introduce yourself, order food and talk about your day.' },
  b1: { claim: 'I get by in everyday German', detail: 'You can talk about the past, give reasons and handle shops and appointments.' },
};

const KIND_LABEL: Record<SuggestionKind, string> = {
  review: 'Review',
  lesson: 'Chapter',
  checkpoint: 'Checkpoint',
  weak: 'Trouble spot',
  mission: 'Mission',
  exam: 'Mock exam',
};

/** The home page: one recommended next step, today's goal, and what else is worth doing. */
export default function Today() {
  const course = readCourse();
  const progress = useStore($progress);
  const review = useStore($review);
  const quizzes = useStore($quizzes);
  const settings = useStore($settings);
  const seen = useStore($seenMilestones);
  const now = new Date();

  const learner: Learner = { progress, review, quizzes, level: settings.level };
  const all = milestones(course, learner);

  // Milestones earned since the last visit are announced once, then remembered as seen.
  const [fresh] = useState(() => all.filter((milestone) => milestone.earned && !seen.includes(milestone.id)));
  useEffect(() => {
    if (fresh.length > 0) $seenMilestones.set([...new Set([...$seenMilestones.get(), ...fresh.map((milestone) => milestone.id)])]);
  }, [fresh]);

  if (isNewLearner(learner)) return <Welcome levels={course.levels} />;

  const level = currentLevel(course, learner);
  const [primary, ...others] = suggest(course, learner, now);
  const today = xpOn(progress, localDay(now));
  const goal = settings.dailyGoal;
  const streak = currentStreak(progress.days, now);

  const status =
    goal > 0 && today >= goal
      ? 'Today’s goal is reached. Anything more is a bonus.'
      : goal > 0 && today > 0
        ? `${goal - today} points to today’s goal.`
        : streak > 1
          ? `${streak} days in a row so far.`
          : progress.days.length > 0
            ? 'Good to see you again.'
            : 'Your first chapter is ready.';

  return (
    <div className="grid gap-8">
      <header>
        <p className="eyebrow" lang="de">
          {now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
        <h1 className="mt-1 text-4xl sm:text-5xl" lang="de">
          {greeting(now)}!
        </h1>
        <p className="mt-2 text-lg text-muted">{status}</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
        {primary ? (
          <section className="page flex flex-col justify-between gap-6 p-5 pl-9 sm:p-8 sm:pl-12" aria-labelledby="next-up">
            <div>
              <p className="eyebrow">Next up: {KIND_LABEL[primary.kind].toLowerCase()}</p>
              <h2 id="next-up" className="mt-1 text-3xl sm:text-4xl">
                {primary.title}
              </h2>
              <p className="mt-2 text-muted">{primary.reason}</p>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <a href={primary.href} className="btn btn-accent btn-lg">
                {primary.action}
              </a>
              <span className="text-sm text-muted tabular-nums">about {primary.minutes} min</span>
            </div>
          </section>
        ) : (
          <section className="page p-5 pl-9 sm:p-8 sm:pl-12">
            <div>
              <p className="eyebrow" lang="de">Alles geschafft</p>
              <h2 className="mt-1 text-3xl sm:text-4xl">Every chapter is done and nothing is due.</h2>
              <p className="mt-2 text-muted">Reviews will show up here when their time comes. Until then, a mission keeps things moving.</p>
              <a href={url('missions/')} className="btn mt-5">
                Open missions
              </a>
            </div>
          </section>
        )}

        <section className="card flex flex-col gap-4 p-5" aria-label="Daily goal">
          <div className="flex items-center gap-4">
            <GoalRing earned={today} goal={goal} />
            <div className="min-w-0">
              <p className="font-display text-xl font-semibold">{goal > 0 ? 'Daily goal' : 'Goal paused'}</p>
              <p className="text-sm text-muted">
                {goal > 0
                  ? 'Points come from exercises you solve and cards you review.'
                  : 'Points are still counted. Switch the goal back on whenever you like.'}
              </p>
              <a href={`${url('settings/')}#learning`} className="text-sm text-muted underline underline-offset-4 hover:text-ink">
                Change goal
              </a>
            </div>
          </div>
          <WeekStrip days={recentDays(progress, now)} goal={goal} />
          <p className="text-sm text-muted">
            {streak > 0 ? `${streak} ${streak === 1 ? 'day' : 'days'} in a row.` : 'A few minutes on most days beats an hour once a week.'}
          </p>
        </section>
      </div>

      {fresh.length > 0 && (
        <section className="card flex flex-wrap items-center gap-x-8 gap-y-4 border-accent p-5" aria-label="New stamps">
          <p className="font-display w-full text-xl font-semibold sm:w-auto">
            {fresh.length === 1 ? 'A new stamp' : `${fresh.length} new stamps`}
          </p>
          {fresh.slice(0, 3).map((milestone) => (
            <Stamp key={milestone.id} milestone={milestone} fresh />
          ))}
          <a href={url('progress/')} className="text-sm text-muted underline underline-offset-4 hover:text-ink">
            See all stamps
          </a>
        </section>
      )}

      {others.length > 0 && (
        <section aria-labelledby="also">
          <h2 id="also" className="text-2xl">
            Also worth doing
          </h2>
          <ul className="card mt-3 divide-y divide-line">
            {others.slice(0, 3).map((item) => (
              <Row key={item.kind + item.href} item={item} />
            ))}
          </ul>
        </section>
      )}

      {level && <Journey level={level} levels={course.levels} />}

      <section aria-labelledby="stamps">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="stamps" className="text-2xl">
            Next stamps
          </h2>
          <a href={url('progress/')} className="text-sm text-muted underline underline-offset-4 hover:text-ink">
            All progress
          </a>
        </div>
        <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {upcoming(all).map((milestone) => (
            <Stamp key={milestone.id} milestone={milestone} />
          ))}
        </div>
      </section>
    </div>
  );
}

function Row({ item }: { item: Suggestion }) {
  return (
    <li>
      <a href={item.href} className="group flex flex-wrap items-center gap-x-4 gap-y-1 p-4 transition-colors hover:bg-surface-2">
        <span className="min-w-0 flex-1 basis-64">
          <span className="block font-semibold">{item.title}</span>
          <span className="text-sm text-muted">{item.reason}</span>
        </span>
        <span className="text-sm text-muted tabular-nums">about {item.minutes} min</span>
        <span className="btn btn-small group-hover:border-ink">{item.action}</span>
      </a>
    </li>
  );
}

/** The current level as one strip, a segment per chapter, with the unit it has reached. */
function Journey({ level, levels }: { level: CourseLevel; levels: CourseLevel[] }) {
  const progress = useStore($progress);
  const settings = useStore($settings);
  const states = level.lessons.map((lesson) => completion(progress, lesson.exercises.map((exercise) => exercise.id)));
  const finished = states.filter((state) => state.complete).length;
  const here = level.lessons[states.findIndex((state) => !state.complete)];
  const unit = here && level.units.find((candidate) => candidate.number === here.unit);
  const choices = levels.filter((candidate) => candidate.status === 'active' && candidate.lessons.length > 0);

  return (
    <section aria-labelledby="journey">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="journey" className="text-2xl">
          Your course: {level.title} {level.name}
        </h2>
        <label className="flex items-center gap-2 text-sm text-muted">
          Level
          <select
            className="field min-h-0 w-auto py-1"
            value={level.id}
            onChange={(event) => updateSettings({ level: event.target.value })}
          >
            {choices.map((choice) => (
              <option key={choice.id} value={choice.id}>
                {choice.title} {choice.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <a href={level.href} className="card mt-3 block p-5 transition-colors hover:border-ink">
        <span className="flex gap-[3px]" aria-hidden="true">
          {level.lessons.map((lesson, index) => {
            const state = states[index]!;
            // A wider gap marks where one unit ends and the next begins.
            const newUnit = index > 0 && level.lessons[index - 1]!.unit !== lesson.unit;
            return (
              <span
                key={lesson.key}
                className={`h-3 flex-1 rounded-sm ${newUnit ? 'ml-1.5' : ''} ${state.complete ? 'bg-good' : state.done > 0 ? 'bg-accent' : 'bg-surface-2'}`}
              />
            );
          })}
        </span>
        <span className="mt-3 flex flex-wrap items-baseline justify-between gap-2">
          <span>
            <span className="font-semibold tabular-nums">
              {finished} of {level.lessons.length} chapters finished
            </span>
            {unit?.title && (
              <span className="text-muted">
                , now in unit {unit.number}: {unit.title}
              </span>
            )}
          </span>
          <span className="text-sm text-muted underline underline-offset-4">Open all chapters</span>
        </span>
      </a>
      {settings.level !== level.id && settings.level && (
        <p className="mt-2 text-sm text-muted">You finished the level you chose, so this has moved on to the next one.</p>
      )}
    </section>
  );
}

/** First visit: two choices with sensible defaults, then straight into the first chapter. */
function Welcome({ levels }: { levels: CourseLevel[] }) {
  const choices = levels.filter((level) => level.status === 'active' && level.lessons.length > 0);
  const planned = levels.filter((level) => level.status === 'planned');
  const [levelId, setLevelId] = useState(choices[0]?.id ?? '');
  const [goal, setGoal] = useState<number>(DAILY_GOALS[0].xp);
  const first = choices.find((level) => level.id === levelId)?.lessons[0];

  const save = () => updateSettings({ level: levelId, dailyGoal: goal });

  return (
    <div className="page p-5 pl-9 sm:p-10 sm:pl-14">
      <header className="max-w-2xl">
        <p className="eyebrow" lang="de">Willkommen</p>
        <h1 className="mt-1 text-4xl sm:text-5xl">Where shall we start?</h1>
        <p className="mt-3 text-lg text-muted">
          Two quick choices, then your first chapter. Nothing to sign up for: everything is saved in this browser.
        </p>
      </header>

      <fieldset className="mt-8">
        <legend className="font-display text-xl font-semibold">How much German do you have?</legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {choices.map((level) => {
            const text = STARTING_POINT[level.id] ?? { claim: level.name, detail: '' };
            return (
              <label
                key={level.id}
                className={`card flex cursor-pointer flex-col gap-1 p-4 transition-colors has-[:focus-visible]:outline-2 ${
                  levelId === level.id ? 'border-ink bg-accent-soft' : 'hover:border-ink'
                }`}
              >
                <input type="radio" name="level" className="sr-only" checked={levelId === level.id} onChange={() => setLevelId(level.id)} />
                <span className="font-display text-3xl font-semibold">{level.title}</span>
                <span className="font-semibold">{text.claim}</span>
                <span className="text-sm text-muted">{text.detail}</span>
              </label>
            );
          })}
        </div>
        {planned.length > 0 && (
          <p className="mt-3 w-fit text-sm text-muted">
            {planned.map((level) => level.title).join(' and ')} {planned.length === 1 ? 'is' : 'are'} planned but not written yet.
            Until then, {choices[choices.length - 1]?.title} with its mock exams is the most advanced level here.
          </p>
        )}
      </fieldset>

      <fieldset className="mt-8">
        <legend className="font-display text-xl font-semibold">How much time on a normal day?</legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {[...DAILY_GOALS, { xp: 0, label: 'No goal', detail: 'just count my points' }].map((option) => (
            <label
              key={option.xp}
              className={`card flex cursor-pointer flex-col px-4 py-2.5 transition-colors has-[:focus-visible]:outline-2 ${
                goal === option.xp ? 'border-ink bg-accent-soft' : 'hover:border-ink'
              }`}
            >
              <input type="radio" name="goal" className="sr-only" checked={goal === option.xp} onChange={() => setGoal(option.xp)} />
              <span className="font-semibold">{option.label}</span>
              <span className="text-sm text-muted">{option.detail}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        {first && (
          <a href={first.href} className="btn btn-accent btn-lg" onClick={save}>
            Start with “{first.title}”
          </a>
        )}
        <button type="button" className="btn" onClick={save}>
          Look around first
        </button>
      </div>
    </div>
  );
}
