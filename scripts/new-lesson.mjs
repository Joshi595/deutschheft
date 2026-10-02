// Scaffold the three content files for a new lesson.
//
//   npm run new:lesson -- <level> <number> <slug> ["Title"]
//   npm run new:lesson -- a2 11 perfekt "Talking about the past"
//
// Creates lessons/<level>/NN-<slug>.mdx, exercises/<level>/NN-<slug>.yaml and
// vocab/<level>/NN-<slug>.yaml, plus levels/<level>.yaml if the level is new.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [level, number, slug, title = 'Untitled lesson'] = process.argv.slice(2);

function fail(message) {
  console.error(`\n${message}\n\nUsage: npm run new:lesson -- <level> <number> <slug> ["Title"]\nExample: npm run new:lesson -- a2 11 perfekt "Talking about the past"\n`);
  process.exit(1);
}

if (!level || !number || !slug) fail('Missing arguments.');
if (!/^[a-z][0-9]$/.test(level)) fail(`Level "${level}" should look like a1, a2, b1 …`);
if (!/^[0-9]{1,2}$/.test(number) || Number(number) < 1) fail(`Lesson number "${number}" should be between 1 and 99.`);
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) fail(`Slug "${slug}" should be lowercase words joined by dashes, without umlauts.`);

const order = Number(number);
const padded = String(order).padStart(2, '0');
const key = `${level}.${padded}`;
const name = `${padded}-${slug}`;
const content = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'content');

const files = {
  [join(content, 'lessons', level, `${name}.mdx`)]: `---
key: ${key}
title: ${JSON.stringify(title)}
titleDe: ""
summary: One sentence saying what the learner will be able to do.
order: ${order}
minutes: 20
topics: []
---

Open with why this matters, in two or three sentences.

## First point

Explain, then show.

<Example de="Ein **Beispiel** auf Deutsch." en="An example in German." />

<GrammarBox title="The rule in one line">

State the rule, then contrast right and wrong.

<Example de="Das ist **richtig**." en="This is right." />
<Example wrong de="Das ist **falsch**." />

</GrammarBox>
`,

  [join(content, 'exercises', level, `${name}.yaml`)]: `lesson: ${key}
sets:
  - title: First exercise
    instructions: What the learner has to do.
    items:
      - id: mc1
        type: multiple-choice
        tags: []
        prompt: The question
        options: [right answer, wrong answer, another wrong answer]
        answer: right answer
      - id: fill1
        type: fill-blank
        tags: []
        prompt: "Ein Satz mit einer ___."
        answers: [Lücke]
        translation: A sentence with a gap.
      - id: order1
        type: word-order
        tags: []
        prompt: The English meaning.
        answer: Die Wörter stehen in der richtigen Reihenfolge.
      - id: tr1
        type: translation
        tags: []
        prompt: An English sentence to translate.
        answers:
          - Ein deutscher Satz.
`,

  [join(content, 'vocab', level, `${name}.yaml`)]: `lesson: ${key}
items:
  - id: beispiel
    de: Beispiel
    en: example
    pos: noun
    article: das
    plural: Beispiele
    example: Das ist ein gutes Beispiel.
    exampleEn: That is a good example.
`,
};

const levelFile = join(content, 'levels', `${level}.yaml`);
if (!existsSync(levelFile)) {
  files[levelFile] = `title: ${level.toUpperCase()}
name: Level name
description: What a learner can do at this level.
order: ${'abc'.indexOf(level[0]) * 2 + Number(level[1])}
status: active
`;
}

const existing = Object.keys(files).filter((path) => existsSync(path));
if (existing.length > 0) fail(`Nothing written. These files already exist:\n${existing.map((path) => `  ${path}`).join('\n')}`);

for (const [path, text] of Object.entries(files)) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  console.log(`created ${path.slice(content.length + 1).replace(/\\/g, '/')}`);
}

console.log(`\nLesson ${key} is ready to edit. Run "npm run dev" to see it, and "npm test" to check the answer keys.`);
