import { useStore } from '@nanostores/react';
import { useEffect, useMemo, useState } from 'react';
import type { ClientConversation, TalkLine } from '../../lib/content/types';
import { TALK_HELP, type SpokenGrade, type TalkHelp } from '../../lib/speaking/logic';
import { speakLines, stopSpeaking } from '../../lib/speech';
import { $settings, $speaking, rateSpokenCard, saveTalk } from '../../lib/stores';
import { SessionBar, useStepFocus } from '../session/Session';
import { Say, SpeakTurn } from './SpeakTurn';

interface Props {
  talk: ClientConversation;
  listHref: string;
}

type Stage = { name: 'intro' } | { name: 'play'; help: TalkHelp; swapped: boolean; turn: number; grades: SpokenGrade[] } | { name: 'done'; help: TalkHelp; swapped: boolean; grades: SpokenGrade[] };

const HELP: { id: TalkHelp; label: string; detail: string }[] = [
  { id: 'read', label: 'Read', detail: 'Your lines are shown. Read them aloud.' },
  { id: 'prompted', label: 'Prompted', detail: 'You only get a cue for each line.' },
  { id: 'memory', label: 'From memory', detail: 'Only the other person’s lines. The cue is hidden until you ask.' },
];

/** The recorded voices: the partner speaks in the main one, the learner's lines are modelled in the second. */
const PARTNER = 0;
const MINE = 1;

function Bubble({ line, voice }: { line: TalkLine; voice: number }) {
  const mine = line.who === 'you';
  return (
    <li className={`bubble rise ${mine ? 'bubble-you' : ''}`}>
      <span className="block text-xs font-semibold text-muted">{line.speaker}</span>
      <span className="flex items-start gap-1">
        <span className="de text-lg" lang="de">{line.text}</span>
        <Say text={line.text} voice={voice} />
      </span>
      {line.en && <span className="block text-sm text-muted">{line.en}</span>}
    </li>
  );
}

/**
 * A conversation to speak through. The app says the other person's lines; the
 * learner says theirs with as much help as they chose. Lines said from a cue
 * or from memory are rated and join the sentence deck; reading aloud is not.
 */
