// End-to-end check of the main learner flows in a real browser: first visit,
// a practice session, the Today page, a mission, review, progress, settings,
// and the phone layout. It drives the built site, so build and serve it first:
//
//   npm run build && npm run preview          (serves http://localhost:4321/deutschheft/)
//   npm install --no-save playwright-core     (not a project dependency; uses the installed Edge)
//   node scripts/e2e-flows.mjs [baseUrl]
//
// Set E2E_SHOTS to a folder to keep screenshots of each stage.
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const repo = join(import.meta.dirname, '..');
const BASE = process.argv[2] ?? 'http://localhost:4321/deutschheft/';
const { parse } = createRequire(join(repo, 'package.json'))('yaml');
const yaml = (path) => parse(readFileSync(join(repo, 'src/content', path), 'utf8'));

const results = [];
const problems = [];
const ok = (name, condition, detail = '') => results.push(`${condition ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`);
const tokenize = (sentence) => sentence.trim().replace(/[.!?]+$/, '').split(/\s+/).filter(Boolean);

// A fake microphone, so that recording can be tried without a person in the room.
const browser = await chromium.launch({ channel: process.env.E2E_BROWSER ?? 'msedge', headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['microphone'] });
// A learner's browser normally has a German voice. Automation hides the online ones, so one
// is supplied here and kept silent; section 10 checks what happens with other voice lists.
await context.addInitScript(() => {
  window.SpeechSynthesisUtterance = class {
    constructor(text) {
      this.text = text;
    }
  };
  speechSynthesis.getVoices = () => [{ name: 'Microsoft Katja Online (Natural) - German (Germany)', lang: 'de-DE' }];
  speechSynthesis.cancel = () => {};
  speechSynthesis.speak = (utterance) => utterance.onend?.();
  // A speech recogniser that always hears the same sentence, to try "what it heard" without a real one.
  window.SpeechRecognition = class {
    start() {
      setTimeout(() => this.onresult?.({ resultIndex: 0, results: [[{ transcript: 'Entschuldigung wo ist der Bahnhof' }]] }), 30);
    }
    stop() {
      setTimeout(() => this.onend?.(), 60);
    }
  };
});
const page = await context.newPage();
page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()} @ ${m.location().url}`));
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('response', (r) => r.status() >= 400 && problems.push(`http ${r.status()}: ${r.url()}`));
const shot = async (name) => {
  if (process.env.E2E_SHOTS) await page.screenshot({ path: join(process.env.E2E_SHOTS, `flow-${name}.png`) });
};
const store = (key) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), key);
/** Whether something shows up within a few seconds; for what appears only after audio or recognition has finished. */
const appears = (locator) => locator.first().waitFor({ state: 'visible', timeout: 5000 }).then(() => true, () => false);

/** Answer the exercise card on screen. `wrong` gives a deliberately wrong answer where that is easy. */
async function answer(item, { wrong = false } = {}) {
  const card = page.locator('article').filter({ has: page.locator(`[id$=".${item.id}-prompt"]`) });
  await card.waitFor();
  switch (item.type) {
    case 'multiple-choice': {
      const choice = wrong ? item.options.find((o) => o !== item.answer) : item.answer;
      await card.getByRole('radio', { name: choice, exact: true }).click();
      break;
    }
    case 'true-false':
      await card.getByRole('radio', { name: (wrong ? !item.answer : item.answer) ? 'Richtig' : 'Falsch' }).click();
      break;
    case 'fill-blank':
    case 'translation':
    case 'writing':
      await card.getByRole('textbox').first().fill(wrong ? 'xyzzy' : (item.answers?.[0] ?? item.sample));
      break;
    case 'word-order':
      for (const word of tokenize(item.answer)) {
        await card.getByLabel('Available words').getByRole('button', { name: word, exact: true }).first().click();
      }
      break;
    case 'matching':
      for (const pair of item.pairs) await card.getByLabel(`Match for ${pair.left}`).selectOption(pair.right);
      break;
    case 'cloze':
      for (let i = 0; i < item.gaps.length; i++) {
        const gap = card.getByLabel(`Gap ${i + 1}`);
        if (item.bank) await gap.selectOption(item.gaps[i][0]);
        else await gap.fill(item.gaps[i][0]);
      }
      break;
    case 'form':
      for (let i = 0; i < item.fields.length; i++) await card.getByRole('textbox').nth(i).fill(item.fields[i].answers[0]);
      break;
    case 'speaking-task':
      await card.getByRole('button', { name: /I have said it/ }).click();
      for (const box of await card.getByRole('checkbox').all()) await box.check();
      break;
    case 'writing-task':
      await card.getByRole('textbox').fill(item.sample);
      await card.getByRole('button', { name: /Compare with a model/ }).click();
      for (const box of await card.getByRole('checkbox').all()) await box.check();
      break;
  }
  await card.getByRole('button', { name: /^(Check|Done)$/ }).click();
  return card;
}

// --- 1. First visit: onboarding ------------------------------------------------
await page.goto(BASE, { waitUntil: 'networkidle' });
ok('new learner sees the welcome', await page.getByRole('heading', { name: 'Where shall we start?' }).isVisible());
ok('B2 is shown as planned, not offered', (await page.getByText('B2 is planned').isVisible()) && (await page.getByRole('radio').count()) === 7);
await page.getByText('Regular').click();
await shot('1-welcome');
await page.getByRole('link', { name: /Start with/ }).click();
await page.waitForURL(/a1\/01-/);
const settings = await store('lg:settings:v1');
ok('onboarding saved level and goal', settings.level === 'a1' && settings.dailyGoal === 100, JSON.stringify({ level: settings.level, goal: settings.dailyGoal }));

// --- 2. Chapter practice as a focused session -----------------------------------
const lesson = yaml('exercises/a1/01-begruessung.yaml');
const items = lesson.sets.flatMap((set) => set.items);
// The practice section loads after the page; wait for it before counting its parts.
await page.getByRole('button', { name: 'Start part 1' }).waitFor();
ok('a chapter comes in two parts', (await page.getByText(/^Part [12] ·/).count()) === 2);
await page.getByRole('button', { name: 'Start part 1' }).click();
ok('session shows one exercise at a time', (await page.locator('article').count()) === 1);
ok('session has a progress bar', await page.getByRole('progressbar', { name: 'Session progress' }).isVisible());

// First item wrong on purpose, to see the explanation and the summary's review list.
let card = await answer(items[0], { wrong: true });
ok('wrong answer is explained and queued', await card.getByText(/Not this time|Not quite/).isVisible());
await shot('2-wrong');
if (await card.getByRole('button', { name: 'Check' }).count()) {
  // typed answers get a second try
  await answer(items[0]);
}
await card.getByRole('button', { name: 'Continue' }).click();

card = await answer(items[1]);
ok('right answer is confirmed with points', (await card.getByText('Richtig!').isVisible()) && (await card.getByText('+10 points').isVisible()));
await shot('2-right');
await card.getByRole('button', { name: 'Continue' }).click();
// Part 1 is the first sets in order, so the queue follows the file until "Finish".
for (let i = 2; ; i++) {
  card = await answer(items[i]);
  const finish = card.getByRole('button', { name: 'Finish' });
  if (await finish.count()) {
    await finish.click();
    break;
  }
  await card.getByRole('button', { name: 'Continue' }).click();
}
ok('part ends with a summary', await page.getByRole('heading', { name: 'Part 1 done' }).isVisible());
ok('summary lists what to look at again', await page.getByText('Worth another look').isVisible());
ok('summary shows the wrong answer struck through', (await page.locator('#practice li del, #practice li [role=radio]').count()) > 0);
ok('summary offers part 2 straight away', await page.getByRole('button', { name: /^Start part 2/ }).isVisible());
ok('summary counts points', await page.getByText(/\+\d+ points/).first().isVisible());
await shot('2-summary');
const progress = await store('lg:progress:v1');
const today = Object.values(progress.xp ?? {})[0];
ok('points were stored for today', today >= 90, `${today} points`);
ok('header shows points against the goal', (await page.locator('[data-goal-text]').textContent()) === `${today}/100`);
ok('missed exercise joined the review deck', Object.keys(await store('lg:review:v1')).some((id) => id.startsWith('exercise:')));
await page.getByRole('button', { name: 'Done for now' }).click();
ok('overview offers to continue', await page.getByRole('button', { name: 'Continue with part 1' }).isVisible());
await page.getByRole('button', { name: 'Show all exercises as a list' }).click();
ok('the full list is still available', (await page.locator('article').count()) === items.length, `${await page.locator('article').count()} cards`);

// --- 3. Today, as a returning learner -----------------------------------------
await page.goto(BASE, { waitUntil: 'networkidle' });
ok('today greets in German', await page.getByRole('heading', { level: 1, name: /Guten (Morgen|Tag|Abend)!/ }).isVisible());
ok('today recommends continuing the chapter', await page.getByRole('link', { name: 'Continue chapter' }).isVisible());
ok('today explains why', await page.getByText(/You have solved \d+ of \d+ exercises/).isVisible());
ok('first stamp is announced', await page.getByText(/new stamp/).isVisible());
await shot('3-today');
await page.reload({ waitUntil: 'networkidle' });
ok('a stamp is announced only once', (await page.getByText(/new stamp/).count()) === 0);
await page.getByRole('link', { name: 'Continue chapter' }).click();
await page.waitForURL(/#practice/);
ok('continue lands on the practice section', await page.getByRole('button', { name: /^Continue with part/ }).isVisible());

// --- 4. A mission from start to finish ------------------------------------------
const mission = yaml('missions/baeckerei.yaml');
await page.goto(BASE + 'missions/baeckerei/', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Start mission' }).click();
ok('mission opens with what the other person says', await page.locator('.bubble').getByText('Was darf es sein?').isVisible());
card = await answer(mission.steps[0].task, { wrong: true });
ok('a wrong choice gets its own explanation', await card.getByText(/To order, say|sounds rude/).isVisible());
await shot('4-mission-wrong');
await card.getByRole('button', { name: 'Continue' }).click();
for (let i = 1; i < mission.steps.length; i++) {
  card = await answer(mission.steps[i].task);
  if (i === 1) {
    ok('the learner’s line joins the conversation', await page.locator('.bubble-you').first().isVisible());
    await shot('4-mission-step');
  }
  await card.getByRole('button', { name: i === mission.steps.length - 1 ? 'Finish the mission' : 'Continue' }).click();
}
ok('mission ends with a summary', await page.getByRole('heading', { name: 'You got through it' }).isVisible());
ok('summary says what was practised', await page.getByText('What you practised').isVisible());
ok('whole conversation can be replayed', await page.getByRole('button', { name: 'Play it through' }).isVisible());
const before = Object.keys(await store('lg:review:v1')).length;
await page.getByRole('button', { name: /Add \d+ to my review deck/ }).click();
const after = Object.keys(await store('lg:review:v1')).length;
ok('phrases join the review deck', after - before === mission.phrases.length, `${after - before} cards added`);
ok('phrases cannot be added twice', await page.getByRole('button', { name: 'In your review deck' }).isDisabled());
await shot('4-mission-summary');
await page.getByRole('button', { name: 'Try the mission again' }).click();
card = await answer(mission.steps[0].task);
ok('a retried task counts as solved', await card.getByText('Richtig!').isVisible());
await page.goto(BASE + 'missions/', { waitUntil: 'networkidle' });
await page.waitForURL(/speak\/conversations\/$/);
ok('the old missions address leads to the conversations', await page.getByRole('heading', { level: 1, name: 'Conversations' }).isVisible());
ok('a situation with a mission offers both ways in', await page.locator('li', { hasText: 'In der Bäckerei' }).getByRole('link', { name: 'Guided mission' }).isVisible());

// --- 5. Review with typed recall -----------------------------------------------
await page.goto(BASE + 'review/', { waitUntil: 'networkidle' });
let typedChecked = false;
for (let i = 0; i < 12 && !typedChecked; i++) {
  if (await page.getByLabel('Your answer in German').count()) {
    await page.getByLabel('Your answer in German').fill('falsch');
    await page.getByRole('button', { name: 'Check' }).click();
    ok('typed recall is checked', await page.getByText('Nicht ganz.').isVisible());
    await shot('5-review-typed');
    await page.keyboard.press('Enter');
    typedChecked = true;
  } else if (await page.locator('article').count()) {
    const id = (await page.locator('article [id$="-prompt"]').getAttribute('id')).replace(/-prompt$/, '');
    const local = id.split('.').pop();
    const item = [...items, ...mission.steps.map((s) => s.task)].find((candidate) => candidate.id === local);
    card = await answer(item);
    await card.getByRole('button', { name: 'Next card' }).click();
  } else break;
}
ok('review reached a typed card', typedChecked);

// --- 6. Progress and settings ---------------------------------------------------
await page.goto(BASE + 'progress/', { waitUntil: 'networkidle' });
ok('progress shows earned stamps', (await page.locator('.stamp[data-earned="true"]').count()) >= 2, `${await page.locator('.stamp[data-earned="true"]').count()} earned`);
ok('progress shows the week', await page.getByRole('heading', { name: 'The last seven days' }).isVisible());
await shot('6-progress');
await page.goto(BASE + 'settings/#learning', { waitUntil: 'networkidle' });
await page.getByRole('radio', { name: /Paused/ }).click();
ok('goal can be paused', (await store('lg:settings:v1')).dailyGoal === 0);
await page.getByLabel('Level').selectOption('b1');
await page.goto(BASE, { waitUntil: 'networkidle' });
ok('today respects a paused goal', await page.getByText('Goal paused').isVisible());
ok('today follows the chosen level', await page.getByRole('heading', { name: /Your course: B1/ }).isVisible());
await shot('6-today-b1');

// --- 7. Trouble-spot link into a chapter ---------------------------------------
const tag = items[0].tags[0];
await page.goto(`${BASE}a1/01-begruessung/?tag=${encodeURIComponent(tag)}#practice`, { waitUntil: 'networkidle' });
ok('a topic link opens focused practice', await page.getByText(`Practise “${tag}”`).isVisible(), tag);

