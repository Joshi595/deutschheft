import { useStore } from '@nanostores/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { compareSpoken, hear, hearingMode, suggestedGrade, type Hearing, type HearingMode, type SpokenMatch } from '../../lib/hearing';
import type { SpokenGrade } from '../../lib/speaking/logic';
import { speak } from '../../lib/speech';
import { $settings } from '../../lib/stores';
import { url } from '../../lib/url';
import { useRecording } from '../exercises/useRecording';

interface Props {
  /** Names the recording, so going back to a turn finds it again. */
  id: string;
  /** What to say, in the learner's own language or as an instruction. */
  cue: ReactNode;
  /** The German to say. */
  text: string;
  en?: string;
  /** Show the German before speaking (reading aloud) or only afterwards (recall). */
  show: boolean;
  /** Which recorded voice models the line: 0 the main voice, 1 the second. */
  voice?: number;
  /**
   * Rated turns end with "Not yet / Almost / Got it" and pass the grade on.
   * Unrated turns are practice and end with "Continue".
   */
  rated: boolean;
  onDone: (grade?: SpokenGrade) => void;
  doneLabel?: string;
}

const GRADES: { grade: SpokenGrade; label: string; hint: string }[] = [
  { grade: 'again', label: 'Not yet', hint: 'Could not say it' },
  { grade: 'hard', label: 'Almost', hint: 'With a slip or a long pause' },
  { grade: 'good', label: 'Got it', hint: 'Said it right' },
];

let mode: Promise<HearingMode> | undefined;

/** Where this browser would recognise German speech; `undefined` until known. */
export function useHearingMode(): HearingMode | undefined {
  const [value, setValue] = useState<HearingMode>();
  useEffect(() => {
    void (mode ??= hearingMode()).then(setValue);
  }, []);
  return value;
}

/** A small round button that says a German text. */
export function Say({ text, voice = 0, slow = false }: { text: string; voice?: number; slow?: boolean }) {
  const rate = useStore($settings).speechRate;
  return (
    <button
      type="button"
      className="speak"
      data-clip
      onClick={() => speak(text, slow ? rate * 0.7 : rate, voice)}
      aria-label={`${slow ? 'Listen slowly' : 'Listen'}: ${text}`}
      title={slow ? 'Listen slowly' : 'Listen'}
    >
      {slow ? (
        <span className="text-xs font-bold" aria-hidden="true">½×</span>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M11 5 6 9H3v6h3l5 4z" />
          <path d="M15.5 8.5a5 5 0 0 1 0 7" />
          <path d="M18.5 5.5a9 9 0 0 1 0 13" />
        </svg>
      )}
    </button>
  );
}

/**
 * One thing said aloud: the cue, the learner speaks (recorded if they like),
 * then the model is shown and heard next to their own recording, and they rate
 * themselves. With "what it heard" switched on, the browser's transcript is
 * shown too and suggests a rating. Works without a microphone: "I said it".
 */
