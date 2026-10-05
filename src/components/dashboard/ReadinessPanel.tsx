import { useStore } from '@nanostores/react';
import type { LevelSummary } from '../../lib/content/types';
import { completion } from '../../lib/progress/logic';
import { bestAttempt } from '../../lib/quiz/score';
import { cardId } from '../../lib/srs/scheduler';
import { $progress, $quizzes, $review } from '../../lib/stores';

interface Props {
  level: LevelSummary;
}

/** How far along the learner is towards this level's exam, from four measures. */
export default function ReadinessPanel({ level }: Props) {
  const progress = useStore($progress);
  const review = useStore($review);
  const quizzes = useStore($quizzes);

  const chaptersDone = level.lessons.filter(
    (lesson) => completion(progress, lesson.exercises.map((exercise) => exercise.id)).complete,
  ).length;

  const vocabIds = level.lessons.flatMap((lesson) => lesson.vocabIds);
  // A word counts as learned once it has been reviewed at least once and is not in relearning.
  const wordsLearned = vocabIds.filter((id) => {
    const card = review[cardId('vocab', id)];
    return card !== undefined && card.reps > 0 && card.state === 2;
  }).length;

  const checkpoints = level.units.filter((unit) => unit.checkpointId);
  const checkpointsPassed = checkpoints.filter((unit) => bestAttempt(quizzes, unit.checkpointId!)?.passed).length;

  const examBest = level.exams
    .map((exam) => bestAttempt(quizzes, exam.id))
    .reduce<number | undefined>((best, attempt) => (attempt && (best === undefined || attempt.total > best) ? attempt.total : best), undefined);
  const examPassed = level.exams.some((exam) => bestAttempt(quizzes, exam.id)?.passed);

  const measures = [
    { label: 'Chapters finished', value: `${chaptersDone}/${level.lessons.length}`, share: level.lessons.length ? chaptersDone / level.lessons.length : 0 },
    { label: 'Words learned', value: `${wordsLearned}/${vocabIds.length}`, share: vocabIds.length ? wordsLearned / vocabIds.length : 0 },
    { label: 'Checkpoints passed', value: `${checkpointsPassed}/${checkpoints.length}`, share: checkpoints.length ? checkpointsPassed / checkpoints.length : 0 },
    {
      label: 'Mock exam',
      value: level.exams.length === 0 ? 'not available yet' : examBest === undefined ? 'not taken' : `${examBest}%`,
      share: examPassed ? 1 : (examBest ?? 0) / 100,
    },
  ];

  const ready = chaptersDone === level.lessons.length && level.lessons.length > 0 && examPassed;

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="eyebrow">Exam readiness{level.exam ? ` · ${level.exam}` : ''}</p>
        {ready && <span className="chip chip-good">Ready for a real practice paper</span>}
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {measures.map((measure) => (
          <div key={measure.label}>
            <p className="text-sm text-muted">{measure.label}</p>
            <p className="font-display text-2xl font-semibold tabular-nums">{measure.value}</p>
            <div className="meter-track mt-2">
              <div className="meter-fill" data-complete={measure.share >= 1} style={{ width: `${Math.round(measure.share * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-sm text-muted">
        These numbers show what you have covered here. Before booking the exam, sit one of the official practice papers
        from the Goethe-Institut under real conditions: its recordings and marking are the real standard.
      </p>
    </div>
  );
}