// --- 8. The Speak section --------------------------------------------------------
const speakingStore = () => store('lg:speaking:v1');
const model = page.locator('p.de.font-display');

await page.goto(BASE + 'speak/', { waitUntil: 'networkidle' });
ok('speak: one next step is recommended', (await page.locator('#speak-next').isVisible()) && (await page.locator('section a.btn-accent').isVisible()));

// Sentences: new ones are read aloud first, then said from the cue.
await page.goto(BASE + 'speak/sentences/', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Start speaking' }).click();
ok('sentences: a new sentence is shown to be read aloud', (await page.getByText('New', { exact: true }).isVisible()) && (await model.isVisible()));
await page.getByRole('button', { name: 'Speak', exact: true }).click();
await page.waitForTimeout(700);
await page.getByRole('button', { name: 'Stop' }).click();
ok('sentences: the learner’s recording appears next to the model', await appears(page.getByLabel('Your recording')));
await shot('8-sentence');
await page.getByRole('button', { name: 'I have read it aloud' }).click();
let recallHidden = true;
for (let turns = 1; turns < 20 && !(await page.getByRole('heading', { name: 'Sitting done' }).count()); turns++) {
  const reading = await page.getByText('New', { exact: true }).count();
  if (!reading && (await model.count())) recallHidden = false;
  await page.getByRole('button', { name: 'I said it' }).click();
  if (reading) await page.getByRole('button', { name: 'I have read it aloud' }).click();
  else await page.getByRole('button', { name: /Got it/ }).click();
}
ok('sentences: from the cue, the German stays hidden until it has been said', recallHidden);
ok('sentences: a sitting ends with a summary', await page.getByRole('heading', { name: 'Sitting done' }).isVisible());
let speaking = await speakingStore();
ok('sentences: the new ones joined the speaking deck', Object.keys(speaking.cards).length === 5, `${Object.keys(speaking.cards).length} cards`);

// A conversation, first read aloud, then from the cue with "what it heard" switched on.
await page.goto(BASE + 'speak/conversations/weg/', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: /^Read/ }).click();
ok('conversation: reading shows the learner’s line', await model.isVisible());
for (let turn = 0; turn < 5; turn++) {
  await page.getByRole('button', { name: 'I said it' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
}
ok('conversation: the other person’s lines appear as the talk goes on', await page.locator('.bubble').getByText('Gern geschehen. Schönen Tag noch!').isVisible());
await page.getByRole('button', { name: 'Finish the conversation' }).click();
speaking = await speakingStore();
ok('conversation: reading aloud is recorded but schedules nothing', speaking.talks.weg === 1 && !Object.keys(speaking.cards).some((id) => id.includes('talk.weg')));

await page.goto(BASE + 'settings/#speaking', { waitUntil: 'networkidle' });
await page.getByLabel(/Write down what the browser hears/).check();
ok('settings: say where the audio goes before it is switched on', await page.getByText(/sent to the browser maker|recognised on this device/).isVisible());
await page.goto(BASE + 'speak/conversations/weg/', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: /^Prompted/ }).click();
ok('conversation: with a cue only, the line is hidden', (await model.count()) === 0);
await page.getByRole('button', { name: 'Speak', exact: true }).click();
await page.waitForTimeout(400);
await page.getByRole('button', { name: 'Stop' }).click();
ok('what it heard: the transcript is shown with the words it found', await appears(page.getByText('5 of 5 words found')));
ok('what it heard: it suggests a rating and leaves the choice', /bg-accent-soft/.test(await page.getByRole('button', { name: /Got it/ }).getAttribute('class')));
await shot('8-heard');
await page.getByRole('button', { name: /Got it/ }).click();
for (let turn = 1; turn < 5; turn++) {
  await page.getByRole('button', { name: 'I said it' }).click();
  await page.getByRole('button', { name: /Almost/ }).click();
}
await page.getByRole('button', { name: 'Finish the conversation' }).click();
speaking = await speakingStore();
ok('conversation: lines said from the cue join the deck', speaking.talks.weg === 2 && Object.keys(speaking.cards).filter((id) => id.includes('talk.weg')).length === 5);
ok('conversation: the next step is less help', await page.getByRole('button', { name: /Again with less help: From memory/ }).isVisible());

// Ear training on one sound.
await page.goto(BASE + 'speak/sounds/ue/', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Start listening' }).click();
for (let trial = 0; trial < 8; trial++) {
  await page.keyboard.press('1');
  await page.getByRole('button', { name: /Next word|See the result/ }).click();
}
ok('sounds: an ear-training round ends with a score', await page.getByText(/\d of 8 heard right/).isVisible());
ok('sounds: the best score is kept', typeof (await speakingStore()).ears.ue === 'number');

// An exam task against the clock.
await page.goto(BASE + 'speak/exam/a1/', { waitUntil: 'networkidle' });
await page.locator('ul button.card').first().click();
await page.getByRole('button', { name: 'Start the clock' }).click();
ok('exam speaking: a task opens with a running clock and a model to compare with', (await page.getByRole('button', { name: 'Stop the clock' }).isVisible()) && (await page.locator('article').isVisible()));

// --- 9. Phone: navigation and no sideways scrolling ---------------------------
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: await context.storageState() });
const mobile = await phone.newPage();
mobile.on('pageerror', (e) => problems.push(`phone pageerror: ${e.message}`));
const routes = ['', 'learn/', 'a1/', 'a1/01-begruessung/', 'missions/vorstellungsgespraech/', 'review/', 'notebook/', 'progress/', 'settings/', 'a1/checkpoint/1/', 'b2/'];
const speakRoutes = ['speak/', 'speak/sentences/', 'speak/conversations/', 'speak/conversations/vorstellungsgespraech/', 'speak/sounds/', 'speak/sounds/lang-kurz/', 'speak/exam/b1/'];
for (const route of [...routes, ...speakRoutes]) {
  await mobile.goto(BASE + route, { waitUntil: 'networkidle' });
  const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(`phone: /${route} fits the screen`, overflow <= 0, overflow > 0 ? `${overflow}px too wide` : '');
}
ok('phone: tab bar is shown', await mobile.locator('.tabbar').isVisible());
ok('phone: desktop sidebar is hidden', !(await mobile.locator('.sidebar').isVisible()));
await mobile.locator('.tabbar').getByRole('link', { name: 'Speak' }).click();
await mobile.waitForURL(/speak\/$/);
ok('phone: tab bar navigates', (await mobile.locator('.tabbar a[aria-current="page"]').textContent()).trim() === 'Speak');

