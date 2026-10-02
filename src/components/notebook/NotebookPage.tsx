import { useStore } from '@nanostores/react';
import { useState } from 'react';
import { matches } from '../../lib/notebook/logic';
import { speak } from '../../lib/speech';
import { $notebook, $settings, clearMistakes, deleteWord, saveNote, saveWord } from '../../lib/stores';

interface Props {
  /** Lesson titles and links by lesson key. */
  lessons: Record<string, { title: string; href: string; level: string }>;
}

type Tab = 'words' | 'notes' | 'mistakes';

const dateText = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export default function NotebookPage({ lessons }: Props) {
  const notebook = useStore($notebook);
  const settings = useStore($settings);
  const [tab, setTab] = useState<Tab>('words');
  const [query, setQuery] = useState('');
  const [de, setDe] = useState('');
  const [en, setEn] = useState('');
  const [note, setNote] = useState('');

  const lessonTitle = (key?: string) => (key ? lessons[key]?.title : undefined);

  const words = notebook.words.filter((word) => matches(query, word.de, word.en, word.note, lessonTitle(word.lessonKey)));
  const notes = Object.entries(notebook.notes).filter(([key, text]) => matches(query, text, lessonTitle(key)));
  const mistakes = notebook.mistakes.filter((mistake) =>
    matches(query, mistake.prompt, mistake.given, mistake.expected, lessonTitle(mistake.lessonKey)),
  );

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'words', label: 'My words', count: words.length },
    { id: 'notes', label: 'Lesson notes', count: notes.length },
    { id: 'mistakes', label: 'Mistakes', count: mistakes.length },
  ];

  function addWord(event: { preventDefault(): void }) {
    event.preventDefault();
    if (!de.trim() || !en.trim()) return;
    saveWord({ de: de.trim(), en: en.trim(), note: note.trim() || undefined });
    setDe('');
    setEn('');
    setNote('');
  }

  return (
    <div className="grid gap-6">
      <input
        type="search"
        className="field"
        placeholder="Search words, notes and mistakes …"
        aria-label="Search the notebook"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      <div role="tablist" aria-label="Notebook sections" className="flex gap-1 border-b border-line">
        {tabs.map(({ id, label, count }) => (
          <button
            key={id}
            role="tab"
            type="button"
            id={`tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            onClick={() => setTab(id)}
            className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-semibold ${
              tab === id ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {label} <span className="font-normal tabular-nums text-muted">{count}</span>
          </button>
        ))}
      </div>

      {tab === 'words' && (
        <section role="tabpanel" id="panel-words" aria-labelledby="tab-words" className="grid gap-5">
          <form onSubmit={addWord} className="card grid gap-3 p-4 sm:grid-cols-2">
            <p className="text-sm text-muted sm:col-span-2">
              Words and phrases you met outside the lessons. Each one becomes a review card.
            </p>
            <input className="field" lang="de" placeholder="German, e.g. die Herausforderung" aria-label="German" value={de} onChange={(event) => setDe(event.target.value)} />
            <input className="field" placeholder="English" aria-label="English" value={en} onChange={(event) => setEn(event.target.value)} />
            <input className="field sm:col-span-2" placeholder="Note or example sentence (optional)" aria-label="Note" value={note} onChange={(event) => setNote(event.target.value)} />
            <button type="submit" className="btn btn-primary justify-self-start" disabled={!de.trim() || !en.trim()}>
              Save word
            </button>
          </form>

          {words.length === 0 ? (
            <Empty>{query ? 'No saved words match your search.' : 'No saved words yet.'}</Empty>
          ) : (
            <ul className="card divide-y divide-line">
              {words.map((word) => (
                <li key={word.id} className="flex items-start gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <p>
                      <span className="de text-lg" lang="de">{word.de}</span>{' '}
                      <span className="text-muted">{word.en}</span>
                    </p>
                    {word.note && <p className="text-sm">{word.note}</p>}
                    <p className="mt-1 text-xs text-muted">
                      {dateText(word.at)}
                      {word.lessonKey && lessons[word.lessonKey] && (
                        <> · <a className="underline underline-offset-2" href={lessons[word.lessonKey]!.href}>{lessons[word.lessonKey]!.title}</a></>
                      )}
                    </p>
                  </div>
                  <button type="button" className="btn btn-quiet btn-small" onClick={() => speak(word.de, settings.speechRate)}>
                    Listen
                  </button>
                  <button type="button" className="btn btn-quiet btn-small" onClick={() => deleteWord(word.id)} aria-label={`Delete ${word.de}`}>
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === 'notes' && (
        <section role="tabpanel" id="panel-notes" aria-labelledby="tab-notes" className="grid gap-4">
          {notes.length === 0 ? (
            <Empty>
              {query ? 'No notes match your search.' : 'No notes yet. Every lesson has a Notes section at the bottom; what you write there is collected here.'}
            </Empty>
          ) : (
            notes.map(([key, text]) => (
              <label key={key} className="card grid gap-2 p-4">
                <span className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold">{lessonTitle(key) ?? key}</span>
                  {lessons[key] && (
                    <a href={lessons[key]!.href} className="text-sm text-muted underline underline-offset-2">
                      {lessons[key]!.level.toUpperCase()} · open lesson
                    </a>
                  )}
                </span>
                <textarea className="field min-h-[6rem] resize-y" value={text} onChange={(event) => saveNote(key, event.target.value)} />
              </label>
            ))
          )}
        </section>
      )}

      {tab === 'mistakes' && (
        <section role="tabpanel" id="panel-mistakes" aria-labelledby="tab-mistakes" className="grid gap-4">
          {mistakes.length === 0 ? (
            <Empty>{query ? 'No mistakes match your search.' : 'No mistakes logged. Wrong answers are recorded here so you can see patterns.'}</Empty>
          ) : (
            <>
              <ul className="card divide-y divide-line">
                {mistakes.map((mistake, index) => (
                  <li key={`${mistake.exerciseId}-${mistake.at}-${index}`} className="grid gap-1 p-4">
                    <p className="font-semibold">{mistake.prompt}</p>
                    <p className="text-sm">
                      <span className="text-muted">You wrote: </span>
                      <span className="text-bad" lang="de">{mistake.given || '(nothing)'}</span>
                    </p>
                    <p className="text-sm">
                      <span className="text-muted">Correct: </span>
                      <span className="de text-good" lang="de">{mistake.expected}</span>
                    </p>
                    <p className="text-xs text-muted">
                      {dateText(mistake.at)}
                      {lessons[mistake.lessonKey] && (
                        <> · <a className="underline underline-offset-2" href={`${lessons[mistake.lessonKey]!.href}#practice`}>{lessons[mistake.lessonKey]!.title}</a></>
                      )}
                    </p>
                  </li>
                ))}
              </ul>
              {!query && (
                <button
                  type="button"
                  className="btn btn-quiet justify-self-start"
                  onClick={() => {
                    if (window.confirm('Clear the mistakes log? Your progress and review cards are not affected.')) clearMistakes();
                  }}
                >
                  Clear the log
                </button>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="card p-6 text-muted">{children}</p>;
}
