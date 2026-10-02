import { useStore } from '@nanostores/react';
import { useState } from 'react';
import { $notebook, saveNote, saveWord } from '../../lib/stores';

interface Props {
  lessonKey: string;
  notebookHref: string;
}

/** Notes for one lesson plus a quick way to save a word met along the way. */
export default function LessonNotes({ lessonKey, notebookHref }: Props) {
  const notebook = useStore($notebook);
  const [de, setDe] = useState('');
  const [en, setEn] = useState('');
  const saved = notebook.words.filter((word) => word.lessonKey === lessonKey);

  function addWord(event: { preventDefault(): void }) {
    event.preventDefault();
    if (!de.trim() || !en.trim()) return;
    saveWord({ de: de.trim(), en: en.trim(), lessonKey });
    setDe('');
    setEn('');
  }

  return (
    <div className="grid gap-5">
      <label className="grid gap-2">
        <span className="text-sm text-muted">
          Anything you want to remember from this lesson. Saved automatically, in this browser.
        </span>
        <textarea
          className="field min-h-[8rem] resize-y"
          value={notebook.notes[lessonKey] ?? ''}
          onChange={(event) => saveNote(lessonKey, event.target.value)}
          placeholder="e.g. After sein the adjective never takes an ending."
        />
      </label>

      <form onSubmit={addWord} className="grid gap-2">
        <p className="text-sm text-muted">Met a new word? Save it and it joins your reviews.</p>
        <div className="flex flex-wrap gap-2">
          <input
            className="field min-w-[10rem] flex-1"
            lang="de"
            placeholder="German, e.g. die Geduld"
            aria-label="German word"
            value={de}
            onChange={(event) => setDe(event.target.value)}
          />
          <input
            className="field min-w-[10rem] flex-1"
            placeholder="English"
            aria-label="English meaning"
            value={en}
            onChange={(event) => setEn(event.target.value)}
          />
          <button type="submit" className="btn" disabled={!de.trim() || !en.trim()}>
            Save word
          </button>
        </div>
        {saved.length > 0 && (
          <p className="text-sm text-muted">
            Saved from this lesson:{' '}
            {saved.map((word, index) => (
              <span key={word.id}>
                {index > 0 && ', '}
                <span className="de text-ink" lang="de">{word.de}</span> ({word.en})
              </span>
            ))}
            . <a href={notebookHref} className="underline underline-offset-4">Open notebook</a>
          </p>
        )}
      </form>
    </div>
  );
}
