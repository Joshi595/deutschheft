# Deutschheft

A German notebook that quizzes you back: short lessons, exercises that check themselves,
spaced-repetition review, and a personal notebook, organised by CEFR level.

Live site: https://joshi595.github.io/German/

## What is in it

- **Lessons** with grammar explained in plain English, example sentences you can listen to, and a
  vocabulary list. Currently A2 (10 lessons) and the start of B1.
- **Exercises** of six kinds: multiple choice, fill in the gap, translation, word order, matching
  and free writing. Typed answers get a second try, a hint, and then the solution with an explanation.
- **Review.** A lesson's vocabulary and every exercise you miss become cards that come back on a
  schedule (FSRS), so a few minutes a day keeps things from fading.
- **Notebook.** Notes per lesson, your own saved words (which also become review cards), and a log
  of the answers you got wrong.
- **Dashboard** with a day streak, what is due, progress per level, and the topics you most often
  miss on the first try.
- **Works offline** once a page has been opened, and can be installed as an app.
- **Optional AI explanations** with your own Groq API key. Grading never depends on it.

Progress is stored in your browser only. Settings has a backup download and import for moving to
another device.

## Run it locally

Requires Node.js 22.12 or newer.

```
npm install
npm run dev        # http://localhost:4321/German/
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server with live reload |
| `npm test` | Unit tests, and a check of every answer key in the content |
| `npm run check` | Type check |
| `npm run build` | Build the static site into `dist/`; fails if any content file is invalid |
| `npm run preview` | Serve the built site |
| `npm run new:lesson -- a2 11 perfekt "Title"` | Scaffold a new lesson |

## Adding lessons and levels

Content lives in `src/content` as MDX and YAML files; no code changes are needed to add a lesson
or a level. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Deployment

Pushing to `main` runs the checks and deploys to GitHub Pages through
`.github/workflows/deploy.yml`. In the repository settings, Pages must have its source set to
"GitHub Actions". The site address is configured in `astro.config.mjs` (`site` and `base`).

## Built with

Astro, React, TypeScript, Tailwind CSS, nanostores, ts-fsrs and Vitest.
