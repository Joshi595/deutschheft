import { useStore } from '@nanostores/react';
import { useEffect, useState } from 'react';
import type { Stimulus } from '../../lib/content/schema';
import { germanAvailable, speakLines, stopSpeaking } from '../../lib/speech';
import { $settings } from '../../lib/stores';

interface Props {
  stimulus: Stimulus;
  /** Exam conditions: limited plays and no transcript. */
  exam?: boolean;
  /** After an exam: everything visible. */
  review?: boolean;
}

/** The text to read or the recording to listen to before answering. */
export function StimulusView({ stimulus, exam = false, review = false }: Props) {
  if (stimulus.kind === 'text') {
    return (
      <div className="rounded-xl border border-line bg-surface-2 p-4 sm:p-5">
        {(stimulus.label || stimulus.title) && (
          <p className="mb-2 flex flex-wrap items-baseline gap-2">
            {stimulus.label && <span className="eyebrow">{stimulus.label}</span>}
            {stimulus.title && <span className="font-semibold" lang="de">{stimulus.title}</span>}
          </p>
        )}
        <div className="grid gap-3 leading-relaxed" lang="de">
          {stimulus.text
            .trim()
            .split(/\n\s*\n/)
            .map((paragraph, index) => (
              <p key={index} className="whitespace-pre-line">{paragraph}</p>
            ))}
        </div>
      </div>
    );
  }
  return <ListeningPlayer stimulus={stimulus} exam={exam} review={review} />;
}

function ListeningPlayer({ stimulus, exam, review }: { stimulus: Extract<Stimulus, { kind: 'audio' }>; exam: boolean; review: boolean }) {
  const settings = useStore($settings);
  const [plays, setPlays] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [showText, setShowText] = useState(false);
  const voice = germanAvailable();

  // Stop the voice if the learner leaves the page or the item mid-recording.
  useEffect(() => () => stopSpeaking(), []);

  const limited = exam && !review;
  const playsLeft = Math.max(0, stimulus.plays - plays);
  const transcriptVisible = review || showText || voice === false;

  function play() {
    setPlaying(true);
    setPlays(plays + 1);
    speakLines(stimulus.lines, settings.speechRate, () => setPlaying(false));
  }

  function stop() {
    stopSpeaking();
    setPlaying(false);
  }

  return (
    <div className="rounded-xl border border-line bg-surface-2 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="eyebrow">{stimulus.label ?? 'Hörtext'}</span>
        {stimulus.title && <span className="font-semibold" lang="de">{stimulus.title}</span>}
      </div>

      {voice === false ? (
        <p className="mt-2 text-sm text-muted">
          This device has no German voice, so the recording cannot be played. Read the text instead.
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {playing ? (
            <button type="button" className="btn" onClick={stop}>
              Stop
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={play} disabled={limited && playsLeft === 0}>
              {plays === 0 ? 'Play' : 'Play again'}
            </button>
          )}
          <span className="text-sm text-muted">
            {limited
              ? `${playsLeft} of ${stimulus.plays} plays left`
              : `Played ${plays} ${plays === 1 ? 'time' : 'times'}. In the exam you hear it ${stimulus.plays === 1 ? 'once' : `${stimulus.plays} times`}.`}
          </span>
          {!limited && !review && (
            <button type="button" className="btn btn-quiet btn-small" onClick={() => setShowText(!showText)}>
              {showText ? 'Hide the text' : 'Show the text'}
            </button>
          )}
        </div>
      )}

      {transcriptVisible && (
        <div className="mt-3 grid gap-1 border-t border-line pt-3 text-sm leading-relaxed" lang="de">
          {stimulus.lines.map((line, index) => (
            <p key={index}>
              {line.speaker && <span className="font-semibold">{line.speaker}: </span>}
              {line.text}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
