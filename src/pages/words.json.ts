import type { APIRoute } from 'astro';
import { getCatalog } from '../lib/content/catalog';
import type { CourseWord } from '../lib/translate';

// Every course word with its chapter, for the translate panel. Fetched the
// first time the panel opens; the offline cache keeps it after that.
export const GET: APIRoute = async () => {
  const words: CourseWord[] = (await getCatalog()).lessons.flatMap((lesson) =>
    lesson.vocab.map(({ de, en, article, plural, pos }) => ({
      de,
      en,
      article,
      plural,
      pos,
      lesson: `${lesson.level.toUpperCase()} · ${lesson.title}`,
      href: lesson.href,
    })),
  );
  return new Response(JSON.stringify(words), { headers: { 'Content-Type': 'application/json' } });
};
