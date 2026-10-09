import { useEffect, useMemo, useState } from 'react';
import { speak } from '../../lib/speech';

type Article = 'der' | 'die' | 'das';

export interface Noun {
  article: Article;
  de: string;
  en: string;
  level: string;
}

interface Props {
  /** One noun per line as "article|word|English|level"; far smaller than serialized objects. */
  data: string;
}

export function packNouns(nouns: Noun[]): string {
  return nouns.map((noun) => [noun.article, noun.de, noun.en.replace(/[|\n]/g, ' '), noun.level].join('|')).join('\n');
}

const ARTICLES: Article[] = ['der', 'die', 'das'];
const BEST_KEY = 'lg:article-best';

// Endings that usually give away the gender. A tip only shows when it agrees with the
// noun's real article, so exceptions (der Raum, das Tor) never get a misleading tip.
const ENDINGS: [RegExp, Article][] = [
  [/(ung|heit|keit|schaft|ion|tät|ik|ei)$/, 'die'],
  [/(chen|lein|ment|um)$/, 'das'],
  [/(ismus|ling|or)$/, 'der'],
];

function tipFor(noun: Noun): string | undefined {
  for (const [pattern, article] of ENDINGS) {
    const ending = noun.de.match(pattern)?.[0];
    if (ending && article === noun.article) return `Nouns ending in -${ending} are usually ${article}.`;
  }
  return undefined;
}

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

function readBest(): number {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

/** Homepage warm-up: guess the article of a noun from the course. */
export default function ArticleGame({ data }: Props) {
  const nouns = useMemo(
    () =>
      data.split('\n').map((line) => {
        const [article, de, en, level] = line.split('|') as [Article, string, string, string];
        return { article, de, en, level };
      }),
    [data],
  );
  const levels = useMemo(() => [...new Set(nouns.map((noun) => noun.level))], [nouns]);
  const [level, setLevel] = useState(levels[0] ?? '');
  const deck = useMemo(() => shuffled(nouns.filter((noun) => noun.level === level)), [nouns, level]);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<Article>();
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);

  useEffect(() => setBest(readBest()), []);

  const noun = deck[index % Math.max(deck.length, 1)];
  const answered = picked !== undefined;
  const correct = picked === noun?.article;

  function next() {
    setPicked(undefined);
    setIndex((value) => value + 1);
  }

  function answer(article: Article) {
    if (!noun || answered) return;
    setPicked(article);
    speak(`${noun.article} ${noun.de}`);
    if (article === noun.article) {
      const run = streak + 1;
      setStreak(run);
      if (run > best) {
        setBest(run);
        try {
          localStorage.setItem(BEST_KEY, String(run));
        } catch {}
      }
    } else {
      setStreak(0);
    }
  }

  // Correct answers move on by themselves; a wrong one waits so the right article can sink in.
  useEffect(() => {
    if (!answered || !correct) return;
    const timer = setTimeout(next, 1100);
    return () => clearTimeout(timer);
  }, [answered, correct]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if ((event.target as HTMLElement).closest('input, textarea, select, [contenteditable]')) return;
      const choice = ARTICLES[Number(event.key) - 1];
      if (choice && !answered) answer(choice);
      else if (answered && event.key === 'Enter') next();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!noun) return null;
  const tip = answered ? tipFor(noun) : undefined;

  return (
    <div className="card relative overflow-hidden p-5 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl" lang="de">
          Der, die oder das?
        </h2>
        <div className="flex gap-1" role="group" aria-label="Words from level">
          {levels.map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={id === level}
              className={`chip cursor-pointer ${id === level ? 'chip-accent' : 'hover:text-ink'}`}
              onClick={() => {
                setLevel(id);
                setIndex(0);
                setPicked(undefined);
              }}
            >
              {id.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div key={`${level}-${index}`} className={`py-8 text-center sm:py-10 ${answered ? (correct ? 'pop' : 'shake') : 'rise'}`}>
        <p className="font-display text-5xl font-semibold break-words sm:text-6xl" lang="de">
          <span className={`inline-block transition-all ${answered ? `gender-${noun.article} mr-3` : 'w-0 opacity-0'}`}>
            {answered ? noun.article : ''}
          </span>
          {noun.de}
        </p>
        <p className="mt-2 text-muted">{noun.en}</p>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {ARTICLES.map((article, i) => {
          const isAnswer = answered && article === noun.article;
          const isMiss = answered && article === picked && !correct;
          return (
            <button
              key={article}
              type="button"
              disabled={answered && !isAnswer && !isMiss}
              onClick={() => answer(article)}
              className={`gender-btn gender-${article} ${isAnswer ? 'is-answer' : ''} ${isMiss ? 'is-miss' : ''}`}
              aria-keyshortcuts={String(i + 1)}
            >
              {article}
              <kbd className="hidden text-xs font-normal opacity-50 sm:inline">{i + 1}</kbd>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex min-h-10 flex-wrap items-center justify-between gap-3 text-sm" aria-live="polite">
        <p className="text-muted">
          {answered ? (
            correct ? (
              <span className="font-semibold text-good">Richtig!</span>
            ) : (
              <span>
                <span className="font-semibold text-bad">Nicht ganz.</span> It is{' '}
                <span className={`de gender-${noun.article}`} lang="de">
                  {noun.article} {noun.de}
                </span>
                .
              </span>
            )
          ) : (
            'Pick an article, or press 1, 2 or 3.'
          )}
          {tip && <span className="mt-1 block">{tip}</span>}
        </p>
        {answered && !correct ? (
          <button type="button" className="btn btn-primary btn-small" onClick={next} autoFocus>
            Next word
          </button>
        ) : (
          <p className="tabular-nums text-muted">
            <span className={`font-semibold ${streak > 0 ? 'text-ink' : ''}`}>{streak} in a row</span>
            {best > 0 && <span> · best {best}</span>}
          </p>
        )}
      </div>
    </div>
  );
}