export function SpeakTurn({ id, cue, text, en, show, voice = 0, rated, onDone, doneLabel = 'Continue' }: Props) {
  const settings = useStore($settings);
  const recording = useRecording(id);
  const where = useHearingMode();
  const hearing = useRef<Hearing | null>(null);
  const [said, setSaid] = useState(false);
  const [heard, setHeard] = useState<{ text: string; match: SpokenMatch } | { problem: string } | null>(null);

  const checks = settings.speechCheck === true && where !== undefined && where !== 'none';
  const suggested = heard && 'match' in heard ? suggestedGrade(heard.match) : undefined;

  async function begin() {
    setHeard(null);
    const started = await recording.start();
    if (started && checks) hearing.current = hear(where === 'device');
  }

  async function finish() {
    recording.stop();
    const listener = hearing.current;
    hearing.current = null;
    setSaid(true);
    speak(text, settings.speechRate, voice);
    if (!listener) return;
    listener.stop();
    try {
      const transcript = await listener.result;
      setHeard({ text: transcript, match: compareSpoken(text, transcript) });
    } catch (error) {
      setHeard({ problem: error instanceof Error ? error.message : 'Speech recognition failed.' });
    }
  }

  // Stop listening if the learner leaves in the middle of a turn.
  useEffect(() => () => hearing.current?.stop(), []);

  // 1, 2 and 3 rate the attempt once it has been made.
  useEffect(() => {
    if (!said || !rated) return;
    function onKey(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if ((event.target as HTMLElement).closest('input, textarea, select')) return;
      const choice = GRADES[Number(event.key) - 1];
      if (choice) onDone(choice.grade);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [said, rated, onDone]);

  return (
    <div className="card p-5 sm:p-7">
      <p className="eyebrow">{said ? 'Now compare with the model' : show ? 'Read it aloud' : 'Say it in German'}</p>
      <div className="mt-2 text-xl">{cue}</div>

      {(show || said) && (
        <div className={`mt-4 flex items-start gap-2 ${said ? 'rise' : ''}`}>
          <p className="de font-display flex-1 text-2xl sm:text-3xl" lang="de">
            {heard && 'match' in heard
              ? heard.match.words.map((word, index) => (
                  <span key={index} className={word.heard ? '' : 'underline decoration-bad decoration-2 underline-offset-4'}>
                    {word.text}{' '}
                  </span>
                ))
              : text}
          </p>
          <Say text={text} voice={voice} />
          <Say text={text} voice={voice} slow />
        </div>
      )}
      {said && en && <p className="mt-1 text-muted">{en}</p>}

      {!said && (
        <div className="mt-6 grid gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {recording.recording ? (
              <button type="button" className="btn btn-accent btn-lg" onClick={finish} autoFocus>
                Stop
              </button>
            ) : (
              <button type="button" className="btn btn-accent btn-lg" onClick={begin} autoFocus>
                Speak
              </button>
            )}
            {recording.recording ? (
              <span className="text-sm text-bad" aria-live="polite">Recording … speak now</span>
            ) : (
              <button type="button" className="btn btn-quiet" onClick={finish}>
                I said it
              </button>
            )}
          </div>
          <p className="text-sm text-muted">
            {recording.failed
              ? 'The microphone is not available. Say it aloud anyway and press “I said it”.'
              : 'Speak records you so you can hear yourself next to the model. Without a microphone, say it aloud and press “I said it”.'}
          </p>
        </div>
      )}

      {said && (
        <div className="mt-5 grid gap-4">
          {recording.url && (
            <div>
              <p className="text-sm font-semibold">Your recording</p>
              <audio controls src={recording.url} className="mt-1 w-full max-w-md" aria-label="Your recording" />
            </div>
          )}

          {heard && 'match' in heard && (
            <div className="rounded-xl bg-surface-2 px-4 py-3 text-sm" aria-live="polite">
              <p>
                <span className="text-muted">What the browser heard: </span>
                <span className="de" lang="de">{heard.text || 'nothing it could make out'}</span>
              </p>
              <p className="mt-1 text-muted">
                {heard.match.matched} of {heard.match.total} words found
                {heard.match.matched < heard.match.total && '; the others are underlined above'}. A machine’s ear, so treat it as a hint.
              </p>
            </div>
          )}
          {heard && 'problem' in heard && <p className="text-sm text-muted">{heard.problem}</p>}
          {!heard && checks && recording.url && <p className="text-sm text-muted" aria-live="polite">Listening to what you said …</p>}

          {rated ? (
            <div>
              <p className="text-sm text-muted">Compare with the model. How did it go?</p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {GRADES.map(({ grade, label, hint }, index) => (
                  <button
                    key={grade}
                    type="button"
                    className={`btn h-auto flex-col gap-0 py-2 ${grade === suggested ? 'border-ink bg-accent-soft' : ''}`}
                    onClick={() => onDone(grade)}
                  >
                    <span>{label}</span>
                    <span className="text-xs font-normal text-muted">
                      {hint} · {index + 1}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <button type="button" className="btn btn-accent justify-self-start" onClick={() => onDone()} autoFocus>
              {doneLabel}
            </button>
          )}

          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <button type="button" className="text-muted underline underline-offset-4 hover:text-ink" onClick={() => { setSaid(false); setHeard(null); }}>
              Say it again
            </button>
            {!checks && where !== undefined && where !== 'none' && (
              <a href={`${url('settings/')}#speaking`} className="text-muted underline underline-offset-4 hover:text-ink">
                Let the browser write down what it hears
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
