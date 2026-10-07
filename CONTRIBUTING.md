# Adding content

Chapters, exercises, vocabulary and mock exams are plain files under `src/content`. The app is
generated from them, so adding a chapter, a mock exam or a whole level never involves touching code.

```
src/content/
├── levels/      a1.yaml, a2.yaml, b1.yaml            one file per level, with its units
├── lessons/     b1/07-relativsaetze.mdx              the chapter (explanation)
├── exercises/   b1/07-relativsaetze.yaml             the practice
├── vocab/       b1/07-relativsaetze.yaml             the word list
└── exams/       b1/modelltest-1.yaml                 mock exams
```

## Add a chapter

```
npm run new:lesson -- b1 33 konjunktiv-1 "Reported speech"
```

This creates the three files with a template to fill in. Then:

```
npm run dev     # see it at http://localhost:4321/deutschheft/
npm test        # checks the template, the minimums and every answer key
npm run build   # fails if any file breaks the schema
```

The chapter appears in its unit on the level page, on the dashboard and in "next lesson" links by
itself.

## The chapter template

For every level listed in `TEMPLATE_LEVELS` in `tests/content.test.ts` (currently a1, a2, b1), the
tests enforce a fixed structure, so a thin chapter fails the build.

| Kind | Required `##` headings | Minimum |
| --- | --- | --- |
| `grammar`, `topic` | The idea · Step by step · Compared with English · Typical mistakes · Summary | 700 words, 12 `Example`s, 15 vocabulary items, 20 exercises |
| `exam` | What this part tests · How to approach it · Summary | 350 words, 6 exercises |

### Frontmatter

| Field | Meaning |
| --- | --- |
| `key` | Stable id, `<level>.<two digits>`, e.g. `b1.07`. Progress is stored against it, so never change it once published. |
| `title`, `titleDe` | English title and optional German one. Quote a title that contains a colon. |
| `summary` | One sentence: what the chapter covers. |
| `order` | Position within the level. |
| `unit` | Number of the unit in `levels/<level>.yaml` (1-based). |
| `kind` | `grammar`, `topic` or `exam`. |
| `minutes` | Rough time needed. |
| `topics` | Shown as labels. |
| `objectives` | 2 to 4 "you will be able to …" lines, shown in a box at the top. Avoid `: ` inside an unquoted line. |

### Components

Available in every chapter without importing them:

```mdx
<Example de="Sie **ist** nett." en="She is nice." />
<Example wrong de="Sie **bist** nett." />

<Step n="1" title="One rule at a time">

Markdown goes here. Leave a blank line after the opening tag and before the closing one.

</Step>

<Compare en="I **like** it." de="Es **gefällt** mir." note="Where the languages differ." />
<Mistake wrong="Ich helfe **dich**." right="Ich helfe **dir**." why="helfen takes the dative." />

<Summary>

A table to revise from.

</Summary>

<GrammarBox title="The rule in one line" label="Watch out">…</GrammarBox>
```

`**double asterisks**` inside `de` highlight the part to notice. Every `Example` gets a listen
button. Avoid `***triple***` emphasis and `{` `}` in MDX text.

## Exercise file (`.yaml`)

Exercises are grouped into sets with a `title` and optional `instructions`. Every item needs an
`id` (unique within the file, never reused) and a `type`. Optional on every item: `tags` (used for
the "needs work" stats), `hint` and `explanation`.

| Type | Fields |
| --- | --- |
| `multiple-choice` | `prompt`, `options`, `answer` (one of the options), `shuffle` (default true; set false for a/b/c lists) |
| `true-false` | `prompt`, `answer` (true or false) |
| `fill-blank` | `prompt` with exactly one `___`, `answers` (all accepted forms), optional `translation` |
| `cloze` | `text` with two or more `___`, `gaps` (one list of accepted answers per gap), optional `bank` and `prompt` |
| `form` | `situation`, `fields` (each `label` and `answers`), optional `prompt` |
| `translation` | `prompt`, `answers` (every word order you would accept) |
| `word-order` | `answer` (split into tiles automatically), optional `prompt` and `alternatives` |
| `matching` | `pairs` of `left` and `right`, optional `prompt` |
| `writing` | `prompt`, `sample`, optional `mustInclude` |
| `writing-task` | `prompt`, `points` (content points), `minWords`, `sample`, optional `phrases` |
| `speaking-task` | `prompt`, `checklist`, `sample`, optional `cards` and `phrases` |

