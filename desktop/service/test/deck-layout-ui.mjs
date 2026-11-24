// Real built UI and isolated service; never mutates the user's Workspace.
import { expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, cp } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createService } from '../server.mjs';
import { localDay } from '../workspace.mjs';
import { launchBrowser, desktopAuth } from './browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
await mkdir(path.join(root, '.cache'), { recursive: true });
const repo = await mkdtemp(path.join(root, '.cache', 'deck-layout-ui-'));
await mkdir(path.join(repo, 'workspace', 'sample'), { recursive: true });
await writeFile(path.join(repo, 'workspace', 'sample', 'report.html'), '<h1>Project notes</h1>');
const base = { description: 'A reviewable sample.', category: 'research', type: 'group', folder: 'sample', status: 'active', created: localDay(), steps: [{ name: 'Notes', path: 'report.html' }] };
await writeFile(path.join(repo, 'workspace', 'workspace.json'), JSON.stringify({ entities: [
  { ...base, id: 'sample', title: 'Character Workshop' },
  { ...base, id: 'second', title: 'Second Board', category: 'image-gen' },
] }));
await cp(path.join(root, 'public', 'assets'), path.join(root, 'dist', 'assets'), { recursive: true });
const service = await createService({ repo, uiDir: path.join(root, 'dist') });
let browser;
try {
  browser = await launchBrowser();
  const context = await browser.newContext({ viewport: { width: 1400, height: 860 } });
  await desktopAuth(context, service.urls.workspace);
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(service.urls.workspace);
  await page.locator('.deck-tile').first().waitFor();
  // The Files panel takes its room from the deck, so the deck is measured
  // with the panel open - the narrowest the deck gets at a given window.
  await page.getByRole('button', { name: 'Toggle files' }).click();
  await page.locator('.files-panel').waitFor();

  const measure = () => page.evaluate(() => {
    const width = selector => Math.round(document.querySelector(selector).getBoundingClientRect().width);
    const inspector = document.querySelector('.deck-inspector');
    const stage = document.querySelector('.deck-stage');
    return {
      deck: width('.deck-page'), stage: width('.deck-stage'),
      inspector: Math.round(inspector.getBoundingClientRect().width),
      shown: getComputedStyle(inspector).display !== 'none',
      scrolls: stage.scrollWidth > stage.clientWidth + 1,
    };
  });

  await page.setViewportSize({ width: 1400, height: 860 });
  const wide = await measure();
  assert.equal(wide.shown, true, 'the inspector is there in a wide window');
  assert.ok(wide.inspector >= 340, `the inspector takes a share of a wide deck: ${wide.inspector}px`);
  assert.ok(wide.stage > wide.inspector, 'the boards keep the larger share of a wide deck');
  assert.equal(wide.scrolls, false, 'the board list never scrolls sideways');

  await page.setViewportSize({ width: 900, height: 860 });
  const narrow = await measure();
  assert.equal(narrow.shown, true, 'the inspector is still there in a narrow window');
  assert.ok(narrow.inspector < wide.inspector, `the inspector gives room back as the deck narrows: ${narrow.inspector}px < ${wide.inspector}px`);
  assert.ok(narrow.inspector >= 250, `the inspector keeps a readable width: ${narrow.inspector}px`);
  assert.ok(narrow.stage > narrow.inspector, 'the boards keep the larger share of a narrow deck');
  assert.equal(narrow.scrolls, false, 'the board list never scrolls sideways');

  await page.setViewportSize({ width: 700, height: 860 });
  const tight = await measure();
  assert.equal(tight.shown, false, 'the inspector leaves when the deck cannot carry both');
  assert.equal(tight.stage, tight.deck, 'the boards keep the whole deck');
  assert.equal(tight.scrolls, false, 'the board list never scrolls sideways');

  // The tree calls the project folder after the app, not after the fork.
  assert.equal(await page.locator('.file-root-row span').first().textContent(), 'PROJECT-KO');
  assert.equal(await page.locator('.files-panel footer button').textContent(), 'PROJECT-KO root');
  assert.deepEqual(errors, []);
  console.log(`Deck layout passed: the inspector follows the deck, leaves when the deck is too narrow, the board list never scrolls sideways, and the tree calls the folder PROJECT-KO. Screenshots: ${repo}`);
} finally { await browser?.close(); await service.close(); }
