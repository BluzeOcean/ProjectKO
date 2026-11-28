// The deck's facts, and the one button at the foot of the window.
//
//   node desktop/service/test/deck-facts-ui.mjs
//
// The counts sit on the head of the wall - the level, how many are on screen
// and what is inside them - and there is no band at the foot of the stage.
// The foot of the window carries one practical button: it opens the
// conversation, and the microphone is inside that conversation.
import { expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createService } from '../server.mjs';
import { launchBrowser, desktopAuth } from './browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
await mkdir(path.join(root, '.cache'), { recursive: true });
const repo = await mkdtemp(path.join(root, '.cache', 'deck-facts-ui-'));
await cp(path.join(root, 'dist'), path.join(repo, 'ui'), { recursive: true });
await cp(path.join(root, 'public/assets'), path.join(repo, 'ui/assets'), { recursive: true });
await mkdir(path.join(repo, 'workspace', 'sample'), { recursive: true });

const day = '2026-11-28';
const board = {
  id: 'sample', title: 'IronPath', description: 'A board with two pages.', tags: ['game-project'],
  created: day, updated: day, folder: 'sample', status: 'active',
  pages: [
    { id: 'game-design', title: 'Game Design', tags: ['game-mechanics'], created: day, updated: day, tabs: [
      { id: 'overview', name: 'Briefing', path: 'game-design/overview.tab.json' },
      { id: 'spec', name: 'Spec', path: 'game-design/spec.tab.json' },
    ] },
    { id: 'ui', title: 'UI', tags: ['ui'], created: day, updated: day, tabs: [
      { id: 'screens', name: 'Screens', path: 'ui/screens.tab.json' },
    ] },
  ],
};
await writeFile(path.join(repo, 'workspace/workspace.json'), JSON.stringify({
  format: 'pko-vault', version: 2, boards: [board],
}), 'utf8');

const service = await createService({ repo, uiDir: path.join(repo, 'ui'), mcpOptions: { home: repo, env: {} } });
let browser;
try {
  browser = await launchBrowser();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await desktopAuth(context, service.urls.workspace);
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));

  const head = async () => (await page.locator('.deck-stage-head').innerText()).replace(/\s+/g, ' ').trim();

  /* ── The vault: the boards and the pages they hold ─────────────────── */
  await page.goto(service.urls.workspace);
  await page.locator('.deck-tile').first().waitFor();
  assert.equal(await head(), 'BOARDS 1 · 2 pages', 'the vault head carries the level, the count and what is inside');
  await expect(page.locator('.deck-status')).toHaveCount(0);
  await page.screenshot({ path: path.join(repo, 'vault.png') });

  /* ── The board: the pages and the tabs they hold ───────────────────── */
  await page.goto(service.urls.workspace + '#/sample');
  await page.locator('.deck-tile').first().waitFor();
  assert.equal(await head(), 'PAGES 2 · 3 tabs', 'the board head carries the level, the count and what is inside');
  await expect(page.locator('.deck-status')).toHaveCount(0);
  await page.screenshot({ path: path.join(repo, 'board.png') });

  /* ── The foot of the window: one button, and it opens the talk ────── */
  await expect(page.locator('.voice-nose')).toHaveCount(0);
  assert.equal(await page.locator('.voice-controls button').count(), 1, 'the foot of the window carries one button');
  const toggle = page.getByRole('button', { name: 'Toggle conversation' });
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(page.locator('.voice-panel')).toBeVisible();
  await expect(page.locator('.voice-mic')).toBeVisible();
  assert.equal(await page.locator('.voice-panel .voice-mic').count(), 1, 'the microphone is inside the conversation');

  assert.deepEqual(errors, []);
  console.log('Deck facts passed: the counts sit on the head of the wall, the stage has no foot band, and one button at the foot of the window opens the conversation that carries the microphone. Screenshots: ' + repo);
} finally { await browser?.close(); await service.close(); }
