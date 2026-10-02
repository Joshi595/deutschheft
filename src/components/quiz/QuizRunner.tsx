import { useStore } from '@nanostores/react';
import { useEffect, useMemo, useState } from 'react';
import type { ClientExercise, ClientQuiz, QuizSection } from '../../lib/content/types';
import type { GradeResult, Response } from '../../lib/grading/grade';
import { emptyResponse, headingOf, isAnswered, isSelfAssessed } from '../../lib/grading/response';
import { bestAttempt, scoreQuiz, toAttempt, type QuizScore } from '../../lib/quiz/score';
import { stopSpeaking } from '../../lib/speech';
import { $quizzes, recordQuizAttempt } from '../../lib/stores';
import { StimulusView } from '../exercises/StimulusView';
import { ItemWidget, type Phase } from '../exercises/widgets';

interface Props {
  quiz: ClientQuiz;
}

type Stage = { name: 'intro' } | { name: 'section'; index: number } | { name: 'assess' } | { name: 'result' };

const SKILL_LABEL: Record<QuizSection['skill'], string> = {
  reading: 'Lesen · Reading',
  listening: 'Hören · Listening',
  writing: 'Schreiben · Writing',
  speaking: 'Sprechen · Speaking',
  mixed: 'Questions',
};

function clock(seconds: number): string {
  const safe = Math.max(0, seconds);
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

/** Runs a mock exam or a unit checkpoint: timed sections, no feedback until the end. */
export default function QuizRunner({ quiz }: Props) {
  const history = useStore($quizzes);
  const [stage, setStage] = useState<Stage>({ name: 'intro' });
  const [responses, setResponses] = useState<Record<string, Response>>({});
  const [deadline, setDeadline] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [score, setScore] = useState<QuizScore | null>(null);

  const allItems = useMemo(() => quiz.sections.flatMap((section) => section.parts.flatMap((part) => part.items)), [quiz]);
  const selfAssessedItems = allItems.filter(isSelfAssessed);
  const best = bestAttempt(history, quiz.id);

  const responseOf = (item: ClientExercise) => responses[item.id] ?? emptyResponse(item);
  const setResponse = (item: ClientExercise, response: Response) =>
    setResponses((current) => ({ ...current, [item.id]: response }));

  function go(next: Stage) {
    stopSpeaking();
    setStage(next);
    if (next.name === 'section') {
      const minutes = quiz.sections[next.index]!.minutes;
      setDeadline(minutes ? Date.now() + minutes * 60_000 : null);
      setNow(Date.now());
    } else {
      setDeadline(null);
    }
    window.scrollTo({ top: 0 });
  }

  function finish() {
    const result = scoreQuiz(quiz, responses);
    setScore(result);
    recordQuizAttempt(quiz.id, toAttempt(result, new Date()));
    go({ name: 'result' });
  }

  function afterSection(index: number) {
    if (index + 1 < quiz.sections.length) go({ name: 'section', index: index + 1 });
    else if (selfAssessedItems.length > 0) go({ name: 'assess' });
    else finish();
  }

  // Count down; when the time for a section runs out it is handed in as it stands.
  useEffect(() => {
    if (deadline === null) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [deadline]);

  useEffect(() => {
    if (deadline !== null && stage.name === 'section' && now >= deadline) afterSection(stage.index);
  });

  // --- Intro ----------------------------------------------------------------

  if (stage.name === 'intro') {
    const totalMinutes = quiz.sections.reduce((sum, section) => sum + (section.minutes ?? 0), 0);
    return (
      <div className="grid gap-5">
        <div className="card p-6 sm:p-8">
          <p className="text-muted">{quiz.description}</p>

          <ul className="mt-5 grid gap-2">
            {quiz.sections.map((section, index) => (
              <li key={index} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-2 last:border-0">
                <span className="font-semibold">{SKILL_LABEL[section.skill]}</span>
                <span className="text-sm text-muted tabular-nums">
                  {section.parts.reduce((sum, part) => sum + part.items.length, 0)} tasks
                  {section.minutes ? ` · ${section.minutes} min` : ''}
                  {quiz.kind === 'exam' ? ` · ${section.points} points` : ''}
                </span>
              </li>
            ))}
          </ul>

          <ul className="mt-5 list-disc pl-5 text-sm text-muted">
            {totalMinutes > 0 && <li>About {totalMinutes} minutes in total. Each part has its own time limit and is handed in when the time is up.</li>}
            <li>No hints and no corrections while you work. You see everything at the end.</li>
            {quiz.sections.some((section) => section.skill === 'listening') && (
              <li>Each recording can be played a limited number of times, as in the exam.</li>
            )}
            {selfAssessedItems.length > 0 && (
              <li>Writing and speaking cannot be marked by a program. Afterwards you compare your answers with a model and mark them yourself.</li>
            )}
            <li>
              Pass mark: {quiz.passMark}%{quiz.scoring === 'per-module' ? ' in each part separately' : ' overall'}.
            </li>
          </ul>

          <button type="button" className="btn btn-primary mt-6" onClick={() => go({ name: 'section', index: 0 })}>
            Start
          </button>
        </div>

        {best && (
          <p className="text-sm text-muted">
            Best result so far: <span className="font-semibold text-ink tabular-nums">{best.total}%</span>
            {best.passed ? ' (passed)' : ' (not passed)'}, from {history[quiz.id]!.length}{' '}
            {history[quiz.id]!.length === 1 ? 'attempt' : 'attempts'}.
          </p>
        )}
      </div>
    );
  }

  // --- A timed section --------------------------------------------------------

  if (stage.name === 'section') {
    const section = quiz.sections[stage.index]!;
    const items = section.parts.flatMap((part) => part.items);
    const unanswered = items.filter((item) => !isAnswered(responseOf(item))).length;
    const remaining = deadline === null ? null : Math.ceil((deadline - now) / 1000);
    let number = 0;

    return (
      <div className="grid gap-8">
        <div className="sticky top-[3.4rem] z-30 -mx-4 flex flex-wrap items-center justify-between gap-3 border-y border-line bg-bg/95 px-4 py-2 backdrop-blur">
          <span className="font-semibold">
            {SKILL_LABEL[section.skill]}
            <span className="ml-2 text-sm font-normal text-muted">
              Part {stage.index + 1} of {quiz.sections.length}
            </span>
          </span>
          {remaining !== null && (
            <span
              className={`chip tabular-nums ${remaining <= 60 ? 'chip-accent' : ''}`}
              role="timer"
              aria-label="Time left"
            >
              {clock(remaining)}
            </span>
          )}
        </div>

        {section.parts.map((part, partIndex) => (
          <section key={partIndex} className="grid gap-3">
            <div>
              <h2 className="text-2xl">{part.title}</h2>
              {part.instructions && <p className="mt-1 text-muted">{part.instructions}</p>}
            </div>
            {part.stimulus && <StimulusView stimulus={part.stimulus} exam />}
            {part.items.map((item) => {
              number += 1;
              return (
                <QuizItem
                  key={item.id}
                  item={item}
                  number={number}
                  response={responseOf(item)}
                  onChange={(response) => setResponse(item, response)}
                  phase="exam"
                />
              );
            })}
          </section>
        ))}

        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              if (unanswered === 0 || window.confirm(`${unanswered} ${unanswered === 1 ? 'task is' : 'tasks are'} unanswered. Hand in anyway?`)) {
                afterSection(stage.index);
              }
            }}
          >
            {stage.index + 1 < quiz.sections.length ? 'Hand in and continue' : 'Hand in'}
          </button>
          <span className="text-sm text-muted">
            {unanswered === 0 ? 'Everything answered.' : `${unanswered} unanswered.`}
          </span>
        </div>
      </div>
    );
  }

  // --- Marking your own writing and speaking -----------------------------------

  if (stage.name === 'assess') {
    return (
      <div className="grid gap-6">
        <div className="card p-5">
          <h2 className="text-2xl">Mark your writing and speaking</h2>
          <p className="mt-2 text-muted">
            An examiner would do this part. Compare each answer with the model and tick only what yours really does.
            Being strict here is what makes the result useful.
          </p>
        </div>
        {selfAssessedItems.map((item, index) => (
          <QuizItem
            key={item.id}
            item={item}
            number={index + 1}
            response={responseOf(item)}
            onChange={(response) => setResponse(item, response)}
            phase="assess"
          />
        ))}
        <button type="button" className="btn btn-primary justify-self-start" onClick={finish}>
          See my result
        </button>
      </div>
    );
  }

  // --- Result -------------------------------------------------------------------

  if (!score) return null;
  let number = 0;

  return (
    <div className="grid gap-8">
      <div className={`card p-6 sm:p-8 ${score.passed ? 'border-good bg-good-soft' : 'border-bad bg-bad-soft'}`}>
        <p className="eyebrow">{score.passed ? 'Bestanden · Passed' : 'Nicht bestanden · Not passed'}</p>
        <p className="font-display mt-2 text-5xl font-semibold tabular-nums">{score.total}%</p>
        <p className="mt-2 text-sm">
          Pass mark: {quiz.passMark}%{quiz.scoring === 'per-module' ? ' in each part' : ''}.
          {selfAssessedItems.length > 0 && ' Writing and speaking are your own marking, so treat this as an estimate.'}
        </p>

        {quiz.sections.length > 1 && (
          <table className="mt-5 w-full max-w-md text-sm">
            <tbody>
              {score.sections.map((section, index) => (
                <tr key={index} className="border-t border-line">
                  <td className="py-2 font-semibold">{SKILL_LABEL[section.skill as QuizSection['skill']]}</td>
                  <td className="py-2 text-right tabular-nums">
                    {section.points} / {section.max}
                  </td>
                  <td className="py-2 pl-4 text-right tabular-nums">{section.percent}%</td>
                  {quiz.scoring === 'per-module' && (
                    <td className="py-2 pl-4 text-right font-semibold">{section.passed ? 'passed' : 'not passed'}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          <a href={quiz.backHref} className="btn btn-primary">
            Back to the level
          </a>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setResponses({});
              setScore(null);
              go({ name: 'intro' });
            }}
          >
            Try again
          </button>
        </div>
      </div>

      <div className="grid gap-6">
        <h2 className="text-3xl">Your answers</h2>
        {quiz.sections.map((section, sectionIndex) => (
          <section key={sectionIndex} className="grid gap-3">
            {quiz.sections.length > 1 && <p className="eyebrow">{SKILL_LABEL[section.skill]}</p>}
            {section.parts.map((part, partIndex) => (
              <div key={partIndex} className="grid gap-3">
                <h3 className="text-xl">{part.title}</h3>
                {part.stimulus && <StimulusView stimulus={part.stimulus} review />}
                {part.items.map((item) => {
                  number += 1;
                  return (
                    <QuizItem
                      key={item.id}
                      item={item}
                      number={number}
                      response={responseOf(item)}
                      onChange={() => {}}
                      phase={isSelfAssessed(item) ? 'assess' : 'practice'}
                      result={score.results[item.id]}
                    />
                  );
                })}
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

interface QuizItemProps {
  item: ClientExercise;
  number: number;
  response: Response;
  onChange: (response: Response) => void;
  phase: Phase;
  /** Present once the quiz is finished: the item is shown locked, with its outcome. */
  result?: GradeResult;
}

function QuizItem({ item, number, response, onChange, phase, result }: QuizItemProps) {
  const done = result !== undefined;
  return (
    <article className="card p-4 sm:p-5">
      <header className="mb-3 flex items-start justify-between gap-3">
        <p className="font-semibold">
          <span className="mr-2 text-muted tabular-nums">{number}.</span>
          {headingOf(item)}
        </p>
        {done && (
          <span className={`chip ${result.correct ? 'chip-good' : ''}`} style={result.correct ? undefined : { background: 'var(--bad-soft)', color: 'var(--bad)' }}>
            {result.correct ? 'Right' : 'Wrong'}
          </span>
        )}
      </header>

      {item.stimulus && (
        <div className="mb-4">
          <StimulusView stimulus={item.stimulus} exam={!done} review={done} />
        </div>
      )}

      <ItemWidget item={item} response={response} onChange={onChange} locked={done} result={result ?? null} phase={phase} />

      {done && (
        <div className="mt-3 rounded-xl bg-surface-2 px-4 py-3 text-sm">
          {!result.correct && !isSelfAssessed(item) && item.type !== 'cloze' && item.type !== 'form' && (
            <p>
              <span className="text-muted">Answer: </span>
              <span className="de" lang="de">{result.expected}</span>
            </p>
          )}
          {result.note && <p>{result.note}</p>}
          {item.explanation && <p className="mt-1">{item.explanation}</p>}
          {!result.note && !item.explanation && (result.correct || item.type === 'cloze' || item.type === 'form' || isSelfAssessed(item)) && (
            <p className="text-muted">{result.correct ? 'Correct.' : 'See the solution above.'}</p>
          )}
        </div>
      )}
    </article>
  );
}
