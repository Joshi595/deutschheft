import { useStore } from '@nanostores/react';
import { useState } from 'react';
import { groqProvider } from '../../lib/ai/provider';
import type { ClientExercise } from '../../lib/content/types';
import { describeResponse, grade, type GradeResult, type Response } from '../../lib/grading/grade';
import { tokenize } from '../../lib/grading/shuffle';
import { speak } from '../../lib/speech';
import { $progress, $settings, recordAnswer } from '../../lib/stores';
import { FillBlank, Matching, MultipleChoice, Translation, WordOrder, Writing } from './widgets';

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

function emptyResponse(item: ClientExercise): Response {
  switch (item.type) {
    case 'multiple-choice':
      return { type: 'multiple-choice', choice: '' };
    case 'matching':
      return { type: 'matching', selection: {} };
    case 'word-order':
      return { type: 'word-order', tokens: [] };
    default:
      return { type: item.type, text: '' };
  }
}

function isReady(item: ClientExercise, response: Response): boolean {
  switch (response.type) {
    case 'multiple-choice':
      return response.choice !== '';
    case 'matching':
      return item.type === 'matching' && item.pairs.every((pair) => response.selection[pair.left]);
    case 'word-order':
      return item.type === 'word-order' && response.tokens.length === tokenize(item.answer).length;
    default:
      return response.text.trim() !== '';
  }
}

const FALLBACK_PROMPT: Partial<Record<ClientExercise['type'], string>> = {
  matching: 'Match each word with its meaning.',
  'word-order': 'Put the words in the right order.',
};

function promptOf(item: ClientExercise): string {
  return item.prompt ?? FALLBACK_PROMPT[item.type] ?? '';
}

/** The full correct German sentence, if this exercise has one worth hearing. */
function spokenSolution(item: ClientExercise, result: GradeResult): string | undefined {
  switch (item.type) {
    case 'fill-blank':
      return item.prompt.replace('___', result.expected);
    case 'translation':
      return result.expected;
    case 'word-order':
      return item.answer;
    case 'writing':
      return item.sample;
    default:
      return undefined;
  }
}

export function ExerciseCard({ item, number, topic, maxAttempts, onAttempt, onFinish }: Props) {
  const allowed = maxAttempts ?? (item.type === 'multiple-choice' ? 1 : 2);
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
      const given = describeResponse(response);
      const text =
        item.type === 'writing' && status === 'solved'
          ? await provider.reviewWriting({ prompt: item.prompt, text: given, topic })
          : await provider.explainMistake({ prompt: promptOf(item), expected: result?.expected ?? '', given, topic });
      setAi({ state: 'done', text });
    } catch (error) {
      setAi({ state: 'error', text: error instanceof Error ? error.message : 'The AI request failed.' });
    }
  }

  function renderWidget() {
    const shared = { onChange: setResponse, locked, result, onSubmit: check };
    if (item.type === 'multiple-choice' && response.type === 'multiple-choice') {
      return <MultipleChoice item={item} response={response} {...shared} />;
    }
    if (item.type === 'fill-blank' && response.type === 'fill-blank') {
      return <FillBlank item={item} response={response} {...shared} />;
    }
    if (item.type === 'translation' && response.type === 'translation') {
      return <Translation item={item} response={response} {...shared} />;
    }
    if (item.type === 'writing' && response.type === 'writing') {
      return <Writing item={item} response={response} {...shared} />;
    }
    if (item.type === 'matching' && response.type === 'matching') {
      return <Matching item={item} response={response} {...shared} />;
    }
    if (item.type === 'word-order' && response.type === 'word-order') {
      // Keyed by round so "Try again" clears the tiles it keeps internally.
      return <WordOrder key={round} item={item} response={response} {...shared} />;
    }
    return null;
  }

  const solution = result && locked ? spokenSolution(item, result) : undefined;
  const aiAvailable =
    settings.aiKey.trim() !== '' && (status === 'revealed' || (status === 'solved' && item.type === 'writing'));

  return (
    <article className="card p-4 sm:p-5" aria-labelledby={`${item.id}-prompt`}>
      <header className="mb-3 flex items-start justify-between gap-3">
        <p id={`${item.id}-prompt`} className="font-semibold">
          <span className="mr-2 text-muted tabular-nums">{number}.</span>
          {item.type === 'fill-blank' ? 'Fill in the gap.' : promptOf(item)}
        </p>
        {record?.correct && <span className="chip chip-good">Solved</span>}
      </header>

      {renderWidget()}

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
            <p className="font-semibold">Richtig!</p>
            {result?.note && <p className="text-sm">{result.note}</p>}
          </div>
        )}

        {status === 'revealed' && result && (
          <div className="rounded-xl bg-bad-soft px-4 py-3 text-bad">
            <p className="font-semibold">Not this time. It is back in your review queue.</p>
            {result.note && <p className="text-sm">{result.note}</p>}
          </div>
        )}

        {locked && result && (
          <div className="rounded-xl bg-surface-2 px-4 py-3 text-sm">
            {(status === 'revealed' || item.type === 'writing') && (
              <p className="flex items-center gap-1">
                <span>
                  <span className="text-muted">{item.type === 'writing' ? 'One possible answer: ' : 'Answer: '}</span>
                  <span className="de text-base" lang="de">{result.expected}</span>
                </span>
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
            <p className="eyebrow mb-1">AI explanation</p>
            <p>{ai.state === 'loading' ? 'Thinking …' : ai.text}</p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {!locked && (
            <button type="button" className="btn btn-primary" onClick={check} disabled={!ready}>
              Check
            </button>
          )}
          {locked && (
            <button type="button" className="btn" onClick={restart}>
              Try again
            </button>
          )}
          {aiAvailable && ai.state !== 'loading' && ai.state !== 'done' && (
            <button type="button" className="btn btn-quiet" onClick={askAi}>
              {status === 'solved' ? 'Get feedback on my sentence' : 'Explain my mistake'}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
