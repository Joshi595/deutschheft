import { useStore } from '@nanostores/react';
import { useState } from 'react';
import { groqProvider } from '../../lib/ai/provider';
import type { ClientExercise } from '../../lib/content/types';
import { describeResponse, grade, type GradeResult, type Response } from '../../lib/grading/grade';
import { emptyResponse, headingOf, isReady, isSelfAssessed, promptOf, spokenSolution } from '../../lib/grading/response';
import { speak } from '../../lib/speech';
import { $progress, $settings, recordAnswer } from '../../lib/stores';
import { StimulusView } from './StimulusView';
import { ItemWidget } from './widgets';

type Status = 'idle' | 'retry' | 'solved' | 'revealed';

interface Props {
  item: ClientExercise;
  number: number;
  /** Lesson title, given to the AI as context. */
  topic: string;
  /** Wrong answers allowed before the solution is shown. Defaults by exercise type. */
  maxAttempts?: number;
  /** Called on every submitted answer. */
  onAttempt?: () => void;
  /** Called once the item is solved (true) or its answer revealed (false). */
  onFinish?: (correct: boolean) => void;
}

/** Choosing between a few options, or marking your own work, gets one go. Typed answers get two. */
function defaultAttempts(item: ClientExercise): number {
  return item.type === 'multiple-choice' || item.type === 'true-false' || isSelfAssessed(item) ? 1 : 2;
}

export function ExerciseCard({ item, number, topic, maxAttempts, onAttempt, onFinish }: Props) {
  const allowed = maxAttempts ?? defaultAttempts(item);
  const record = useStore($progress).exercises[item.id];
  const settings = useStore($settings);

  const [response, setResponse] = useState<Response>(() => emptyResponse(item));
  const [status, setStatus] = useState<Status>('idle');
  const [attempts, setAttempts] = useState(0);
  const [result, setResult] = useState<GradeResult | null>(null);
  const [round, setRound] = useState(0);
  const [ai, setAi] = useState<{ state: 'idle' | 'loading' | 'done' | 'error'; text?: string }>({ state: 'idle' });

  const locked = status === 'solved' || status === 'revealed';
  const ready = isReady(item, response);
  const selfAssessed = isSelfAssessed(item);
  const freeText = item.type === 'writing' || item.type === 'writing-task';

  function check() {
    if (locked || !ready) return;
    const graded = grade(item, response);
    recordAnswer({
      exerciseId: item.id,
      lessonKey: item.lessonKey,
      correct: graded.correct,
      prompt: promptOf(item),
      given: describeResponse(response),
      expected: graded.expected,
    });
    onAttempt?.();
    setResult(graded);
    if (graded.correct) {
      setStatus('solved');
      onFinish?.(true);
    } else if (attempts + 1 >= allowed) {
      setAttempts(attempts + 1);
      setStatus('revealed');
      onFinish?.(false);
    } else {
      setAttempts(attempts + 1);
      setStatus('retry');
    }
  }

  function restart() {
    setResponse(emptyResponse(item));
    setStatus('idle');
    setAttempts(0);
    setResult(null);
    setAi({ state: 'idle' });
    setRound(round + 1);
  }

  async function askAi() {
    setAi({ state: 'loading' });
    try {
      const provider = groqProvider(settings.aiKey.trim(), settings.aiModel.trim());
      const given = response.type === 'writing-task' ? response.text : describeResponse(response);
      const text = freeText
        ? await provider.reviewWriting({ prompt: item.prompt ?? '', text: given, topic })
        : await provider.explainMistake({ prompt: promptOf(item), expected: result?.expected ?? '', given, topic });
      setAi({ state: 'done', text });
    } catch (error) {
      setAi({ state: 'error', text: error instanceof Error ? error.message : 'The AI request failed.' });
    }
  }

  const solution = result && locked && !selfAssessed ? spokenSolution(item, result) : undefined;
  // The gaps and fields show their own solutions in place; tasks show a model answer.
  const showsOwnSolution = item.type === 'cloze' || item.type === 'form' || selfAssessed;
  const aiAvailable =
    settings.aiKey.trim() !== '' &&
    item.type !== 'speaking-task' &&
    (status === 'revealed' || (locked && freeText));

  return (
    <article className="card p-4 sm:p-5" aria-labelledby={`${item.id}-prompt`}>
      <header className="mb-3 flex items-start justify-between gap-3">
        <p id={`${item.id}-prompt`} className="font-semibold">
          <span className="mr-2 text-muted tabular-nums">{number}.</span>
          {headingOf(item)}
        </p>
        {record?.correct && <span className="chip chip-good">Solved</span>}
      </header>

      {item.stimulus && (
        <div className="mb-4">
          <StimulusView stimulus={item.stimulus} />
        </div>
      )}

      <ItemWidget key={round} item={item} response={response} onChange={setResponse} locked={locked} result={result} onSubmit={check} />

      <div className="mt-4 grid gap-3" aria-live="polite">
        {status === 'retry' && (
          <div className="rounded-xl bg-bad-soft px-4 py-3 text-bad">
            <p className="font-semibold">Not quite. Try once more.</p>
            {result?.note && <p className="text-sm">{result.note}</p>}
            {item.hint && <p className="text-sm">Hint: {item.hint}</p>}
          </div>
        )}

        {status === 'solved' && (
          <div className="rounded-xl bg-good-soft px-4 py-3 text-good">
            <p className="font-semibold">{selfAssessed ? 'Gut gemacht!' : 'Richtig!'}</p>
            {result?.note && <p className="text-sm">{result.note}</p>}
          </div>
        )}

        {status === 'revealed' && result && (
          <div className="rounded-xl bg-bad-soft px-4 py-3 text-bad">
            <p className="font-semibold">Not this time. It is back in your review queue.</p>
            {result.note && <p className="text-sm">{result.note}</p>}
          </div>
        )}

        {locked && result && (!showsOwnSolution || item.explanation) && (
          <div className="rounded-xl bg-surface-2 px-4 py-3 text-sm">
            {!showsOwnSolution && (status === 'revealed' || item.type === 'writing') && (
              <p>
                <span className="text-muted">{item.type === 'writing' ? 'One possible answer: ' : 'Answer: '}</span>
                <span className="de text-base" lang="de">{result.expected}</span>
              </p>
            )}
            {item.explanation && <p className="mt-1">{item.explanation}</p>}
            {solution && (
              <button type="button" className="btn btn-quiet btn-small mt-2 -ml-2" onClick={() => speak(solution, settings.speechRate)}>
                Listen to the sentence
              </button>
            )}
          </div>
        )}

        {ai.state !== 'idle' && (
          <div className={`rounded-xl border px-4 py-3 text-sm ${ai.state === 'error' ? 'border-bad text-bad' : 'border-line'}`}>
            <p className="eyebrow mb-1">AI feedback</p>
            <p className="whitespace-pre-line">{ai.state === 'loading' ? 'Thinking …' : ai.text}</p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {!locked && (
            <button type="button" className="btn btn-primary" onClick={check} disabled={!ready}>
              {selfAssessed ? 'Done' : 'Check'}
            </button>
          )}
          {locked && (
            <button type="button" className="btn" onClick={restart}>
              Try again
            </button>
          )}
          {aiAvailable && ai.state !== 'loading' && ai.state !== 'done' && (
            <button type="button" className="btn btn-quiet" onClick={askAi}>
              {freeText ? 'Get feedback on my text' : 'Explain my mistake'}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