// --- 10. Audio: the right voice, and an honest state when there is none -----------
// Automation hides a browser's online voices, so the lists are given here: they are what
// Edge and Brave reported on a Windows PC that has no German voice of its own.
const ENGLISH = [['Microsoft David - English (United States)', 'en-US']];
const EDGE_GERMAN = [
  ['Microsoft Seraphina Mehrsprachig Online (Natural) - German (Germany)', 'de-DE'],
  ['Microsoft Katja Online (Natural) - German (Germany)', 'de-DE'],
  ['Microsoft Conrad Online (Natural) - German (Germany)', 'de-DE'],
];
async function withVoices(list) {
  const audio = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  audio.on('response', (response) => response.status() >= 400 && problems.push(`audio http ${response.status()}: ${response.url()}`));
  await audio.addInitScript((voices) => {
    localStorage.setItem('lg:settings:v1', JSON.stringify({ level: 'a1', dailyGoal: 50 }));
    window.__spoken = [];
    window.SpeechSynthesisUtterance = class {
      constructor(text) {
        Object.assign(this, { text, voice: null });
      }
    };
    speechSynthesis.getVoices = () => voices.map(([name, lang]) => ({ name, lang }));
    speechSynthesis.cancel = () => {};
    speechSynthesis.speak = (utterance) => window.__spoken.push(utterance.voice?.name ?? null);
  }, list);
  return audio.newPage();
}