A set or a single item can carry a `stimulus`, which is shown above the questions:

```yaml
stimulus:
  kind: text            # a reading text
  label: Zeitungsartikel
  text: |
    …

stimulus:
  kind: audio           # read aloud by the browser, transcript hidden until answered
  label: Am Telefon
  plays: 2              # how often it can be played in an exam (default 2)
  lines:
    - speaker: Anna
      text: "…"
```

Rules the tests check:

- Every answer key must be accepted by the grader. A `writing-task` sample must reach `minWords`.
- Every `bank` word must match a gap answer exactly, including capital letters.
- Quote any value that contains `: ` or starts with a quote mark.

How answers are graded:

- Capital letters and punctuation do not make an answer wrong; a capitalisation slip is pointed out.
- `ae`, `oe`, `ue`, `ss` are accepted for `ä`, `ö`, `ü`, `ß`, with the proper spelling shown.
- A dropped umlaut (`schon` for `schön`) is wrong, and reported as a near miss.
- Writing and speaking tasks are self-assessed against the points or checklist, with a model answer.

## Vocabulary file (`.yaml`)

Each item: `id`, `de`, `en`, `pos` (`noun`, `verb`, `adjective`, `adverb`, `preposition`,
`conjunction`, `phrase`, `other`), and optionally `example` and `exampleEn`. Nouns need `article`
and should have `plural`; write the noun without its article in `de`. Plural-only words
(*die Leute, die Eltern*) go in as `phrase`.

Every vocabulary item becomes a review card once the learner starts that chapter's exercises.

## Levels and units

`levels/<level>.yaml` has `title`, `name`, `description`, `order`, `status` (`active` or
`planned`), the `exam` it prepares for, and a list of `units` (`title`, `summary`). A unit
checkpoint is built automatically from its chapters' exercises.

## Mock exams

`exams/<level>/<slug>.yaml` has `level`, `title`, `description`, `passMark` (percent), `scoring`
(`total`, where the module points add up to 100, or `per-module`, where each module is passed
separately, as in B1) and `modules`. Each module has a `skill` (`reading`, `listening`, `writing`,
`speaking`), `minutes`, `points` and `parts`, which are exercise sets. `EXAM_FORMAT` in
`tests/content.test.ts` checks that each level's mock exams have the modules, timing and task types
of the real Goethe exam.

## Where the code lives

| Path | What it is |
| --- | --- |
| `src/lib/content/schema.ts` | The content contract. Add a field or an exercise type here first. |
| `src/lib/content/catalog.ts` | Builds levels, units, checkpoints and mock exams from the content. |
| `src/lib/grading/` | Pure grading functions, one per exercise type. |
| `src/lib/quiz/` | Scoring for checkpoints and mock exams. |
| `src/lib/progress/`, `src/lib/srs/`, `src/lib/notebook/` | Pure rules for progress, review scheduling and the notebook. |
| `src/lib/stores.ts` | Browser storage that applies those rules. |
| `src/components/exercises/` | One input widget per exercise type, and the card around them. |
| `src/components/quiz/` | The mock exam and checkpoint runner. |
| `src/components/lesson/` | Step, Compare, Mistake, Summary and the other chapter components. |
| `src/pages/` | Routes. They read from the catalog and name no level or chapter. |
| `tests/` | Unit tests for the rules, plus `content.test.ts`, which checks the content itself. |

To add an exercise type: extend the union in `schema.ts`, add a grading function and a case in
`grade()`, add a widget, and add a branch in `ExerciseCard.tsx`. TypeScript will point at each
place that still needs a case.
