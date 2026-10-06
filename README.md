# Deutschheft

A German notebook that quizzes you back: short lessons, exercises that check themselves,
spaced-repetition review, and a personal notebook, organised by CEFR level.

Live site: https://joshi595.github.io/German/

## What is in it

- **A full course from A1 to B1**, aimed at the Goethe-Zertifikat exams: 29 chapters for A1, 30 for
  A2 and 32 for B1, grouped into units. Every chapter is explained step by step in plain English,
  with a comparison with English, typical mistakes, a summary table, examples you can listen to,
  and a vocabulary list.
- **Exam training** for each level: a chapter for each exam part (reading, listening, writing,
  speaking), a checkpoint after every unit, and a full mock exam with the real time limits, scored
  against the 60 % pass mark.
- **Exercises** of eleven kinds, from multiple choice and gap texts to reading and listening tasks,
  forms, and writing and speaking tasks with a checklist and a model answer. Typed answers get a
  second try, a hint, and then the solution with an explanation.
- **Review.** A lesson's vocabulary and every exercise you miss become cards that come back on a
  schedule (FSRS), so a few minutes a day keeps things from fading.
- **Notebook.** Notes per lesson, your own saved words (which also become review cards), and a log
  of the answers you got wrong.
- **Dashboard** with a day streak, what is due, progress per level, and the topics you most often
  miss on the first try.
- **Works offline** once a page has been opened, and can be installed as an app.
- **Optional AI explanations** with your own Groq API key. Grading never depends on it.

Listening texts are read by your browser's German voice, not recorded by people. All content was
written for this project and has not been reviewed by a teacher, so before booking an exam, do at
least one official practice paper from the Goethe-Institut.

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
| `npm run new:lesson -- b1 33 konjunktiv-1 "Title"` | Scaffold a new chapter from the template |

## Adding lessons and levels

Content lives in `src/content` as MDX and YAML files; no code changes are needed to add a chapter,
a mock exam or a level. The tests enforce the chapter template, so a thin chapter fails the build.
See [CONTRIBUTING.md](CONTRIBUTING.md).

## Deployment

Pushing to `main` runs the checks and deploys to GitHub Pages through
`.github/workflows/deploy.yml`. In the repository settings, Pages must have its source set to
"GitHub Actions". The site address is configured in `astro.config.mjs` (`site` and `base`).

## Built with

Astro, React, TypeScript, Tailwind CSS, nanostores, ts-fsrs and Vitest.