let audio = await withVoices([...ENGLISH, ...EDGE_GERMAN]);
await audio.goto(BASE + 'a1/01-begruessung/', { waitUntil: 'networkidle' });
// A sentence without a recorded clip is read by the browser's voice.
await audio.locator('.prose .speak:not([data-clip]):visible').first().click();
await audio.waitForTimeout(500);
let voicesUsed = await audio.evaluate(() => window.__spoken);
ok('audio: a sentence is read by a German-only voice, not a multilingual one', voicesUsed.length === 1 && /Katja/.test(voicesUsed[0]), String(voicesUsed[0]));
await audio.goto(BASE + 'settings/#audio', { waitUntil: 'networkidle' });
await audio.getByLabel('Voice').selectOption({ label: EDGE_GERMAN[2][0] });
await audio.waitForTimeout(500);
voicesUsed = await audio.evaluate(() => window.__spoken);
ok('audio: a voice chosen in settings is the one that speaks', /Conrad/.test(voicesUsed.at(-1)), String(voicesUsed.at(-1)));

audio = await withVoices(ENGLISH);
await audio.goto(BASE + 'a1/01-begruessung/', { waitUntil: 'networkidle' });
ok('audio: without a German voice the learner is told why buttons are missing', (await audio.locator('[data-voice-notice]').isVisible()) && (await audio.locator('.prose .speak:not([data-clip]):visible').count()) === 0);
const clips = [];
audio.on('response', (response) => /\/audio\/[ab]\/\w+\.mp3$/.test(response.url()) && clips.push(response.status()));
const recorded = audio.locator('#vocabulary .speak[data-clip]:visible');
if (await recorded.count()) {
  await recorded.first().click();
  await audio.waitForTimeout(600);
  ok('audio: a recorded line can be heard in a browser without a German voice', clips.length === 1 && clips[0] === 200, `clip requests: ${clips.join(', ') || 'none'}`);

  // Once the offline cache is in charge, a clip that was played keeps working without a connection.
  await audio.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await audio.reload({ waitUntil: 'networkidle' });
  await recorded.first().click();
  await audio.waitForTimeout(600);
  await audio.context().setOffline(true);
  await audio.reload({ waitUntil: 'load' });
  clips.length = 0;
  await recorded.first().click();
  await audio.waitForTimeout(600);
  ok('audio: a clip that was played once still plays offline', clips.length === 1 && clips[0] === 200, `clip requests offline: ${clips.join(', ') || 'none'}`);
  await audio.context().setOffline(false);
}
await audio.goto(BASE + 'missions/baeckerei/', { waitUntil: 'networkidle' });
await audio.getByRole('button', { name: 'Start mission' }).click();
await audio.waitForTimeout(300);
voicesUsed = await audio.evaluate(() => window.__spoken);
ok('audio: without a German voice nothing is read out by another language’s voice', voicesUsed.length === 0, `${voicesUsed.length} utterances`);

await browser.close();
console.log(results.join('\n'));
console.log(problems.length ? `\nPROBLEMS\n${[...new Set(problems)].join('\n')}` : '\nno console, page or http errors');
const failed = results.filter((r) => r.startsWith('FAIL')).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exitCode = failed > 0 || problems.length > 0 ? 1 : 0;
