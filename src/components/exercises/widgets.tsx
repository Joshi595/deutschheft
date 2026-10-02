import { useMemo, useState } from 'react';
import type { ExerciseOf } from '../../lib/content/schema';
import type { GradeResult, Response } from '../../lib/grading/grade';
import { seededShuffle, tokenize } from '../../lib/grading/shuffle';
import { GermanInput } from './GermanInput';

/** One input widget per exercise type. Each reports a Response; none of them grades. */

interface WidgetProps<T extends Response['type']> {
  item: ExerciseOf<T>;
  response: Extract<Response, { type: T }>;
  onChange: (response: Response) => void;
  /** Solved or revealed: inputs are frozen and the solution is shown. */
  locked: boolean;
  result: GradeResult | null;
  onSubmit: () => void;
}

export function MultipleChoice({ item, response, onChange, locked }: WidgetProps<'multiple-choice'>) {
  const options = useMemo(() => seededShuffle(item.options, item.id), [item]);
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
            className={[
              'rounded-xl border px-4 py-3 text-left transition-colors disabled:cursor-default',
              state === 'chosen' && 'border-ink bg-accent-soft',
              state === 'right' && 'border-good bg-good-soft text-good font-semibold',
              state === 'wrong' && 'border-bad bg-bad-soft text-bad',
              state === 'plain' && 'border-line bg-surface' + (locked ? ' opacity-60' : ' hover:border-ink'),
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {option}
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
          <span className={`rounded px-1.5 py-0.5 ${result?.correct ? 'bg-good-soft text-good' : 'bg-accent-soft'}`}>
            {result?.expected}
          </span>
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

export function Translation({ item, response, onChange, locked, onSubmit }: WidgetProps<'translation'>) {
  return (
    <GermanInput
      label={`German translation of: ${item.prompt}`}
      placeholder="Auf Deutsch …"
      value={response.text}
      disabled={locked}
      onChange={(text) => onChange({ type: 'translation', text })}
      onSubmit={onSubmit}
    />
  );
}

export function Writing({ item, response, onChange, locked }: WidgetProps<'writing'>) {
  return (
    <GermanInput
      multiline
      label={item.prompt}
      placeholder="Schreib einen Satz …"
      value={response.text}
      disabled={locked}
      onChange={(text) => onChange({ type: 'writing', text })}
    />
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
            <select
              className="field w-auto min-w-[12rem] flex-1"
              aria-label={`Match for ${pair.left}`}
              disabled={locked}
              value={locked ? pair.right : (response.selection[pair.left] ?? '')}
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

export function WordOrder({ item, onChange, locked }: WidgetProps<'word-order'>) {
  const tiles = useMemo(() => seededShuffle(tokenize(item.answer), item.id), [item]);
  const [placed, setPlaced] = useState<number[]>([]);

  function update(next: number[]) {
    setPlaced(next);
    onChange({ type: 'word-order', tokens: next.map((index) => tiles[index]!) });
  }

  if (locked) {
    return (
      <p className="de rounded-xl bg-surface-2 px-4 py-3 text-lg" lang="de">
        {item.answer}
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