export default function ConversationRunner({ talk, listHref }: Props) {
  const settings = useStore($settings);
  const reached = useStore($speaking).talks[talk.id] ?? 0;
  const [stage, setStage] = useState<Stage>({ name: 'intro' });
  const [hinted, setHinted] = useState(false);

  const swapped = stage.name !== 'intro' && stage.swapped;
  // With roles swapped the learner speaks the other part, cued by its English.
  const lines = useMemo<TalkLine[]>(
    () =>
      swapped
        ? talk.lines.map((line) =>
            line.who === 'partner'
              ? { ...line, who: 'you', speaker: 'You', cue: line.en ?? 'Say what the other person says here.', ref: undefined }
              : { ...line, who: 'partner', speaker: 'The other person' },
          )
        : talk.lines,
    [talk, swapped],
  );
  const mine = useMemo(() => lines.flatMap((line, index) => (line.who === 'you' ? [index] : [])), [lines]);

  const turn = stage.name === 'play' ? stage.turn : -1;
  const stepRef = useStepFocus(turn);
  const partnerVoice = swapped ? MINE : PARTNER;
  const myVoice = swapped ? PARTNER : MINE;

  useEffect(() => () => stopSpeaking(), []);

  // When a turn begins, the partner says everything up to the learner's next line.
  useEffect(() => {
    if (turn < 0) return;
    const from = turn === 0 ? 0 : mine[turn - 1]! + 1;
    const to = turn < mine.length ? mine[turn]! : lines.length;
    speakLines(lines.slice(from, to), settings.speechRate, undefined, partnerVoice);
    setHinted(false);
    // Only a new turn should speak, not a change of speed in the middle of one.
  }, [turn, lines]);

  function begin(help: TalkHelp, swap: boolean) {
    setStage({ name: 'play', help, swapped: swap, turn: 0, grades: [] });
  }

  // --- Before -----------------------------------------------------------------

  if (stage.name === 'intro') {
    const next = HELP[Math.min(reached, HELP.length - 1)]!;
    return (
      <div className="grid gap-6">
        <div className="page p-5 pt-7 sm:p-8 sm:pt-10">
          <p className="text-lg">{talk.scene}</p>
          <p className="mt-2 text-muted">
            You speak with: <span lang="de" className="font-semibold text-ink">{talk.partner}</span>. {mine.length || talk.lines.filter((line) => line.who === 'you').length} lines are yours.
          </p>
          <fieldset className="mt-6">
            <legend className="font-semibold">How much help do you want?</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {HELP.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`card flex flex-col gap-1 p-4 text-left transition-colors hover:border-ink ${option.id === next.id ? 'border-ink bg-accent-soft' : ''}`}
                  onClick={() => begin(option.id, false)}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-display text-xl font-semibold">{option.label}</span>
                    {reached >= TALK_HELP[option.id] && <span className="chip chip-good">Done</span>}
                  </span>
                  <span className="text-sm text-muted">{option.detail}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <p className="mt-4 text-sm text-muted">
            The highlighted one is the next step for you. Lines you say from a cue or from memory come back later under Sentences.
          </p>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {talk.missionHref && (
            <a href={talk.missionHref} className="text-muted underline underline-offset-4 hover:text-ink">
              Learn this situation first, as a guided mission
            </a>
          )}
          {reached > 0 && (
            <button type="button" className="text-muted underline underline-offset-4 hover:text-ink" onClick={() => begin('prompted', true)}>
              Swap roles: speak the other person’s part
            </button>
          )}
        </div>
      </div>
    );
  }

  // --- After ------------------------------------------------------------------

  if (stage.name === 'done') {
    const harder = HELP[TALK_HELP[stage.help]];
    const good = stage.grades.filter((grade) => grade === 'good').length;
    return (
      <div className="grid gap-6">
        <div className="page rise p-5 pt-7 sm:p-8 sm:pt-10" aria-live="polite">
          <p className="eyebrow" lang="de">Geschafft!</p>
          <h2 className="mt-1 text-3xl">Conversation spoken</h2>
          <p className="mt-2 text-muted">
            {stage.grades.length > 0
              ? `${good} of ${stage.grades.length} lines went right. They are in your sentence deck now and will come back.`
              : stage.swapped
                ? 'You spoke the other person’s part. That is practice only; nothing was scheduled.'
                : 'You read your lines aloud. Next, say them with only a cue to go on.'}
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {!stage.swapped && harder && (
              <button type="button" className="btn btn-accent" onClick={() => begin(harder.id, false)} autoFocus>
                Again with less help: {harder.label}
              </button>
            )}
            {!stage.swapped && (
              <button type="button" className="btn" onClick={() => begin('prompted', true)}>
                Swap roles
              </button>
            )}
            <a href={listHref} className="btn">
              All conversations
            </a>
          </div>
        </div>
        <section aria-labelledby="whole">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 id="whole" className="text-xl">The whole conversation</h3>
            <button type="button" className="listen btn btn-small" data-clip onClick={() => speakLines(talk.lines, settings.speechRate)}>
              Play it through
            </button>
          </div>
          <ol className="mt-3 grid gap-2">
            {talk.lines.map((line, index) => (
              <Bubble key={index} line={line} voice={line.who === 'you' ? MINE : PARTNER} />
            ))}
          </ol>
        </section>
      </div>
    );
  }

  // --- During -----------------------------------------------------------------

  const finished = stage.turn >= mine.length;
  const visible = lines.slice(0, finished ? lines.length : mine[stage.turn]!);
  const shown = visible.slice(-3);
  const line = finished ? undefined : lines[mine[stage.turn]!]!;
  const rated = stage.help !== 'read' && !stage.swapped;

  const advance = (grade?: SpokenGrade) => {
    if (line?.ref && grade) rateSpokenCard(line.ref, grade);
    setStage({ ...stage, turn: stage.turn + 1, grades: grade ? [...stage.grades, grade] : stage.grades });
  };
  const finish = () => {
    stopSpeaking();
    if (!stage.swapped) saveTalk(talk.id, stage.help);
    setStage({ name: 'done', help: stage.help, swapped: stage.swapped, grades: stage.grades });
  };

  return (
    <div className="grid gap-5">
      <SessionBar position={stage.turn} total={mine.length} label="Your lines" onExit={() => setStage({ name: 'intro' })} />

      {visible.length > 0 && (
        <ol className="grid gap-2" aria-label="Conversation" aria-live="polite">
          {visible.length > shown.length && <li className="text-sm text-muted">{visible.length - shown.length} earlier lines</li>}
          {shown.map((item, index) => (
            <Bubble key={`${stage.turn}-${visible.length - shown.length + index}`} line={item} voice={item.who === 'you' ? myVoice : partnerVoice} />
          ))}
        </ol>
      )}

      <div key={stage.turn} ref={stepRef} tabIndex={-1} role="group" aria-label={`Your line ${Math.min(stage.turn + 1, mine.length)} of ${mine.length}`} className="rise outline-none">
        {line ? (
          <SpeakTurn
            id={`${talk.id}-${stage.swapped ? 's' : ''}${mine[stage.turn]}`}
            cue={
              stage.help === 'memory' && !hinted ? (
                <span>
                  Your turn.{' '}
                  <button type="button" className="text-base text-muted underline underline-offset-4 hover:text-ink" onClick={() => setHinted(true)}>
                    Show the cue
                  </button>
                </span>
              ) : (
                line.cue
              )
            }
            text={line.text}
            en={line.en}
            show={stage.help === 'read'}
            voice={myVoice}
            rated={rated}
            onDone={advance}
          />
        ) : (
          <button type="button" className="btn btn-accent btn-lg" onClick={finish} autoFocus>
            Finish the conversation
          </button>
        )}
      </div>
    </div>
  );
}
