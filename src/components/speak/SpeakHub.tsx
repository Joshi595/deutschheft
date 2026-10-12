import { useStore } from '@nanostores/react';
import { readCourse } from '../../lib/content/course';
import { currentLevel } from '../../lib/progress/coach';
import { EAR_PASS, sentencesKnown, speakNext, spokenDue, TALK_HELP } from '../../lib/speaking/logic';
import { $progress, $quizzes, $review, $settings, $speaking } from '../../lib/stores';

interface Props {
  talks: { id: string; level: string; titleDe: string; href: string }[];
  sounds: { id: string; title: string; href: string }[];
  /** Levels that have exam speaking tasks. */
  exams: { id: string; title: string; href: string }[];
  hrefs: { sounds: string; sentences: string; conversations: string };
}

/** The Speak page: one recommended next step, then the four ways to practise with where the learner stands in each. */
export default function SpeakHub({ talks, sounds, exams, hrefs }: Props) {
  const speaking = useStore($speaking);
  const progress = useStore($progress);
  const settings = useStore($settings);
  const course = readCourse();
  const level = currentLevel(course, { progress, review: $review.get(), quizzes: $quizzes.get(), level: settings.level });
  const levelId = level?.id ?? exams[0]?.id ?? '';
  const now = new Date();

  const step = speakNext({
    state: speaking,
    now,
    level: levelId,
    conversations: talks,
    sounds,
    sentencesHref: hrefs.sentences,
    examHref: (exams.find((exam) => exam.id === levelId) ?? exams[0])?.href ?? hrefs.sentences,
  });

  const due = spokenDue(speaking, now).length;
  const deck = Object.keys(speaking.cards).length;
  const passed = sounds.filter((sound) => (speaking.ears[sound.id] ?? 0) >= EAR_PASS).length;
  const spoken = talks.filter((talk) => (speaking.talks[talk.id] ?? 0) >= TALK_HELP.prompted).length;

  const doors = [
    {
      href: hrefs.sounds,
      title: 'Sounds',
      de: 'Aussprache',
      what: 'The sounds English does not have. Hear the difference, then say the words.',
      status: `${passed} of ${sounds.length} passed by ear`,
    },
    {
      href: hrefs.sentences,
      title: 'Sentences',
      de: 'Sätze',
      what: 'A cue, you say the German, then you hear the model. They come back until they are automatic.',
      status: deck === 0 ? 'Not started' : `${deck} in rotation, ${sentencesKnown(speaking)} reliable${due > 0 ? `, ${due} due` : ''}`,
    },
    {
      href: hrefs.conversations,
      title: 'Conversations',
      de: 'Gespräche',
      what: 'The app speaks the other person, you speak your part: read, prompted, then from memory.',
      status: `${spoken} of ${talks.length} spoken without the text`,
    },
  ];

  return (
    <div className="grid gap-8">
      <section className="page flex flex-col gap-6 p-5 pl-9 sm:p-8 sm:pl-12" aria-labelledby="speak-next">
        <div>
          <p className="eyebrow">Next up</p>
          <h2 id="speak-next" className="mt-1 text-3xl sm:text-4xl" lang={step.kind === 'conversation' ? 'de' : undefined}>
            {step.title}
          </h2>
          <p className="mt-2 text-muted">{step.reason}</p>
        </div>
        <a href={step.href} className="btn btn-accent btn-lg self-start">
          {step.action}
        </a>
      </section>

      <ul className="card divide-y divide-line">
        {doors.map((door) => (
          <li key={door.title}>
            <a href={door.href} className="flex flex-wrap items-center gap-x-6 gap-y-1 p-5 transition-colors hover:bg-surface-2">
              <span className="min-w-0 flex-1 basis-72">
                <span className="flex flex-wrap items-baseline gap-x-3">
                  <span className="font-display text-2xl font-semibold">{door.title}</span>
                  <span className="eyebrow" lang="de">{door.de}</span>
                </span>
                <span className="mt-1 block text-muted">{door.what}</span>
              </span>
              <span className="text-sm text-muted tabular-nums">{door.status}</span>
            </a>
          </li>
        ))}
        <li className="flex flex-wrap items-center gap-x-6 gap-y-3 p-5">
          <span className="min-w-0 flex-1 basis-72">
            <span className="flex flex-wrap items-baseline gap-x-3">
              <span className="font-display text-2xl font-semibold">Exam speaking</span>
              <span className="eyebrow" lang="de">Prüfung</span>
            </span>
            <span className="mt-1 block text-muted">Every speaking task of the course against the clock, with a model answer and a checklist.</span>
          </span>
          <span className="flex flex-wrap gap-2">
            {exams.map((exam) => (
              <a key={exam.id} href={exam.href} className={`btn btn-small ${exam.id === levelId ? 'border-ink' : ''}`}>
                {exam.title}
              </a>
            ))}
          </span>
        </li>
      </ul>
    </div>
  );
}
