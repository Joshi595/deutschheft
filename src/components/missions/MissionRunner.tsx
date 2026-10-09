import { useStore } from '@nanostores/react';
import { useEffect, useRef, useState } from 'react';
import { MISSION_ICONS } from '../../lib/content/icons';
import type { ClientMission, DialogueLine } from '../../lib/content/types';
import { completion } from '../../lib/progress/logic';
import { speak, speakLines, stopSpeaking } from '../../lib/speech';
import { $notebook, $progress, $settings, saveWord } from '../../lib/stores';
import { ExerciseCard } from '../exercises/ExerciseCard';
import { SessionBar, SessionSummary, useSessionLog } from '../session/Session';

interface Props {
  mission: ClientMission;
  /** The mission to offer afterwards, if there is one. */
  next?: { href: string; title: string };
  listHref: string;
}

type Stage = { name: 'intro' } | { name: 'play'; step: number; finished: boolean } | { name: 'summary' };

/** The learner's own lines, in the voice of a second speaker. */
const YOU = 'Du';

function Bubble({ line, showEnglish, rate }: { line: DialogueLine; showEnglish: boolean; rate: number }) {
  const mine = line.speaker === YOU;
  return (
    <li className={`bubble rise ${mine ? 'bubble-you' : ''}`}>
      <span className="block text-xs font-semibold text-muted">{mine ? 'You' : line.speaker}</span>
      <span className="flex items-start gap-1">
        <span className="de text-lg" lang="de">{line.text}</span>
        <button type="button" className="speak -my-0.5" onClick={() => speak(line.text, rate)} aria-label={`Listen: ${line.text}`} title="Listen">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M11 5 6 9H3v6h3l5 4z" />
            <path d="M15.5 8.5a5 5 0 0 1 0 7" />
          </svg>
        </button>
      </span>
      {showEnglish && line.en && <span className="block text-sm text-muted">{line.en}</span>}
    </li>
  );
}

