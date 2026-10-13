import { useMemo, useState } from 'react';
import type { Exercise, ExerciseOf } from '../../lib/content/schema';
import { countWords, type GradeResult, type Response, type ResponseOf } from '../../lib/grading/grade';
import { seededShuffle, tokenize } from '../../lib/grading/shuffle';
import { speak } from '../../lib/speech';
import { GermanInput } from './GermanInput';
import { useRecording } from './useRecording';

/**
 * One input widget per exercise type. Each reports a Response; none of them grades.
 *
 * `phase` is "practice" in lessons. In a mock exam the timed part runs in
 * "exam" (no model answers, no hints) and writing and speaking are marked
 * afterwards in "assess".
 */

export type Phase = 'practice' | 'exam' | 'assess';

interface WidgetProps<T extends Response['type']> {
  item: ExerciseOf<T>;
  response: ResponseOf<T>;
  onChange: (response: Response) => void;
  /** Solved or revealed: inputs are frozen and the solution is shown. */
  locked: boolean;
  result: GradeResult | null;
  onSubmit: () => void;
  phase: Phase;
}

/**
 * One checked answer. Right: in green. Wrong: what the learner gave, struck
 * through in red, then the right answer in green.
 */
function Fix({ given, expected, correct }: { given: string; expected: string; correct: boolean }) {
  const right = 'rounded bg-good-soft px-1.5 py-0.5 font-semibold text-good no-underline';
  if (correct) return <span className={right}>{expected}</span>;
  return (
    <>
      {given.trim() ? (
        <del className="rounded bg-bad-soft px-1.5 py-0.5 text-bad">
          <span className="sr-only">Your answer: </span>
          {given}
        </del>
      ) : (
        <span className="text-sm italic text-muted">no answer</span>
      )}{' '}
      <ins className={right}>
        <span className="sr-only">Correct answer: </span>
        {expected}
      </ins>
    </>
  );
}

const choiceClass = (state: 'plain' | 'chosen' | 'right' | 'wrong', locked: boolean) =>
  [
    'rounded-xl border px-4 py-3 text-left transition-colors disabled:cursor-default',
    state === 'chosen' && 'border-ink bg-accent-soft',
    state === 'right' && 'border-good bg-good-soft text-good font-semibold',
    state === 'wrong' && 'border-bad bg-bad-soft text-bad',
    state === 'plain' && 'border-line bg-surface' + (locked ? ' opacity-60' : ' hover:border-ink'),
  ]
    .filter(Boolean)
    .join(' ');

