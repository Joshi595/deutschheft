import type { satteri } from '@astrojs/markdown-satteri';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Markdown plugin for the lessons: a mention of another chapter ("from chapter 18",
 * "A1 chapter 13", "the last chapter") becomes a link to that chapter's summary,
 * the card to revise from. Only the first mention of each chapter in a lesson is
 * linked, so the prose never fills up with links.
 */

type MdastPlugin = NonNullable<NonNullable<Parameters<typeof satteri>[0]>['mdastPlugins']>[number];

const MENTION = /\b(?:(A1|A2|B1|B2) )?chapter (\d{1,2})\b|\bthe (?:last|previous) chapter\b/gi;
/** Text in these is left alone. */
const SKIP = new Set(['link', 'heading', 'code', 'inlineCode']);

const pad = (n: number) => String(n).padStart(2, '0');

/** Each chapter mention in a text, with the key of the chapter it points to (e.g. "a1.18"). */
export function chapterMentions(text: string, level: string, number: number): { key: string; index: number; text: string }[] {
  return [...text.matchAll(MENTION)].map((match) => ({
    key: match[2] ? `${(match[1] ?? level).toLowerCase()}.${pad(Number(match[2]))}` : `${level}.${pad(number - 1)}`,
    index: match.index,
    text: match[0],
  }));
}

/** The lesson a file is, from its path: src/content/lessons/a1/18-imperativ.mdx is a1, 18. */
export function lessonOf(path: string): { level: string; number: number } | undefined {
  const match = /lessons[\\/]([a-z]\d)[\\/](\d{2})-[^\\/]+\.mdx$/.exec(path);
  return match ? { level: match[1]!, number: Number(match[2]) } : undefined;
}

export default function chapterLinks({ lessonsDir, base }: { lessonsDir: string; base: string }): MdastPlugin {
  const chapters = new Map<string, { href: string; title: string }>();
  for (const level of readdirSync(lessonsDir)) {
    for (const file of readdirSync(join(lessonsDir, level))) {
      const match = /^(\d{2})-.+\.mdx$/.exec(file);
      if (!match) continue;
      const title = /^title:\s*["']?(.+?)["']?\s*$/m.exec(readFileSync(join(lessonsDir, level, file), 'utf8'))?.[1] ?? '';
      chapters.set(`${level}.${match[1]}`, { href: `${base}/${level}/${file.replace(/\.mdx$/, '')}/#summary`, title });
    }
  }

  // Called once per document, so `linked` is per lesson.
  return ({ fileURL }) => {
    const lesson = fileURL ? lessonOf(fileURLToPath(fileURL)) : undefined;
    if (!lesson) return null;
    const self = `${lesson.level}.${pad(lesson.number)}`;
    const linked = new Set<string>();

    return {
      name: 'chapter-links',
      text(node, ctx) {
        for (let up: Parameters<typeof ctx.parent>[0] | undefined = ctx.parent(node); up; up = ctx.parent(up)) if (SKIP.has(up.type)) return;
        const parts: ({ type: 'text'; value: string } | { type: 'link'; url: string; title: string; children: { type: 'text'; value: string }[] })[] = [];
        let last = 0;
        for (const mention of chapterMentions(node.value, lesson.level, lesson.number)) {
          const chapter = chapters.get(mention.key);
          if (!chapter || mention.key === self || linked.has(mention.key)) continue;
          linked.add(mention.key);
          parts.push(
            { type: 'text', value: node.value.slice(last, mention.index) },
            { type: 'link', url: chapter.href, title: `${chapter.title}: open its summary to revise`, children: [{ type: 'text', value: mention.text }] },
          );
          last = mention.index + mention.text.length;
        }
        if (parts.length === 0) return;
        parts.push({ type: 'text', value: node.value.slice(last) });
        ctx.replaceNode(node, parts);
      },
    };
  };
}