/** One everyday situation, played through as a conversation: they speak, you do a task, it goes on. */
export default function MissionRunner({ mission, next, listHref }: Props) {
  const progress = useStore($progress);
  const settings = useStore($settings);
  const notebook = useStore($notebook);
  const [stage, setStage] = useState<Stage>({ name: 'intro' });
  // Beginners see the English under each line from the start; everyone can switch it.
  const [showEnglish, setShowEnglish] = useState(mission.level === 'a1');
  const log = useSessionLog();
  const taskRef = useRef<HTMLDivElement>(null);

  const state = completion(progress, mission.taskIds);
  const stepIndex = stage.name === 'play' ? stage.step : -1;

  // Stop the voice when the learner leaves mid-sentence.
  useEffect(() => () => stopSpeaking(), []);

  // Each new step is read out, brought into view, and given keyboard focus.
  // Only a change of step triggers this, not a change of speed mid-step.
  useEffect(() => {
    if (stepIndex < 0) return;
    speakLines(mission.steps[stepIndex]!.lines, settings.speechRate);
    taskRef.current?.focus({ preventScroll: true });
    taskRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [stepIndex]);

  /** Everything said up to and including step `upTo`; the learner's line only once the task is done. */
  function conversation(upTo: number, includeLast: boolean): DialogueLine[] {
    return mission.steps.slice(0, upTo + 1).flatMap((step, index) => [
      ...step.lines,
      ...(step.you && (index < upTo || includeLast) ? [{ speaker: YOU, ...step.you }] : []),
    ]);
  }

  function begin() {
    log.reset();
    setStage({ name: 'play', step: 0, finished: false });
  }

  // --- Before ---------------------------------------------------------------

  if (stage.name === 'intro') {
    return (
      <div className="grid gap-6">
        <div className="page p-5 pl-9 sm:p-8 sm:pl-12">
          <div className="flex items-start gap-4">
            <span className="grid size-16 flex-none place-items-center rounded-2xl bg-accent-soft">
              <svg width="40" height="40" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={MISSION_ICONS[mission.icon]} />
              </svg>
            </span>
            <div>
              <p className="eyebrow">Your goal</p>
              <p className="text-xl font-semibold">{mission.objective}</p>
            </div>
          </div>
          <p className="mt-5 text-lg">{mission.scene}</p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-accent btn-lg" onClick={begin}>
              {state.complete ? 'Play it again' : state.done > 0 ? 'Start over' : 'Start mission'}
            </button>
            <span className="text-sm text-muted">
              {mission.steps.length} steps, about {mission.minutes} min
              {state.complete ? '. Completed.' : state.done > 0 ? `. ${state.done} of ${state.total} tasks solved so far.` : ''}
            </span>
          </div>
        </div>

        {mission.lessons.length > 0 && (
          <p className="text-sm text-muted">
            Draws on{' '}
            {mission.lessons.map((lesson, index) => (
              <span key={lesson.href}>
                {index > 0 && (index === mission.lessons.length - 1 ? ' and ' : ', ')}
                <a href={lesson.href} className="underline underline-offset-4 hover:text-ink">{lesson.title}</a>
              </span>
            ))}
            . You can start without them; every task explains itself.
          </p>
        )}
      </div>
    );
  }

  // --- After ----------------------------------------------------------------

  if (stage.name === 'summary') {
    const all = [...conversation(mission.steps.length - 1, true), ...mission.outro];
    const missed = log.results.filter((result) => !result.correct).length;
    const saved = new Set(notebook.words.map((word) => word.de));
    const unsaved = mission.phrases.filter((phrase) => !saved.has(phrase.de));

    return (
      <div className="grid gap-6">
        <SessionSummary
          remark={missed === 0 ? 'Mission geschafft!' : 'Fast geschafft!'}
          heading={missed === 0 ? 'Mission complete' : 'You got through it'}
          results={log.results}
          points={log.points()}
          actions={
            <>
              {missed > 0 && (
                <button type="button" className="btn btn-accent" onClick={begin}>
                  Try the mission again
                </button>
              )}
              {missed === 0 && next && (
                <a href={next.href} className="btn btn-accent">
                  Next mission: {next.title}
                </a>
              )}
              <a href={listHref} className="btn">
                All missions
              </a>
            </>
          }
        >
          <p className="font-semibold">What you practised</p>
          <ul className="mt-1 grid gap-1">
            {mission.practised.map((point) => (
              <li key={point} className="flex gap-2">
                <span className="font-bold text-good" aria-hidden="true">✓</span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </SessionSummary>

        <section className="card p-5" aria-labelledby="phrases">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 id="phrases" className="text-xl">Phrases to keep</h3>
            <button
              type="button"
              className="btn btn-small"
              disabled={unsaved.length === 0}
              onClick={() => unsaved.forEach((phrase, index) => saveWord({ ...phrase, note: mission.title }, new Date(Date.now() + index)))}
            >
              {unsaved.length === 0 ? 'In your review deck' : `Add ${unsaved.length} to my review deck`}
            </button>
          </div>
          <ul className="mt-3 divide-y divide-line">
            {mission.phrases.map((phrase) => (
              <li key={phrase.de} className="flex items-center gap-2 py-2">
                <button type="button" className="speak" onClick={() => speak(phrase.de, settings.speechRate)} aria-label={`Listen: ${phrase.de}`} title="Listen">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M11 5 6 9H3v6h3l5 4z" />
                    <path d="M15.5 8.5a5 5 0 0 1 0 7" />
                  </svg>
                </button>
                <span>
                  <span className="de" lang="de">{phrase.de}</span>
                  <span className="block text-sm text-muted">{phrase.en}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="whole">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 id="whole" className="text-xl">The whole conversation</h3>
            <button type="button" className="listen btn btn-small" onClick={() => speakLines(all, settings.speechRate)}>
              Play it through
            </button>
          </div>
          <ol className="mt-3 grid gap-2">
            {all.map((line, index) => (
              <Bubble key={index} line={line} showEnglish rate={settings.speechRate} />
            ))}
          </ol>
        </section>
      </div>
    );
  }

  // --- During ---------------------------------------------------------------

  const step = mission.steps[stage.step]!;
  const last = stage.step + 1 === mission.steps.length;
  const lines = conversation(stage.step, stage.finished);
  // Enough of what came before to keep the thread, without pushing the task off the screen.
  const shown = lines.slice(-4);

  return (
    <div className="grid gap-5">
      <SessionBar position={stage.step} total={mission.steps.length} label="Mission progress" onExit={() => setStage({ name: 'intro' })} />

      {lines.length > 0 && (
        <div>
          <ol className="grid gap-2" aria-label="Conversation" aria-live="polite">
            {lines.length > shown.length && <li className="text-sm text-muted">{lines.length - shown.length} earlier lines</li>}
            {shown.map((line, index) => (
              <Bubble key={`${stage.step}-${lines.length - shown.length + index}`} line={line} showEnglish={showEnglish} rate={settings.speechRate} />
            ))}
          </ol>
          <button type="button" className="mt-2 text-sm text-muted underline underline-offset-4 hover:text-ink" onClick={() => setShowEnglish(!showEnglish)}>
            {showEnglish ? 'Hide the English' : 'Show the English'}
          </button>
        </div>
      )}

      <div
        ref={taskRef}
        key={step.task.id}
        tabIndex={-1}
        role="group"
        aria-label={`Step ${stage.step + 1} of ${mission.steps.length}`}
        className="rise scroll-mt-24 outline-none"
      >
        <ExerciseCard
          item={step.task}
          number={stage.step + 1}
          topic={`${mission.titleDe} (${mission.title})`}
          onFinish={(correct) => {
            log.record(step.task, correct);
            setStage({ ...stage, finished: true });
            // The learner's line joins the conversation, and is heard the way it should sound.
            if (step.you && step.task.type !== 'speaking-task') speak(step.you.text, settings.speechRate);
          }}
          onNext={() => {
            stopSpeaking();
            setStage(last ? { name: 'summary' } : { name: 'play', step: stage.step + 1, finished: false });
          }}
          nextLabel={last ? 'Finish the mission' : 'Continue'}
        />
      </div>
    </div>
  );
}
