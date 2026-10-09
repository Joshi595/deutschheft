import { useStore } from '@nanostores/react';
import { useEffect, useRef, useState } from 'react';
import { germanAvailable, rankGermanVoices, speak } from '../../lib/speech';
import { XP } from '../../lib/progress/logic';
import {
  $notebook,
  $progress,
  $review,
  $settings,
  DAILY_GOALS,
  exportBackup,
  importBackup,
  resetAll,
  updateSettings,
  type Settings,
} from '../../lib/stores';

/** Short, with sounds a poor voice gets wrong: ch, ü, ei, and a question's melody. */
const SAMPLE = 'Guten Tag! Ich möchte ein Brötchen und zwei Stück Kuchen. Wie geht es Ihnen heute?';

const THEMES: { value: Settings['theme']; label: string }[] = [
  { value: 'system', label: 'Match device' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

interface Props {
  /** Levels that have chapters, for the level choice. */
  levels: { id: string; title: string; name: string }[];
}

export default function SettingsPage({ levels }: Props) {
  const settings = useStore($settings);
  const progress = useStore($progress);
  const review = useStore($review);
  const notebook = useStore($notebook);
  const fileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [showKey, setShowKey] = useState(false);

  // The browser's German voices, best first. Browsers report them late, so the list is read again when it changes.
  const listVoices = () => rankGermanVoices(window.speechSynthesis?.getVoices() ?? []);
  const [voices, setVoices] = useState(listVoices);
  useEffect(() => {
    const update = () => setVoices(listVoices());
    window.speechSynthesis?.addEventListener('voiceschanged', update);
    return () => window.speechSynthesis?.removeEventListener('voiceschanged', update);
  }, []);
  const voice = germanAvailable();

  // The page renders after the browser has tried to jump to "#learning", so do the jump again.
  useEffect(() => {
    if (window.location.hash) document.querySelector(window.location.hash)?.scrollIntoView();
  }, []);

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
      <Section title="Learning" id="learning">
        <label className="grid gap-2">
          <span className="text-sm font-semibold">Level</span>
          <select
            className="field max-w-sm"
            value={settings.level ?? ''}
            onChange={(event) => updateSettings({ level: event.target.value || undefined })}
          >
            <option value="">Follow what I studied last</option>
            {levels.map((level) => (
              <option key={level.id} value={level.id}>
                {level.title} {level.name}
              </option>
            ))}
          </select>
          <span className="text-sm text-muted">
            Decides which chapter and which missions the Today page suggests. Every level stays open whatever you choose.
          </span>
        </label>
        <fieldset className="grid gap-2">
          <legend className="text-sm font-semibold">Daily goal</legend>
          <div role="radiogroup" aria-label="Daily goal" className="mt-2 flex flex-wrap gap-2">
            {[...DAILY_GOALS, { xp: 0, label: 'Paused', detail: 'no goal' }].map((option) => (
              <button
                key={option.xp}
                type="button"
                role="radio"
                aria-checked={settings.dailyGoal === option.xp}
                className={`btn h-auto flex-col items-start gap-0 py-2 ${settings.dailyGoal === option.xp ? 'btn-primary' : ''}`}
                onClick={() => updateSettings({ dailyGoal: option.xp })}
              >
                <span>{option.label}</span>
                <span className="text-xs font-normal opacity-75">
                  {option.xp > 0 ? `${option.xp} points, ${option.detail}` : option.detail}
                </span>
              </button>
            ))}
          </div>
          <span className="text-sm text-muted">
            A first-time solve is worth {XP.firstTry} points, a reviewed card up to {XP.review.good}. Pausing keeps your points and
            your streak count; it only removes the target.
          </span>
        </fieldset>
      </Section>

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

      <Section title="Spoken German" id="audio">
        <p className="text-sm text-muted">
          Audio is spoken by a voice built into your browser, so how good it sounds depends on the browser.
        </p>
        {voice === false ? (
          <div className="rounded-xl bg-accent-soft px-4 py-3 text-sm">
            <p className="font-semibold">This browser has no German voice.</p>
            <p className="mt-1">
              Listening is switched off here, because an English voice reading German teaches the wrong sounds. Two ways to
              get it back:
            </p>
            <ul className="mt-1 list-disc pl-5">
              <li>
                Open this site in Microsoft Edge or Google Chrome. Both bring a German voice with them. If you are already
                in one of them, reload the page: the voice sometimes arrives late.
              </li>
              <li>
                Or add German to this device: on Windows, Settings, then Time &amp; language, then Speech, then Add voices.
                Restart the browser afterwards.
              </li>
            </ul>
          </div>
        ) : (
          <label className="grid gap-2">
            <span className="text-sm font-semibold">Voice</span>
            <select
              className="field max-w-xl"
              value={voices.some((candidate) => candidate.name === settings.voice) ? settings.voice : ''}
              onChange={(event) => {
                updateSettings({ voice: event.target.value || undefined });
                speak(SAMPLE, settings.speechRate);
              }}
            >
              <option value="">Automatic: {voices[0]?.name ?? 'the browser’s German voice'}</option>
              {voices.map((candidate) => (
                <option key={candidate.name} value={candidate.name}>
                  {candidate.name}
                </option>
              ))}
            </select>
            <span className="text-sm text-muted">
              Choosing one plays a sample. Voices marked Natural sound most like a person. One marked Multilingual or
              Mehrsprachig guesses the language of each phrase and often gets short German wrong.
            </span>
          </label>
        )}
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
          onClick={() => speak(SAMPLE, settings.speechRate)}
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

function Section({ title, id, children }: { title: string; id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="card grid scroll-mt-24 gap-4 p-5">
      <h2 className="text-2xl">{title}</h2>
      {children}
    </section>
  );
}
