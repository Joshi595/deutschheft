import { useStore } from '@nanostores/react';
import { useRef, useState } from 'react';
import { germanAvailable, speak } from '../../lib/speech';
import { $notebook, $progress, $review, $settings, exportBackup, importBackup, resetAll, updateSettings, type Settings } from '../../lib/stores';

const THEMES: { value: Settings['theme']; label: string }[] = [
  { value: 'system', label: 'Match device' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export default function SettingsPage() {
  const settings = useStore($settings);
  const progress = useStore($progress);
  const review = useStore($review);
  const notebook = useStore($notebook);
  const fileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [showKey, setShowKey] = useState(false);

  const voice = germanAvailable();

  function download() {
    const backup = exportBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `learn-german-backup-${backup.exportedAt.slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    setMessage({ kind: 'ok', text: 'Backup downloaded.' });
  }

  async function restore(file: File | undefined) {
    if (!file) return;
    try {
      const text = await file.text();
      if (!window.confirm('Importing replaces the progress, review cards and notebook in this browser. Continue?')) return;
      importBackup(text);
      setMessage({ kind: 'ok', text: 'Backup imported.' });
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'The file could not be imported.' });
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  function reset() {
    if (window.confirm('Delete all progress, review cards and notebook entries in this browser? This cannot be undone.')) {
      resetAll();
      setMessage({ kind: 'ok', text: 'All learning data in this browser was deleted.' });
    }
  }

  return (
    <div className="grid gap-6">
      <Section title="Appearance">
        <div role="radiogroup" aria-label="Theme" className="flex flex-wrap gap-2">
          {THEMES.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={settings.theme === value}
              className={`btn ${settings.theme === value ? 'btn-primary' : ''}`}
              onClick={() => updateSettings({ theme: value })}
            >
              {label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Spoken German">
        <p className="text-sm text-muted">
          Audio uses the German voice built into your browser or device.
          {voice === false && ' No German voice was found here, so the listen buttons are hidden. Installing a German voice in your system settings brings them back.'}
        </p>
        <label className="grid gap-2">
          <span className="text-sm font-semibold">
            Speed: <span className="tabular-nums">{settings.speechRate.toFixed(2)}×</span>
          </span>
          <input
            type="range"
            min={0.5}
            max={1.2}
            step={0.05}
            value={settings.speechRate}
            onChange={(event) => updateSettings({ speechRate: Number(event.target.value) })}
            className="w-full max-w-sm accent-[var(--accent)]"
          />
        </label>
        <button
          type="button"
          className="btn justify-self-start"
          disabled={voice === false}
          onClick={() => speak('Guten Tag! Wie geht es Ihnen heute?', settings.speechRate)}
        >
          Play a sample
        </button>
      </Section>

      <Section title="AI explanations (optional)">
        <p className="text-sm text-muted">
          Everything works without this. With your own Groq API key, a wrong answer gets an "Explain my mistake" button and
          writing exercises can be checked. The key is stored in this browser only, is sent only to Groq, and is never
          included in backups. Exercises are always graded by the app itself, not by AI.
        </p>
        <label className="grid gap-2">
          <span className="text-sm font-semibold">Groq API key</span>
          <span className="flex flex-wrap gap-2">
            <input
              type={showKey ? 'text' : 'password'}
              className="field min-w-[14rem] flex-1 font-mono text-sm"
              placeholder="gsk_…"
              autoComplete="off"
              spellCheck={false}
              value={settings.aiKey}
              onChange={(event) => updateSettings({ aiKey: event.target.value })}
            />
            <button type="button" className="btn" onClick={() => setShowKey(!showKey)}>
              {showKey ? 'Hide' : 'Show'}
            </button>
            {settings.aiKey && (
              <button type="button" className="btn btn-quiet" onClick={() => updateSettings({ aiKey: '' })}>
                Remove
              </button>
            )}
          </span>
        </label>
        <label className="grid gap-2">
          <span className="text-sm font-semibold">Model</span>
          <input
            type="text"
            className="field max-w-sm font-mono text-sm"
            spellCheck={false}
            value={settings.aiModel}
            onChange={(event) => updateSettings({ aiModel: event.target.value })}
          />
          <span className="text-sm text-muted">Any chat model your Groq account offers. Change it if this one is retired.</span>
        </label>
      </Section>

      <Section title="Your data">
        <p className="text-sm text-muted">
          Stored in this browser only: {Object.keys(progress.exercises).length} answered exercises,{' '}
          {Object.keys(review).length} review cards, {notebook.words.length} saved words,{' '}
          {Object.keys(notebook.notes).length} lesson notes. Download a backup to move to another device or browser.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary" onClick={download}>
            Download backup
          </button>
          <button type="button" className="btn" onClick={() => fileInput.current?.click()}>
            Import backup
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => restore(event.target.files?.[0])}
          />
          <button type="button" className="btn btn-quiet text-bad" onClick={reset}>
            Delete everything
          </button>
        </div>
        {message && (
          <p role="status" className={`text-sm font-semibold ${message.kind === 'ok' ? 'text-good' : 'text-bad'}`}>
            {message.text}
          </p>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card grid gap-4 p-5">
      <h2 className="text-2xl">{title}</h2>
      {children}
    </section>
  );
}
