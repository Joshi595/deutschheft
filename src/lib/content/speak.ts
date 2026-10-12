import type { BankPhrase } from '../speaking/logic';
import type { Conversation, Pack } from './schema';
import type { ClientConversation, ClientMission, ClientVocabItem, TalkLine } from './types';

/**
 * Builds what the Speak section practises from content that already exists.
 * Pure functions over plain data, so the tests can run them on the content files.
 */

/** A conversation as written in content/speaking/conversations. */
export function authoredTalk(id: string, data: Conversation, href: string): ClientConversation {
  const { lines, order: _order, ...rest } = data;
  return {
    ...rest,
    id,
    href,
    lines: lines.map((line): TalkLine =>
      line.who === 'you'
        ? { who: 'you', speaker: 'You', text: line.text, en: line.en, cue: line.cue, ref: `talk.${id}.${line.id}` }
        : { who: 'partner', speaker: data.partner, text: line.text, en: line.en },
    ),
  };
}

/**
 * A mission as a conversation to speak through: what the other person says in
 * each step (including what the learner only hears in a listening task), then
 * the learner's own line, with the task's instruction as the cue.
 */
export function missionToTalk(mission: ClientMission, href: string): ClientConversation {
  const partner = mission.steps.flatMap((step) => step.lines)[0]?.speaker ?? 'Partner';
  const lines: TalkLine[] = [];
  const said = new Set<string>();
  const hear = (speaker: string, text: string, en?: string) => {
    // Two listening tasks on the same recording would otherwise repeat the line.
    if (said.has(text)) return;
    said.add(text);
    lines.push({ who: 'partner', speaker, text, en });
  };

  for (const step of mission.steps) {
    for (const line of step.lines) hear(line.speaker, line.text, line.en);
    const { task } = step;
    if (task.stimulus?.kind === 'audio') {
      for (const line of task.stimulus.lines) hear(line.speaker ?? partner, line.text);
    }
    // A free speaking task has no fixed line; its model answer stands in for one.
    const mine = step.you ?? (task.type === 'speaking-task' ? { text: task.sample, en: undefined } : undefined);
    if (mine) {
      lines.push({
        who: 'you',
        speaker: 'You',
        text: mine.text,
        en: mine.en,
        cue: (task.prompt ?? '').replace(/\s*Listen first, then say it aloud\.?/, ''),
        ref: `talk.${mission.id}.${task.id.split('.').pop()}`,
      });
    }
  }
  for (const line of mission.outro) hear(line.speaker, line.text, line.en);

  const { id, title, titleDe, level, icon, scene } = mission;
  return { id, href, title, titleDe, level, icon, scene, partner, lines, missionHref: mission.href };
}

export interface BankSources {
  packs: readonly (Pack & { id: string })[];
  talks: readonly ClientConversation[];
  /** Chapters in course order, with their vocabulary. */
  lessons: readonly { key: string; level: string; title: string; vocab: readonly ClientVocabItem[] }[];
}

/** Every sentence that can be practised aloud, each with a stable id. */
export function speakBank({ packs, talks, lessons }: BankSources): BankPhrase[] {
  return [
    ...talks.flatMap((talk) =>
      talk.lines
        .filter((line) => line.who === 'you')
        .map((line) => ({ id: line.ref!, de: line.text, en: line.en ?? '', cue: line.cue, level: talk.level, group: `talk:${talk.id}`, source: talk.titleDe })),
    ),
    ...packs.flatMap((pack) =>
      pack.phrases.map((phrase) => ({
        id: `pack.${pack.id}.${phrase.id}`,
        de: phrase.de,
        en: phrase.en,
        cue: phrase.cue,
        level: pack.level,
        group: `pack:${pack.id}`,
        source: pack.title,
      })),
    ),
    ...lessons.flatMap((lesson) =>
      lesson.vocab
        .filter((item) => item.example && item.exampleEn)
        .map((item) => ({ id: `ex.${item.id}`, de: item.example!, en: item.exampleEn!, level: lesson.level, group: lesson.key, source: lesson.title })),
    ),
  ];
}
