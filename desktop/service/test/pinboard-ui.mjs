// The Pinboard end to end: the wall, the picture opened large, the feedback, and
// the hand-off. The service has its own test for the chat a board remembers; this
// one is about the browser and the coordinates it sends.
//   node desktop/service/test/pinboard-ui.mjs
import { expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createService } from '../server.mjs';
import { launchBrowser, desktopAuth } from './browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const sample = process.env.MRMAK_CARDS_SAMPLE_DIR || path.join(root, 'workspace/2026-09-15_my-dream-game/assets');
await mkdir(path.join(root, '.cache'), { recursive: true });
const repo = await mkdtemp(path.join(root, '.cache', 'pinboard-ui-'));
await cp(path.join(root, 'dist'), path.join(repo, 'ui'), { recursive: true });
await cp(path.join(root, 'public/assets'), path.join(repo, 'ui/assets'), { recursive: true });
await mkdir(path.join(repo, 'workspace', 'lab', 'pinboard', 'media'), { recursive: true });
await cp(path.join(sample, 'c1_gentleman_gpt.webp'), path.join(repo, 'workspace', 'lab', 'pinboard', 'media', 'silk.webp'));
const document = {
  format: 'pko-tab', version: 1, layout: 'pinboard', summary: 'References for the cast.',
  nodes: [{ kind: 'card', id: 'first', title: 'The silk figure', body: 'The dark one.', image: 'media/silk.webp', alt: 'A figure in silk' }],
};
await writeFile(path.join(repo, 'workspace', 'lab', 'pinboard', 'content.tab.json'), JSON.stringify(document, null, 2) + '\n');
const board = {
  id: 'lab', title: 'Arachne Character Lab', description: '', tags: ['gallery'], status: 'active',
  folder: 'lab', created: '2026-01-01', updated: '2026-01-01',
  pages: [{ id: 'pinboard', title: 'Pinboard', description: '', tags: ['3d'], created: '2026-01-01', updated: '2026-01-01', tabs: [{ id: 'content', name: 'Pinboard', path: 'pinboard/content.tab.json' }] }],
};
await writeFile(path.join(repo, 'workspace/workspace.json'), JSON.stringify({ format: 'pko-vault', version: 2, boards: [board] }));
const service = await createService({ repo, uiDir: path.join(repo, 'ui'), mcpOptions: { home: repo, env: {} } });
const handoffs = [];
let browser;
try {
  browser = await launchBrowser();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await desktopAuth(context, service.urls.workspace);
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/workspace/hand-off', route => {
    handoffs.push(route.request().postDataJSON());
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessionId: 'chat-1', message: '', chat: { id: 'chat-1', name: 'Arachne Character Lab', agent: 'codex' } }) });
  });
  await page.goto(service.urls.workspace + '#/lab/pinboard/content');

  // The wall shows the card's picture, and the strip is absent: one tab.
  const wall = page.locator('.card-pinboard');
  await expect(wall).toBeVisible();
  await expect(page.locator('.card-pin')).toHaveCount(1);
  await expect(page.locator('.card-pin-file')).toHaveText(/silk\.webp/);
  await expect(page.getByRole('tablist')).toHaveCount(0);

  // Choosing it opens the picture large, with the pen and the feedback field.
  await page.locator('.card-pin-hit').click();
  const dialog = page.locator('.card-pinboard-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.card-pinboard-title')).toHaveText('The silk figure');
  await expect(dialog.locator('.card-stage img')).toBeVisible();

  await dialog.locator('.card-feedback-text').fill('Looser folds here.');
  await dialog.getByRole('button', { name: "Send to the board's agent" }).click();
  await expect(dialog.locator('.card-pinboard-status')).toHaveText(/sent to Arachne Character Lab/);

  // The hand-off carries the four coordinates and nothing else.
  assert.equal(handoffs.length, 1);
  assert.deepEqual(handoffs[0], { boardId: 'lab', pageId: 'pinboard', tabId: 'content', cardId: 'first' });
  // Sending saved the feedback into the document the agent will read.
  const saved = JSON.parse(await readFile(path.join(repo, 'workspace', 'lab', 'pinboard', 'content.tab.json'), 'utf8'));
  assert.equal(saved.nodes[0].feedback, 'Looser folds here.');
  assert.deepEqual(errors, []);
  console.log('Pinboard passed: the wall, the picture opened large, the feedback saved into the card, the hand-off naming board/page/tab/card. Screenshots: ' + repo);
  await page.screenshot({ path: path.join(repo, 'pinboard.png'), fullPage: true });
} finally { await browser?.close(); await service.close(); }
