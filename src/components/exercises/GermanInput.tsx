import { useRef } from 'react';

const SPECIAL = ['ä', 'ö', 'ü', 'ß', 'Ä', 'Ö', 'Ü'];

interface Props {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  disabled?: boolean;
  multiline?: boolean;
  /** Called on Enter in a single-line input. */
  onSubmit?: () => void;
  /** Width in characters for a gap inside a sentence; omit for full width. */
  size?: number;
  /** Height of a multiline input, in lines. */
  rows?: number;
}

/** Text input with buttons for the letters a non-German keyboard lacks. */
export function GermanInput({ value, onChange, label, placeholder, disabled, multiline, onSubmit, size, rows = 3 }: Props) {
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  function insert(char: string) {
    const element = ref.current;
    const start = element?.selectionStart ?? value.length;
    const end = element?.selectionEnd ?? value.length;
    onChange(value.slice(0, start) + char + value.slice(end));
    requestAnimationFrame(() => {
      element?.focus();
      element?.setSelectionRange(start + char.length, start + char.length);
    });
  }

  const shared = {
    ref,
    value,
    disabled,
    placeholder,
    'aria-label': label,
    lang: 'de',
    autoComplete: 'off',
    autoCapitalize: 'off',
    autoCorrect: 'off',
    spellCheck: false,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(event.target.value),
  };

  return (
    <span className={size ? 'inline-flex flex-col gap-1 align-middle' : 'flex flex-col gap-2'}>
      {multiline ? (
        <textarea {...shared} rows={rows} className="field resize-y" />
      ) : (
        <input
          {...shared}
          type="text"
          className="field"
          style={size ? { width: `${size}ch`, minWidth: '7ch' } : undefined}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onSubmit?.();
          }}
        />
      )}
      {!disabled && (
        <span className="flex flex-wrap gap-1" aria-label="Insert a German letter">
          {SPECIAL.map((char) => (
            <button
              key={char}
              type="button"
              tabIndex={-1}
              className="btn btn-small h-8 min-h-0 w-8 px-0 font-medium"
              onClick={() => insert(char)}
              aria-label={`Insert ${char}`}
            >
              {char}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}
