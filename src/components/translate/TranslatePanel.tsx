import { useEffect, useRef, useState } from 'react';
import { saveWord } from '../../lib/stores';
import { findWords, googleTranslateHref, MAX_CHARS, translate, type CourseWord, type Direction } from '../../lib/translate';

interface Props {
  /** The course word list, fetched the first time something is translated. */
  wordsHref: string;
}

interface Result {
  source: string;
  direction: Direction;
  text: string;
}

const LABEL: Record<Direction, string> = { 'de-en': 'Deutsch → English', 'en-de': 'English → Deutsch' };

let wordList: Promise<CourseWord[]> | undefined;
function loadWords(href: string): Promise<CourseWord[]> {
  wordList ??= fetch(href)
    .then((response) => response.json() as Promise<CourseWord[]>)
    .catch(() => {
      wordList = undefined;
      return [];
    });
  return wordList;
}

/**
 * A translate button on every page. Select text first and the button
 * translates it; otherwise it opens a box to type into.
 */
export default function TranslatePanel({ wordsHref }: Props) {
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<Direction>('de-en');
  const [text, setText] = useState('');
  const [result, setResult] = useState<Result>();
  const [words, setWords] = useState<CourseWord[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const selected = useRef('');
  const focusInput = useRef(false);
  const request = useRef<AbortController>(undefined);

  useEffect(() => {
    if (open && focusInput.current) input.current?.focus();
  }, [open]);

  async function run(source: string, to = direction) {
    const clean = source.trim();
    if (!clean) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError('');
    setSaved(false);
    setResult(undefined);
    const list = await loadWords(wordsHref);
    if (request.current !== controller) return;
    setWords(findWords(clean, to, list));
    try {
      setResult({ source: clean, direction: to, text: await translate(clean, to, controller.signal) });
    } catch (caught) {
      if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      if (request.current === controller) setBusy(false);
    }
  }

  /** Text selected on the page, read before the click can clear it. Text in the panel itself does not count. */
  function rememberSelection() {
    const selection = window.getSelection();
    selected.current = selection && !panel.current?.contains(selection.anchorNode) ? selection.toString().trim() : '';
  }

  function onButton() {
    const picked = selected.current.slice(0, MAX_CHARS);
    selected.current = '';
    if (picked && picked !== result?.source) {
      focusInput.current = false;
      setOpen(true);
      setText(picked);
      void run(picked);
      return;
    }
    focusInput.current = true;
    setOpen(!open);
  }

  function close() {
    setOpen(false);
    button.current?.focus();
  }

  function swap() {
    setDirection(direction === 'de-en' ? 'en-de' : 'de-en');
    setResult(undefined);
    setWords([]);
    setError('');
  }

  function save() {
    if (!result) return;
    const [de, en] = result.direction === 'de-en' ? [result.source, result.text] : [result.text, result.source];
    saveWord({ de, en });
    setSaved(true);
  }

  const german = result && (result.direction === 'de-en' ? result.source : result.text);
  const [from, to] = direction.split('-');

  return (
    <>
      {open && (
        <div
          ref={panel}
          id="translate-panel"
          role="dialog"
          aria-label="Translate"
          onKeyDown={(event) => event.key === 'Escape' && close()}
          className="card fixed inset-x-3 bottom-[calc(7.75rem+env(safe-area-inset-bottom))] z-40 grid max-h-[calc(100dvh-11rem)] gap-3 overflow-y-auto p-4 shadow-[var(--lift)] sm:inset-x-auto sm:right-6 sm:bottom-22 sm:w-[25rem]"
        >
          <div className="flex items-center gap-2">
            <button type="button" className="btn btn-small" onClick={swap} aria-label={`${LABEL[direction]}. Swap languages`}>
              {LABEL[direction]}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m17 3 3 3-3 3M4 6h16M7 21l-3-3 3-3M20 18H4" />
              </svg>
            </button>
            <button type="button" className="btn btn-quiet btn-small ml-auto" onClick={close} aria-label="Close translator">
              ✕
            </button>
          </div>

          <form
            className="grid gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void run(text);
            }}
          >
            <textarea
              ref={input}
              className="field min-h-20 resize-y"
              lang={from}
              rows={3}
              maxLength={MAX_CHARS}
              aria-label={from === 'de' ? 'German text' : 'English text'}
              placeholder={from === 'de' ? 'Type or paste German …' : 'Type or paste English …'}
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                // Enter translates; Shift+Enter starts a new line.
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void run(text);
                }
              }}
            />
            <div className="flex items-center gap-3">
              <button type="submit" className="btn btn-accent btn-small" disabled={busy || !text.trim()}>
                {busy ? 'Translating …' : 'Translate'}
              </button>
              {text.length > MAX_CHARS - 100 && (
                <span className="text-xs tabular-nums text-muted">
                  {text.length}/{MAX_CHARS}
                </span>
              )}
            </div>
          </form>

          {!result && !error && !busy && !text && (
            <p className="text-sm text-muted">Tip: select text on any page, then press Translate.</p>
          )}

          {error && (
            <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm">
              {error}
            </p>
          )}

          {result && (
            <div className="rounded-lg bg-surface-2 p-3" aria-live="polite">
              <p lang={to} className="text-lg">
                {result.text}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button type="button" className="speak" data-speak={german} aria-label={`Listen: ${german}`} title="Listen">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M11 5 6 9H3v6h3l5 4z" />
                    <path d="M15.5 8.5a5 5 0 0 1 0 7" />
                    <path d="M18.5 5.5a9 9 0 0 1 0 13" />
                  </svg>
                </button>
                <button type="button" className="btn btn-small" onClick={save} disabled={saved}>
                  {saved ? 'Saved' : 'Save to Notebook'}
                </button>
                {saved && <span className="text-xs text-muted">It will come up in Review.</span>}
              </div>
            </div>
          )}

          {words.length > 0 && (
            <section aria-label="In your course">
              <h2 className="eyebrow">In your course</h2>
              <ul className="mt-1 grid gap-1.5 text-sm">
                {words.map((word) => (
                  <li key={`${word.de}|${word.href}`}>
                    <span lang="de" className="font-semibold">
                      {word.article && <span className={`gender-${word.article}`}>{word.article} </span>}
                      {word.de}
                    </span>
                    {word.plural && word.plural !== '-' && (
                      <span lang="de" className="text-muted">
                        , die {word.plural}
                      </span>
                    )}
                    <span> · {word.en}</span>
                    <a href={word.href} className="block text-xs text-muted underline underline-offset-2 hover:text-ink">
                      {word.lesson}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <p className="text-xs text-muted">
            Machine translation by MyMemory; it can be wrong.
            {text.trim() && (
              <>
                {' '}
                <a
                  href={googleTranslateHref(text.trim(), direction)}
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-2 hover:text-ink"
                >
                  Compare in Google Translate ↗
                </a>
              </>
            )}
          </p>
        </div>
      )}

      <button
        ref={button}
        type="button"
        aria-label="Translate"
        aria-expanded={open}
        aria-controls="translate-panel"
        title="Translate (select text first to translate it)"
        onPointerDown={rememberSelection}
        onKeyDown={(event) => (event.key === 'Enter' || event.key === ' ') && rememberSelection()}
        onClick={onButton}
        className="fixed right-4 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-40 flex size-12 items-center justify-center gap-2 rounded-full bg-ink font-semibold text-bg shadow-[var(--lift)] transition-colors hover:bg-accent hover:text-accent-ink sm:right-6 sm:bottom-6 sm:w-auto sm:px-4"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 5h8M7 3v2M9.5 5c-.6 3.4-2.7 6-5.5 7.5M5.5 8.5c1 1.6 2.6 2.9 4.5 3.5M12.5 21l4-9 4 9M14 18h5" />
        </svg>
        <span className="hidden sm:inline">Translate</span>
      </button>
    </>
  );
}
