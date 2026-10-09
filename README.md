<div align="center">

# Deutschheft

**A German notebook that quizzes you back.** Free, no sign-up, works offline.

### [▶ Open Deutschheft](https://joshi595.github.io/deutschheft/)

[![Open the app](https://img.shields.io/badge/Open_the_app-joshi595.github.io%2Fdeutschheft-f5b700?style=for-the-badge)](https://joshi595.github.io/deutschheft/)
[![Levels](https://img.shields.io/badge/levels-A1_·_A2_·_B1-1d5fbf?style=for-the-badge)](https://joshi595.github.io/deutschheft/)
[![Price](https://img.shields.io/badge/price-free-1a7a4a?style=for-the-badge)](https://joshi595.github.io/deutschheft/)

</div>

## Try it in 30 seconds

| Go to | What happens |
| --- | --- |
| [**Today**](https://joshi595.github.io/deutschheft/) | Say how much German you have, and get one recommended next step. Or play *Der, die oder das?* right away. |
| [**A mission**](https://joshi595.github.io/deutschheft/missions/baeckerei/) | Order bread rolls in a German bakery: the assistant speaks, you answer, it goes on. Six minutes. |
| [**A1 chapters**](https://joshi595.github.io/deutschheft/a1/) | Start from zero: chapters with audio and examples, practised ten exercises at a time. |
| [**Review**](https://joshi595.github.io/deutschheft/review/) | The words and exercises you missed come back on a schedule, so they stick. |

On a phone, open the site and choose **Add to Home Screen** to install it as an app.

## What is in it

- **A full course from A1 to B1**, aimed at the Goethe-Zertifikat exams: 29 chapters for A1, 30 for
  A2 and 32 for B1, grouped into units. Every chapter is explained step by step in plain English,
  with a comparison with English, typical mistakes, a summary table, examples you can listen to,
  and a vocabulary list.
- **Exam training** for each level: a chapter for each exam part (reading, listening, writing,
  speaking), a checkpoint after every unit, and a full mock exam with the real time limits, scored
  against the 60 % pass mark.
- **Today**, the home page: one recommended next step with the reason for it, a daily goal you can
  change or pause, and what else is worth doing. A new learner chooses a level and a goal, then goes
  straight into the first chapter.
- **Exercises** of eleven kinds, from multiple choice and gap texts to reading and listening tasks,
  forms, and writing and speaking tasks with a checklist and a model answer. A chapter's exercises
  are worked through ten at a time, one on screen, with a summary at the end. Typed answers get a
  second try, a hint, and then the solution with an explanation.
- **Missions.** Six everyday situations (bakery, train station, doctor, restaurant, flat viewing,
  job interview), played through as a conversation built from the same exercise types. A wrong
  choice is told why it is wrong, and a task you miss comes back in review.
- **Review.** A lesson's vocabulary and every exercise you miss become cards that come back on a
  schedule (FSRS), so a few minutes a day keeps things from fading. You can type your answer and
  have it checked before you rate the card.
- **Notebook.** Notes per lesson, your own saved words (which also become review cards), and a log
  of the answers you got wrong.
- **Progress.** Points for exercises solved for the first time and for cards reviewed, the last
  seven days, progress per level, strong and weak topics, and milestones as stamps.
- **Works offline** once a page has been opened, and can be installed as an app.
- **Optional AI explanations** with your own Groq API key. Grading never depends on it.

Listening texts are read by your browser's German voice, not recorded by people. All content was
written for this project and has not been reviewed by a teacher, so before booking an exam, do at
least one official practice paper from the Goethe-Institut.

Progress is stored in your browser only. Settings has a backup download and import for moving to
another device.

## How it decides what to suggest

Every suggestion on the Today page comes from a plain rule in `src/lib/progress/coach.ts` and is
shown with its reason. There is no model and no guessing.

| Suggestion | Rule |
| --- | --- |
| Level | The level chosen in Settings; if none, the level of the exercise answered last. A finished level hands over to the next. |
| Next chapter | The first chapter of that level with an unsolved exercise. |
| Review first | Only when 10 or more cards that have been reviewed before are due. New cards never jump the queue. |
| Checkpoint | Every chapter of a unit is finished and its checkpoint is not passed. |
| Trouble spot | A topic with at least 4 answered exercises and under 70 % right on the first try. |
| Mission | The next unfinished mission of the level, once the chapters it draws on are finished. |
| Mock exam | Every chapter of a level is finished and no mock exam of it is passed. |

Points are given only for retrieval that worked: 10 for an exercise solved on the first try, 5 if
it took a second go, up to 5 for a reviewed card. Solving the same exercise again earns nothing.

## What is measured, and what is not

Nothing leaves the browser: there is no account, no server and no analytics script. That is a
promise the app makes on every page, so usage across learners cannot be measured from here.
What each learner can see for themselves, on the Progress page, comes from these stored fields:

| Question | Stored as |
| --- | --- |
| Was a level and goal chosen? | `level` and `dailyGoal` in `lg:settings:v1` |
| Days studied, and runs of days | `days` in `lg:progress:v1` |
| Points per day against the goal | `xp` in `lg:progress:v1` |
| Exercises solved, and right first time | `exercises` in `lg:progress:v1` |
| Words retained | cards in `lg:review:v1` (FSRS state, repetitions, lapses) |
| Checkpoint and mock exam results | `lg:quizzes:v1` |

Points and stamps show effort and coverage. The measures of learning are the first-try rate, the
words still known in review, and the mock exam scores. To learn how learners in general use the
app would take opt-in, self-hosted, cookieless page counts, which is not built.

## Known limits

- **No B2 yet.** It is listed as planned. B1 with its mock exams is the most advanced level.
- **Speaking is not scored.** You hear a model, record yourself if you like, and mark your own
  attempt against a checklist. Automatic pronunciation scoring needs speech recognition, which in
  browsers either sends audio to a third party or is not available at all, so it is left out.
- **Voices are the browser's.** Edge and Chrome bring a German voice with them; a browser that
  only has the device's own voices (Brave, Firefox, an editor's built-in browser) has none unless
  German is installed on the device. The app picks the best German voice it finds, never a
  multilingual one if it can help it, and Settings lets you choose another. Without any German
  voice, listening is switched off and a line at the top says how to get it back, because an
  English voice reading German teaches the wrong sounds.
- **Most multiple-choice items do not say why a wrong option is wrong.** Missions do, for every
  option; of the 2,080 chapter exercises about 160 carry an explanation.
- **One browser, one learner.** Moving to another device means downloading and importing a backup.
- **The review page is large** (about 1.8 MB before compression), because it carries every word
  and exercise that could come up.

## Run it locally

Requires Node.js 22.12 or newer.

```
npm install
npm run dev        # http://localhost:4321/deutschheft/
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server with live reload |
| `npm test` | Unit tests, and a check of every answer key in the content |
| `npm run check` | Type check |
| `npm run build` | Build the static site into `dist/`; fails if any content file is invalid |
| `npm run preview` | Serve the built site |
| `node scripts/e2e-flows.mjs` | Drive the built site in a browser: first visit, practice, a mission, review, phone layout. See the top of the file |
| `npm run new:lesson -- b1 33 konjunktiv-1 "Title"` | Scaffold a new chapter from the template |

## Adding lessons and levels

Content lives in `src/content` as MDX and YAML files; no code changes are needed to add a chapter,
a mission, a mock exam or a level. The tests enforce the chapter template, so a thin chapter fails the build.
See [CONTRIBUTING.md](CONTRIBUTING.md).

## Deployment

Pushing to `main` runs the checks and deploys to GitHub Pages through
`.github/workflows/deploy.yml`. In the repository settings, Pages must have its source set to
"GitHub Actions". The site address is configured in `astro.config.mjs` (`site` and `base`).

## Built with

Astro, React, TypeScript, Tailwind CSS, nanostores, ts-fsrs and Vitest.
