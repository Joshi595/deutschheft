import { useEffect, useRef, useState } from 'react';
import { saveWord } from '../../lib/stores';
import { findWords, googleTranslateHref, MAX_CHARS, translate, type CourseWord, type Direction } from '../../lib/translate';
import { Icon } from '../ui/Icon';

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
 * The translator behind the shell's Translate button ([data-translate-open]).
 * Select text first and the button translates it; otherwise it opens a box to
 * type into. While text is selected, a small chip beside it does the same.
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
  const trigger = useRef<HTMLElement | null>(null);
  const [chip, setChip] = useState<{ x: number; y: number }>();
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
    trigger.current?.focus();
  }

  // The shell's button lives outside React; reach it through the document.
  const onButtonRef = useRef(onButton);
  onButtonRef.current = onButton;
  useEffect(() => {
    const triggerOf = (event: Event) => (event.target as Element | null)?.closest?.<HTMLElement>('[data-translate-open]');
    const down = (event: Event) => triggerOf(event) && rememberSelection();
    const click = (event: Event) => {
      const found = triggerOf(event);
      if (!found) return;
      trigger.current = found;
      onButtonRef.current();
    };
    // A chip next to selected page text, gone again as soon as the selection or the scroll position changes.
    let frame = 0;
    const select = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const selection = window.getSelection();
        const node = selection?.anchorNode;
        const element = node instanceof Element ? node : node?.parentElement;
        const picked = selection?.toString().trim() ?? '';
        if (!picked || !selection?.rangeCount || !element?.closest('main') || element.closest('input, textarea, [contenteditable]')) {
          setChip(undefined);
          return;
        }
        const rect = selection.getRangeAt(0).getBoundingClientRect();
        setChip({ x: Math.max(8, Math.min(rect.left, window.innerWidth - 130)), y: Math.min(rect.bottom + 8, window.innerHeight - 120) });
      });
    };
    const hide = () => setChip(undefined);
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('click', click);
    document.addEventListener('selectionchange', select);
    window.addEventListener('scroll', hide, { passive: true });
    return () => {
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('click', click);
      document.removeEventListener('selectionchange', select);
      window.removeEventListener('scroll', hide);
    };
  }, []);

  useEffect(() => {
    document.querySelectorAll('[data-translate-open]').forEach((each) => each.setAttribute('aria-expanded', String(open)));
  }, [open]);

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
          className="fixed inset-x-3 bottom-[calc(var(--tabbar-h)+0.75rem+env(safe-area-inset-bottom))] z-50 grid max-h-[calc(100dvh-var(--header-h)-var(--tabbar-h)-2rem)] gap-3 overflow-y-auto rounded border-2 border-ink bg-surface p-4 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:max-h-[calc(100dvh-3rem)] sm:w-[25rem]"
        >
          <div className="flex items-center gap-2">
            <button type="button" className="btn btn-small" onClick={swap} aria-label={`${LABEL[direction]}. Swap languages`}>
              {LABEL[direction]}
              <Icon name="swap" size={16} />
            </button>
            <button type="button" className="btn btn-quiet btn-small ml-auto" onClick={close} aria-label="Close translator">
              <Icon name="cross" size={18} />
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
            <p className="text-sm text-muted">Tip: select text on any page and a Translate button appears next to it.</p>
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
                  <Icon name="listen" size={16} />
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
                  Compare in Google Translate
                  <Icon name="external" size={12} className="ml-1 inline align-baseline" />
                </a>
              </>
            )}
          </p>
        </div>
      )}

      {chip && (
        <button
          type="button"
          className="btn btn-primary btn-small fixed z-50"
          style={{ left: chip.x, top: chip.y }}
          onPointerDown={(event) => {
            // Keep the selection: the click must not clear what it is about to translate.
            event.preventDefault();
            rememberSelection();
          }}
          onClick={() => {
            setChip(undefined);
            onButton();
          }}
        >
          <Icon name="translate" size={16} />
          Translate
        </button>
      )}
    </>
  );
}
