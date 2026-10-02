import { useStore } from '@nanostores/react';
import type { ClientExerciseSet } from '../../lib/content/types';
import { completion } from '../../lib/progress/logic';
import { $progress, enrollCards } from '../../lib/stores';
import { ExerciseCard } from './ExerciseCard';

interface Props {
  topic: string;
  sets: ClientExerciseSet[];
  /** The lesson's vocabulary; it joins the review deck once the learner starts practising. */
  vocabIds: string[];
  next?: { href: string; title: string };
}

export default function ExerciseRunner({ topic, sets, vocabIds, next }: Props) {
  const progress = useStore($progress);
  const ids = sets.flatMap((set) => set.items.map((item) => item.id));
  const { done, total, complete } = completion(progress, ids);

  return (
    <div className="grid gap-10">
      {sets.map((set, index) => (
        <section key={set.title} aria-labelledby={`set-${index}`}>
          <p className="eyebrow">Exercise {index + 1}</p>
          <h3 id={`set-${index}`} className="text-xl">
            {set.title}
          </h3>
          {set.instructions && <p className="mt-1 text-muted">{set.instructions}</p>}
          <div className="mt-4 grid gap-3">
            {set.items.map((item, position) => (
              <ExerciseCard
                key={item.id}
                item={item}
                number={position + 1}
                topic={topic}
                onAttempt={() => enrollCards('vocab', vocabIds)}
              />
            ))}
          </div>
        </section>
      ))}

      <div className={`card p-5 ${complete ? 'border-good bg-good-soft' : ''}`} aria-live="polite">
        {complete ? (
          <>
            <p className="font-display text-xl font-semibold text-good">Lesson complete. Gut gemacht!</p>
            <p className="mt-1 text-sm">
              All {total} exercises solved. The words and anything you missed will come back in your reviews.
            </p>
            {next && (
              <a href={next.href} className="btn btn-primary mt-4">
                Next: {next.title}
              </a>
            )}
          </>
        ) : (
          <p className="text-sm text-muted">
            <span className="font-semibold text-ink tabular-nums">
              {done} of {total}
            </span>{' '}
            exercises solved in this lesson.
          </p>
        )}
      </div>
    </div>
  );
}