export function MultipleChoice({ item, response, onChange, locked }: WidgetProps<'multiple-choice'>) {
  const options = useMemo(() => (item.shuffle ? seededShuffle(item.options, item.id) : item.options), [item]);
  return (
    <div role="radiogroup" aria-label={item.prompt} className="grid gap-2 sm:grid-cols-2">
      {options.map((option) => {
        const chosen = response.choice === option;
        const state = !locked ? (chosen ? 'chosen' : 'plain') : option === item.answer ? 'right' : chosen ? 'wrong' : 'plain';
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={chosen}
            disabled={locked}
            onClick={() => onChange({ type: 'multiple-choice', choice: option })}
            className={choiceClass(state, locked)}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

export function TrueFalse({ item, response, onChange, locked }: WidgetProps<'true-false'>) {
  return (
    <div role="radiogroup" aria-label={item.prompt} className="grid grid-cols-2 gap-2 sm:max-w-sm">
      {[true, false].map((value) => {
        const chosen = response.value === value;
        const state = !locked ? (chosen ? 'chosen' : 'plain') : value === item.answer ? 'right' : chosen ? 'wrong' : 'plain';
        return (
          <button
            key={String(value)}
            type="button"
            role="radio"
            aria-checked={chosen}
            disabled={locked}
            onClick={() => onChange({ type: 'true-false', value })}
            className={choiceClass(state, locked) + ' text-center'}
          >
            {value ? 'Richtig' : 'Falsch'}
          </button>
        );
      })}
    </div>
  );
}

export function FillBlank({ item, response, onChange, locked, result, onSubmit }: WidgetProps<'fill-blank'>) {
  const [before, after] = item.prompt.split('___');
  const longest = Math.max(...item.answers.map((answer) => answer.length));
  return (
    <div>
      <p className="de text-lg leading-loose" lang="de">
        {before}
        {locked ? (
          <Fix given={response.text} expected={result?.expected ?? item.answers[0]!} correct={!!result?.correct} />
        ) : (
          <GermanInput
            label="Missing word"
            value={response.text}
            onChange={(text) => onChange({ type: 'fill-blank', text })}
            onSubmit={onSubmit}
            size={longest + 4}
          />
        )}
        {after}
      </p>
      {item.translation && <p className="mt-1 text-sm text-muted">{item.translation}</p>}
    </div>
  );
}

/** Border colour for one gap or field once it has been checked. */
const markClass = (mark: boolean | undefined) =>
  mark === undefined ? '' : mark ? ' border-good' : ' border-bad';

export function Cloze({ item, response, onChange, locked, result, onSubmit }: WidgetProps<'cloze'>) {
  const segments = item.text.split('___');
  const bank = useMemo(() => (item.bank ? seededShuffle(item.bank, item.id) : undefined), [item]);
  const set = (index: number, value: string) =>
    onChange({ type: 'cloze', texts: response.texts.map((text, i) => (i === index ? value : text)) });

  return (
    <div className="grid gap-3">
      {bank && !locked && (
        <p className="flex flex-wrap gap-2 text-sm" aria-label="Word bank" lang="de">
          {bank.map((word) => (
            <span key={word} className="chip">{word}</span>
          ))}
        </p>
      )}
      <p className="whitespace-pre-line text-lg leading-loose" lang="de">
        {segments.map((segment, index) => {
          const accepted = item.gaps[index];
          const mark = result?.parts?.[index];
          return (
            <span key={index}>
              {segment}
              {accepted &&
                (locked ? (
                  <Fix given={response.texts[index] ?? ''} expected={accepted[0]!} correct={!!mark} />
                ) : bank ? (
                  <select
                    className={'field mx-1 inline-block w-auto min-h-0 py-1' + markClass(mark)}
                    aria-label={`Gap ${index + 1}`}
                    value={response.texts[index] ?? ''}
                    onChange={(event) => set(index, event.target.value)}
                  >
                    <option value="">…</option>
                    {bank.map((word) => (
                      <option key={word} value={word}>{word}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    className={'field mx-1 inline-block min-h-0 py-1' + markClass(mark)}
                    style={{ width: `${Math.max(...accepted.map((answer) => answer.length)) + 4}ch` }}
                    aria-label={`Gap ${index + 1}`}
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    value={response.texts[index] ?? ''}
                    onChange={(event) => set(index, event.target.value)}
                    onKeyDown={(event) => event.key === 'Enter' && onSubmit()}
                  />
                ))}
            </span>
          );
        })}
      </p>
    </div>
  );
}

export function Form({ item, response, onChange, locked, result, onSubmit }: WidgetProps<'form'>) {
  const set = (index: number, value: string) =>
    onChange({ type: 'form', texts: response.texts.map((text, i) => (i === index ? value : text)) });

  return (
    <div className="grid gap-4">
      <p className="rounded-xl bg-surface-2 p-4 leading-relaxed" lang="de">{item.situation}</p>
      <div className="grid gap-2 rounded-xl border border-line p-4">
        {item.fields.map((field, index) => {
          const mark = result?.parts?.[index];
          return (
            <label key={field.label} className="grid items-center gap-1 sm:grid-cols-[11rem_1fr] sm:gap-3">
              <span className="text-sm font-semibold" lang="de">{field.label}</span>
              {locked ? (
                <span lang="de">
                  <Fix given={response.texts[index] ?? ''} expected={field.answers[0]!} correct={!!mark} />
                </span>
              ) : (
                <input
                  type="text"
                  className={'field' + markClass(mark)}
                  autoComplete="off"
                  spellCheck={false}
                  lang="de"
                  value={response.texts[index] ?? ''}
                  onChange={(event) => set(index, event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && onSubmit()}
                />
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}

/** Free text is not rewritten once checked; a green or red frame says how it went. */
const verdictFrame = (locked: boolean, result: GradeResult | null) =>
  locked && result ? `block rounded-[12px] ring-2 ${result.correct ? 'ring-good' : 'ring-bad'}` : 'block';

export function Translation({ item, response, onChange, locked, result, onSubmit }: WidgetProps<'translation'>) {
  return (
    <span className={verdictFrame(locked, result)}>
      <GermanInput
        label={`German translation of: ${item.prompt}`}
        placeholder="Auf Deutsch …"
        value={response.text}
        disabled={locked}
        onChange={(text) => onChange({ type: 'translation', text })}
        onSubmit={onSubmit}
      />
    </span>
  );
}

export function Writing({ item, response, onChange, locked, result }: WidgetProps<'writing'>) {
  return (
    <span className={verdictFrame(locked, result)}>
      <GermanInput
        multiline
        label={item.prompt}
        placeholder="Schreib einen Satz …"
        value={response.text}
        disabled={locked}
        onChange={(text) => onChange({ type: 'writing', text })}
      />
    </span>
  );
}

export function Matching({ item, response, onChange, locked, result }: WidgetProps<'matching'>) {
  const rights = useMemo(() => seededShuffle(item.pairs.map((pair) => pair.right), item.id), [item]);
  return (
    <ul className="grid gap-2">
      {item.pairs.map((pair) => {
        const mark = result?.pairs?.[pair.left];
        return (
          <li key={pair.left} className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="de min-w-[9rem] flex-1" lang="de">
              {pair.left}
            </span>
            {locked ? (
              <span className="min-w-0 flex-[1_1_12rem]">
                <Fix given={response.selection[pair.left] ?? ''} expected={pair.right} correct={mark === true} />
              </span>
            ) : (
              <select
                className="field min-w-0 max-w-full flex-[1_1_12rem]"
                aria-label={`Match for ${pair.left}`}
                value={response.selection[pair.left] ?? ''}
                onChange={(event) =>
                  onChange({ type: 'matching', selection: { ...response.selection, [pair.left]: event.target.value } })
                }
              >
                <option value="">Choose …</option>
                {rights.map((right) => (
                  <option key={right} value={right}>
                    {right}
                  </option>
                ))}
              </select>
            )}
            <span className="w-5 text-center font-bold" aria-live="polite">
              {mark === true && <span className="text-good" aria-label="correct">✓</span>}
              {mark === false && <span className="text-bad" aria-label="wrong">✗</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function WordOrder({ item, response, onChange, locked, result }: WidgetProps<'word-order'>) {
  const tiles = useMemo(() => seededShuffle(tokenize(item.answer), item.id), [item]);
  const [placed, setPlaced] = useState<number[]>([]);

  function update(next: number[]) {
    setPlaced(next);
    onChange({ type: 'word-order', tokens: next.map((index) => tiles[index]!) });
  }

  if (locked) {
    return (
      <p className="de text-lg leading-loose" lang="de">
        <Fix given={response.tokens.join(' ')} expected={item.answer} correct={!!result?.correct} />
      </p>
    );
  }

  const tile = 'rounded-lg border border-line bg-surface px-3 py-1.5 font-semibold shadow-sm transition-colors hover:border-ink';
  return (
    <div className="grid gap-3" lang="de">
      <div
        className="flex min-h-[3.4rem] flex-wrap items-center gap-2 rounded-xl border border-dashed border-line bg-surface-2 p-2"
        aria-label="Your sentence"
      >
        {placed.length === 0 && <span className="px-2 text-sm text-muted" lang="en">Tap the words in the right order.</span>}
        {placed.map((index, position) => (
          <button
            key={index}
            type="button"
            className={tile}
            onClick={() => update(placed.filter((_, i) => i !== position))}
            aria-label={`Remove ${tiles[index]}`}
          >
            {tiles[index]}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2" aria-label="Available words">
        {tiles.map((word, index) =>
          placed.includes(index) ? (
            <span key={index} className="invisible rounded-lg border px-3 py-1.5 font-semibold" aria-hidden="true">
              {word}
            </span>
          ) : (
            <button key={index} type="button" className={tile} onClick={() => update([...placed, index])}>
              {word}
            </button>
          ),
        )}
      </div>
    </div>
  );
}

function Phrases({ phrases }: { phrases: string[] }) {
  if (phrases.length === 0) return null;
  return (
    <details className="rounded-xl border border-line px-4 py-2 text-sm">
      <summary className="cursor-pointer font-semibold">Useful phrases</summary>
      <ul className="mt-2 grid gap-1" lang="de">
        {phrases.map((phrase) => (
          <li key={phrase}>{phrase}</li>
        ))}
      </ul>
    </details>
  );
}

function Checklist({ labels, values, onToggle, disabled, legend }: {
  labels: string[];
  values: boolean[];
  onToggle: (index: number) => void;
  disabled: boolean;
  legend: string;
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-sm font-semibold">{legend}</legend>
      {labels.map((label, index) => (
        <label key={label} className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 accent-[var(--good)]"
            checked={values[index] === true}
            disabled={disabled}
            onChange={() => onToggle(index)}
          />
          <span>{label}</span>
        </label>
      ))}
    </fieldset>
  );
}

function ModelAnswer({ text, label = 'Model answer' }: { text: string; label?: string }) {
  return (
    <div className="rounded-xl bg-surface-2 p-4">
      <p className="eyebrow mb-1">{label}</p>
      <p className="whitespace-pre-line leading-relaxed" lang="de">{text}</p>
      <button type="button" className="listen btn btn-quiet btn-small mt-2 -ml-2" onClick={() => speak(text)}>
        Listen
      </button>
    </div>
  );
}

export function WritingTask({ item, response, onChange, locked, phase }: WidgetProps<'writing-task'>) {
  const words = countWords(response.text);
  const longEnough = words >= item.minWords;
  const compared = response.covered.length === item.points.length;
  const showModel = phase === 'assess' || (phase === 'practice' && (compared || locked));

  const toggle = (index: number) => {
    const base = compared ? response.covered : item.points.map(() => false);
    onChange({ ...response, covered: base.map((value, i) => (i === index ? !value : value)) });
  };

  return (
    <div className="grid gap-4">
      <div>
        <p className="mb-1 text-sm font-semibold">Your text has to cover:</p>
        <ul className="list-disc pl-5 text-sm">
          {item.points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      </div>

      {phase === 'practice' && <Phrases phrases={item.phrases} />}

      {phase === 'assess' ? (
        <div className="rounded-xl border border-line p-4">
          <p className="eyebrow mb-1">Your text</p>
          <p className="whitespace-pre-line leading-relaxed" lang="de">{response.text || '(nothing written)'}</p>
        </div>
      ) : (
        <GermanInput
          multiline
          rows={7}
          label={item.prompt}
          placeholder="Schreiben Sie hier …"
          value={response.text}
          disabled={locked || (phase === 'practice' && compared)}
          onChange={(text) => onChange({ ...response, text })}
        />
      )}

      <p className={`text-sm tabular-nums ${longEnough ? 'text-good' : 'text-muted'}`}>
        {words} {words === 1 ? 'word' : 'words'}; at least {item.minWords} needed.
      </p>

      {phase === 'practice' && !compared && !locked && (
        <button
          type="button"
          className="btn justify-self-start"
          disabled={!longEnough}
          onClick={() => onChange({ ...response, covered: item.points.map(() => false) })}
        >
          Compare with a model answer
        </button>
      )}

      {showModel && (
        <>
          <ModelAnswer text={item.sample} />
          <Checklist
            legend="Compare honestly. Which points does your text cover?"
            labels={item.points}
            values={response.covered}
            onToggle={toggle}
            disabled={locked}
          />
        </>
      )}
    </div>
  );
}

function Recorder({ id, allowRecord }: { id: string; allowRecord: boolean }) {
  const { url, recording, failed, start, stop } = useRecording(id);

  return (
    <div className="grid gap-2">
      {allowRecord && (
        <div className="flex flex-wrap items-center gap-3">
          {recording ? (
            <button type="button" className="btn btn-accent" onClick={stop}>
              Stop recording
            </button>
          ) : (
            <button type="button" className="btn" onClick={start}>
              {url ? 'Record again' : 'Record yourself'}
            </button>
          )}
          {recording && <span className="text-sm text-bad" aria-live="polite">Recording …</span>}
        </div>
      )}
      {url && <audio controls src={url} className="w-full max-w-md" aria-label="Your recording" />}
      {failed && (
        <p className="text-sm text-muted">
          The microphone is not available. Say your answer out loud instead; the recording is only there to help you listen back.
        </p>
      )}
    </div>
  );
}

export function SpeakingTask({ item, response, onChange, locked, phase }: WidgetProps<'speaking-task'>) {
  const compared = response.done.length === item.checklist.length;
  // Listen-and-repeat hears the model first; a free answer sees it only afterwards.
  const repeat = item.repeat && phase === 'practice';
  const showModel = phase === 'assess' || (phase === 'practice' && (compared || locked));

  const toggle = (index: number) => {
    const base = compared ? response.done : item.checklist.map(() => false);
    onChange({ type: 'speaking-task', done: base.map((value, i) => (i === index ? !value : value)) });
  };

  return (
    <div className="grid gap-4">
      {item.cards.length > 0 && (
        <p className="flex flex-wrap gap-2" lang="de" aria-label="Cue cards">
          {item.cards.map((card) => (
            <span key={card} className="rounded-lg border border-line bg-surface-2 px-3 py-2 font-semibold">{card}</span>
          ))}
        </p>
      )}

      {repeat && <ModelAnswer text={item.sample} label="Listen, then repeat" />}
      {phase === 'practice' && <Phrases phrases={item.phrases} />}

      <Recorder id={item.id} allowRecord={phase !== 'assess' && !locked} />
      {phase === 'practice' && !locked && (
        <p className="text-sm text-muted">
          Recording is optional and stays on this device. If you cannot speak aloud right now, say it in your head or
          write it down, then compare.
        </p>
      )}

      {phase === 'practice' && !compared && !locked && (
        <button
          type="button"
          className="btn justify-self-start"
          onClick={() => onChange({ type: 'speaking-task', done: item.checklist.map(() => false) })}
        >
          {repeat ? 'I have said it' : 'I have said it. Show a model answer'}
        </button>
      )}

      {showModel && (
        <>
          {!repeat && <ModelAnswer text={item.sample} />}
          <Checklist
            legend="Be honest. What did your answer manage?"
            labels={item.checklist}
            values={response.done}
            onToggle={toggle}
            disabled={locked}
          />
        </>
      )}
    </div>
  );
}

interface ItemWidgetProps {
  item: Exercise;
  response: Response;
  onChange: (response: Response) => void;
  locked: boolean;
  result: GradeResult | null;
  onSubmit?: () => void;
  phase?: Phase;
}

/** Picks the widget for an exercise. Used by lessons, review and exams alike. */
export function ItemWidget({ item, response, onChange, locked, result, onSubmit = () => {}, phase = 'practice' }: ItemWidgetProps) {
  const shared = { onChange, locked, result, onSubmit, phase };
  if (item.type === 'multiple-choice' && response.type === 'multiple-choice') return <MultipleChoice item={item} response={response} {...shared} />;
  if (item.type === 'true-false' && response.type === 'true-false') return <TrueFalse item={item} response={response} {...shared} />;
  if (item.type === 'fill-blank' && response.type === 'fill-blank') return <FillBlank item={item} response={response} {...shared} />;
  if (item.type === 'cloze' && response.type === 'cloze') return <Cloze item={item} response={response} {...shared} />;
  if (item.type === 'form' && response.type === 'form') return <Form item={item} response={response} {...shared} />;
  if (item.type === 'translation' && response.type === 'translation') return <Translation item={item} response={response} {...shared} />;
  if (item.type === 'writing' && response.type === 'writing') return <Writing item={item} response={response} {...shared} />;
  if (item.type === 'matching' && response.type === 'matching') return <Matching item={item} response={response} {...shared} />;
  if (item.type === 'word-order' && response.type === 'word-order') return <WordOrder item={item} response={response} {...shared} />;
  if (item.type === 'writing-task' && response.type === 'writing-task') return <WritingTask item={item} response={response} {...shared} />;
  if (item.type === 'speaking-task' && response.type === 'speaking-task') return <SpeakingTask item={item} response={response} {...shared} />;
  return null;
}
