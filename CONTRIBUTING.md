# Adding content

Lessons, exercises and vocabulary are plain files under `src/content`. The app is generated from
them, so adding a lesson or a whole level never involves touching code.

```
src/content/
├── levels/      a1.yaml, a2.yaml, b1.yaml        one file per level
├── lessons/     a2/01-charaktereigenschaften.mdx  the explanation
├── exercises/   a2/01-charaktereigenschaften.yaml the practice
└── vocab/       a2/01-charaktereigenschaften.yaml the word list
```

## Add a lesson

```
npm run new:lesson -- a2 11 perfekt "Talking about the past"
```

This creates the three files with placeholder content. Edit them, then:

```
npm run dev     # see it at http://localhost:4321/German/
npm test        # checks every answer key against the grader
npm run build   # fails if any file breaks the schema
```

The lesson appears in its level's list, on the dashboard and in "next lesson" links by itself.

## Add a level

Run the same command with a level that does not exist yet (`b2`, `c1`). It also creates
`levels/<level>.yaml`; fill in its name and description. Set `status: planned` to list a level
before it has lessons.

## Lesson file (`.mdx`)

Frontmatter:

| Field | Meaning |
| --- | --- |
| `key` | Stable id, `<level>.<two digits>`, e.g. `a2.11`. Progress is stored against it, so never change it once published. |
| `title`, `titleDe` | English title and optional German one. |
| `summary` | One sentence: what the learner will be able to do. |
| `order` | Position within the level. Reordering is safe; it does not affect progress. |
| `minutes` | Rough time needed. |
| `topics` | Shown as labels on the level page. |

The body is Markdown. Two components are available without importing them:

```mdx
<Example de="Sie **ist** nett." en="She is nice." />
<Example wrong de="Sie **bist** nett." />

<GrammarBox title="The rule in one line" label="Watch out">

Markdown goes here. Leave a blank line after the opening tag and before the closing one.

</GrammarBox>
```

`**double asterisks**` inside `de` highlight the part to notice. Every `Example` gets a listen
button, so there is no need to write out pronunciation.

## Exercise file (`.yaml`)

Exercises are grouped into sets. Every item needs an `id` (unique within the file, never reused)
and a `type`. Optional on every item: `tags` (topics, used for the "needs work" stats), `hint`
(shown after a first wrong answer) and `explanation` (shown with the solution).

| Type | Fields |
| --- | --- |
| `multiple-choice` | `prompt`, `options`, `answer` (written out, must be one of the options) |
| `fill-blank` | `prompt` with exactly one `___`, `answers` (all accepted forms; the first is shown as the solution), optional `translation` |
| `translation` | `prompt`, `answers` (list every word order you would accept) |
| `word-order` | `answer` (the sentence, split into tiles automatically), optional `prompt` and `alternatives` |
| `matching` | `pairs` of `left` and `right`, optional `prompt` |
| `writing` | `prompt`, `sample`, optional `mustInclude` (words the sentence has to contain) |

How answers are graded:

- Capital letters and punctuation do not make an answer wrong; a capitalisation slip is pointed out.
- `ae`, `oe`, `ue`, `ss` are accepted for `ä`, `ö`, `ü`, `ß`, with the proper spelling shown.
- A dropped umlaut (`schon` for `schön`) is wrong, and reported as a near miss.
- Typed answers get two attempts, multiple choice gets one.

Quote any YAML value that contains a colon followed by a space, or that starts with a quote mark.

## Vocabulary file (`.yaml`)

Each item: `id`, `de`, `en`, `pos` (`noun`, `verb`, `adjective`, `adverb`, `preposition`,
`conjunction`, `phrase`, `other`), and optionally `example` and `exampleEn`. Nouns also need
`article` and should have `plural` (use `"-"` if there is none). Write the noun without its
article in `de`; the article is added when it is displayed.

Every vocabulary item becomes a review card once the learner starts that lesson's exercises.

## Where the code lives

| Path | What it is |
| --- | --- |
| `src/lib/content/schema.ts` | The content contract. Add a field or an exercise type here first. |
| `src/lib/grading/` | Pure grading functions, one per exercise type. |
| `src/lib/progress/`, `src/lib/srs/`, `src/lib/notebook/` | Pure rules for progress, review scheduling and the notebook. |
| `src/lib/stores.ts` | Browser storage that applies those rules. |
| `src/components/exercises/` | One input widget per exercise type, and the card around them. |
| `src/pages/` | Routes. They read from `src/lib/content/catalog.ts` and name no level or lesson. |
| `tests/` | Unit tests for the rules, plus `content.test.ts`, which checks the content itself. |

To add an exercise type: extend the union in `schema.ts`, add a grading function and a case in
`grade()`, add a widget, and add a branch in `ExerciseCard.tsx`. TypeScript will point at each
place that still needs a case.
