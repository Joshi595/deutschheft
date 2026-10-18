// Run after build/preview: node scripts/e2e-design.mjs [baseUrl].
// Install the optional driver with npm install --no-save playwright-core.
// Uses the locally installed Chrome browser; E2E_BROWSER can override its channel.
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const base = process.argv[2] ?? 'http://localhost:4322/deutschheft/';
const shots = process.env.E2E_SHOTS;
if (shots) await mkdir(shots, { recursive: true });
const browser = await chromium.launch({ channel: process.env.E2E_BROWSER ?? 'chrome', headless: true });
const failures = [];
let checks = 0;
const check = (condition, message) => { checks++; assert.ok(condition, message); };
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark' });
  await context.addInitScript(() => {
    if (!localStorage.getItem('design-test-seeded')) {
      localStorage.setItem('lg:settings:v1', JSON.stringify({ theme: 'dark', level: 'a2', dailyGoal: 100, speechRate: 0.85 }));
      localStorage.setItem('design-test-seeded', '1');
    }
    speechSynthesis.getVoices = () => [{ name: 'German test voice', lang: 'de-DE' }];
    speechSynthesis.speak = () => {};
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(error.message));
  await page.route('https://api.mymemory.translated.net/**', async (route) => {
    const word = new URL(route.request().url()).searchParams.get('q');
    await new Promise((resolve) => setTimeout(resolve, word === 'Guten' ? 300 : 10));
    await route.fulfill({ json: { responseStatus: 200, responseData: { translatedText: word === 'Guten' ? 'Good' : 'Hello' } } });
  });
  const shot = async (name) => { if (shots) await page.screenshot({ path: join(shots, `${name}.png`) }); };
  const routes = [
    ['', 'today', 'rgb(255, 241, 230)'], ['learn/', 'learn', 'rgb(234, 244, 255)'],
    ['speak/', 'speak', 'rgb(242, 237, 255)'], ['review/', 'review', 'rgb(232, 247, 239)'],
    ['notebook/', 'notebook', 'rgb(255, 240, 245)'], ['progress/', 'progress', 'rgb(232, 247, 250)'],
    ['settings/', 'settings', 'rgb(238, 240, 255)'], ['a1/01-begruessung/', 'learn'],
    ['a1/exam/modelltest-01/', 'learn'], ['a1/checkpoint/1/', 'learn'],
    ['speak/sounds/ue/', 'speak'], ['speak/conversations/weg/', 'speak'], ['missions/baeckerei/', 'speak'],
    ['missions/vorstellungsgespraech/', 'speak'], ['speak/conversations/vorstellungsgespraech/', 'speak'],
  ];
  for (const [route, area, tint] of routes) {
    await page.goto(base + route, { waitUntil: 'networkidle' });
    check(await page.locator('body').getAttribute('data-area') === area, `${route} area`);
    check(await page.locator(`.sidebar-link[data-area="${area}"]`).getAttribute('aria-current') === 'page', `${route} selected navigation`);
    check(await page.locator('.sidebar').isVisible(), 'desktop sidebar visible');
    if (tint) {
      const actual = await page.locator('.sidebar-link[aria-current] .nav-icon').evaluate((el) => getComputedStyle(el.parentElement).backgroundColor);
      check(actual === tint, `${route} pastel identity: ${actual}`);
    }
    if (['learn/', 'speak/', 'settings/'].includes(route)) await shot(`desktop-${area}`);
  }
  const settings = await page.evaluate(() => JSON.parse(localStorage.getItem('lg:settings:v1')));
  check(settings.theme === 'light' && settings.level === 'a2' && settings.dailyGoal === 100 && settings.speechRate === 0.85, 'legacy preferences migrate without data loss');
  check(await page.locator('html').evaluate((el) => getComputedStyle(el).colorScheme) === 'light', 'dark device stays light');
  // Text remains readable on white and pastel surfaces.
  const ratios = await page.evaluate(() => {
    const luminance = (color) => {
      const channels = color.match(/[\d.]+/g).slice(0, 3).map(Number).map((n) => n / 255).map((n) => n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4);
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    const ratio = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    return [...document.querySelectorAll('.sidebar-link, .breadcrumbs [aria-current], .main-content h1, .text-muted')].filter((el) => el.getClientRects().length).map((el) => {
      let parent = el;
      while (parent && getComputedStyle(parent).backgroundColor === 'rgba(0, 0, 0, 0)') parent = parent.parentElement;
      return ratio(getComputedStyle(el).color, parent ? getComputedStyle(parent).backgroundColor : 'rgb(255, 255, 255)');
    });
  });
  check(ratios.every((ratio) => ratio >= 4.5), 'navigation and reading text meet AA contrast');
  // Direct anchors, sticky positioning, and history.
  await page.goto(base + 'a1/01-begruessung/#vocabulary', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelector('[data-section-link][aria-current]')?.getAttribute('href') === '#vocabulary');
  const bounds = await page.evaluate(() => ({ header: document.querySelector('.location-header').getBoundingClientRect().bottom, nav: document.querySelector('.local-nav').getBoundingClientRect(), section: document.querySelector('#vocabulary').getBoundingClientRect().top }));
  check(Math.abs(bounds.header - bounds.nav.top) < 2, 'local tabs sit below the header');
  check(bounds.section >= bounds.nav.bottom - 2, `anchor heading is not hidden: ${JSON.stringify(bounds)}`);
  await page.getByRole('link', { name: 'Practice', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-section-link][aria-current]')?.getAttribute('href') === '#practice');
  await page.goBack();
  await page.waitForFunction(() => document.querySelector('[data-section-link][aria-current]')?.getAttribute('href') === '#vocabulary');
  check(true, 'browser history restores active subsection');
  await page.evaluate(() => document.querySelector('#notes').scrollIntoView({ behavior: 'instant' }));
  await page.waitForFunction(() => document.querySelector('[data-section-link][aria-current]')?.getAttribute('href') === '#notes');
  check(true, 'scroll updates active subsection');
  await shot('desktop-lesson-notes');
  await page.goto(base + 'settings/#audio', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelector('[data-section-link][aria-current]')?.getAttribute('href') === '#audio');
  check(true, 'late-hydrated Settings anchor works');
  await page.goto(base + 'progress/#topics', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelector('[data-section-link][aria-current]')?.getAttribute('href') === '#topics');
  check(true, 'late-hydrated Progress anchor works');
  // Clicking a word, audio, and saving its translation.
  await page.goto(base + 'a1/01-begruessung/', { waitUntil: 'networkidle' });
  const greeting = page.locator('.prose [lang="de"]').filter({ hasText: 'Hallo, Anna!' }).first();
  await greeting.scrollIntoViewIfNeeded();
  const point = await greeting.evaluate((el) => {
    const range = document.createRange(); range.setStart(el.firstChild, 0); range.setEnd(el.firstChild, 5);
    const box = range.getBoundingClientRect(); return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  });
  await page.mouse.click(point.x, point.y);
  await page.getByRole('dialog', { name: 'Translate', exact: true }).waitFor();
  await page.locator('.translate-result').getByText('Hello', { exact: true }).waitFor();
  check(await page.getByLabel('German text').inputValue() === 'Hallo', 'clicked word translates');
  await page.getByRole('button', { name: 'Save to Notebook' }).click();
  check(await page.getByRole('button', { name: 'Saved', exact: true }).isDisabled(), 'translated word saves');
  await shot('desktop-translation');
  await page.keyboard.press('Escape');
  check(await page.getByRole('dialog', { name: 'Translate', exact: true }).count() === 0, 'Escape closes translator');
  await page.goto(base + 'notebook/', { waitUntil: 'networkidle' });
  await page.getByRole('tab', { name: /words/i }).focus();
  await page.keyboard.press('ArrowRight');
  check(await page.getByRole('tab', { name: /notes/i }).getAttribute('aria-selected') === 'true', 'notebook tabs work with keyboard');
  await page.keyboard.press('End');
  check(await page.getByRole('tab', { name: /Mistakes/ }).getAttribute('aria-selected') === 'true', 'notebook End key selects final tab');
  await page.getByRole('tab', { name: /words/i }).click();
  check(await page.getByText('Hallo', { exact: true }).isVisible(), 'saved translation appears in Notebook');
  // Responsive layouts, including a long lesson title, section links, and translator placement.
  for (const width of [768, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const [route] of routes) {
      await page.goto(base + route, { waitUntil: 'networkidle' });
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px /${route} has no horizontal overflow`);
      check(!(await page.locator('.sidebar').isVisible()) && await page.locator('.tabbar').isVisible(), `${width}px mobile navigation`);
    }
    await page.goto(base + 'a1/01-begruessung/#practice', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.querySelector('[data-section-link][aria-current]')?.getAttribute('href') === '#practice');
    await shot(`${width}-lesson-practice`);
    const mobileBounds = await page.evaluate(() => ({ header: document.querySelector('.location-header').getBoundingClientRect().bottom, nav: document.querySelector('.local-nav').getBoundingClientRect(), section: document.querySelector('#practice').getBoundingClientRect().top }));
    check(Math.abs(mobileBounds.header - mobileBounds.nav.top) < 2 && mobileBounds.section >= mobileBounds.nav.bottom - 2, `${width}px sticky tabs and section heading do not overlap`);
    await page.getByRole('button', { name: 'Translate', exact: true }).click();
    const panel = await page.locator('.translate-panel').boundingBox();
    const tabbar = await page.locator('.tabbar').boundingBox();
    check(panel.y >= 0 && panel.y + panel.height < tabbar.y, `${width}px translator fits above navigation`);
    await shot(`${width}-translator`);
    await page.keyboard.press('Escape');
    await page.goto(base + 'learn/', { waitUntil: 'networkidle' });
    await shot(`${width}-learn`);
  }
  // Reduced motion and focus remain available.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  check(await page.locator('html').evaluate((el) => getComputedStyle(el).scrollBehavior) === 'auto', 'reduced-motion preference respected');
  check(failures.length === 0, `browser errors: ${failures.join(', ')}`);
  console.log(`${checks} design acceptance checks passed; no browser errors.`);
} finally { await browser.close(); }
