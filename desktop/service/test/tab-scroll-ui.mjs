// A tab document is longer than the window, and it has to scroll.
//   node desktop/service/test/tab-scroll-ui.mjs
import { expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createService } from '../server.mjs';
import { launchBrowser, desktopAuth } from './browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
await mkdir(path.join(root, '.cache'), { recursive: true });
const repo = await mkdtemp(path.join(root, '.cache', 'tab-scroll-ui-'));
await cp(path.join(root, 'dist'), path.join(repo, 'ui'), { recursive: true });
await cp(path.join(root, 'public/assets'), path.join(repo, 'ui/assets'), { recursive: true });

// A board with one page and one tab whose document is far taller than a window.
const boardFolder = '2026-11-26_long-board';
const pageFolder = 'long';
await mkdir(path.join(repo, 'workspace', boardFolder, pageFolder), { recursive: true });
const nodes = [{ kind: 'section', id: 'head', title: 'The long list', note: '' }];
for (let index = 0; index < 40; index += 1) {
  nodes.push({ kind: 'card', id: 'card-' + index, title: 'Card ' + index, body: 'A card that makes the page taller than the window.' });
}
await writeFile(path.join(repo, 'workspace', boardFolder, pageFolder, 'overview.tab.json'), JSON.stringify({
  format: 'pko-tab', version: 1, layout: 'gallery', summary: 'A page that does not fit.', nodes,
}, 'utf8'));
await writeFile(path.join(repo, 'workspace/workspace.json'), JSON.stringify({
  format: 'pko-vault',
  version: 2,
  boards: [{
    id: 'long-board', title: 'Long Board', description: 'A board with a page that overflows.', tags: ['app-project'],
    created: '2026-11-26', updated: '2026-11-26', folder: boardFolder, status: 'active',
    pages: [{
      id: pageFolder, title: 'Long Page', description: '', tags: ['game-mechanics'],
      created: '2026-11-26', updated: '2026-11-26',
      tabs: [{ id: 'overview', name: 'Overview', path: pageFolder + '/overview.tab.json' }],
    }],
  }],
}, 'utf8'), 'utf8');

const service = await createService({ repo, uiDir: path.join(repo, 'ui'), mcpOptions: { home: repo, env: {} } });
let browser;
try {
  browser = await launchBrowser();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await desktopAuth(context, service.urls.workspace);
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(service.urls.workspace + '#/long-board/long/overview');

  // The last card has to exist before the page is measured.
  await expect(page.locator('.card-entry h2').last()).toHaveText('Card 39');

  // The document is taller than its pane, and the pane is what scrolls.
  const measured = await page.locator('.tab-editor').evaluate(node => ({
    scrollHeight: node.scrollHeight, clientHeight: node.clientHeight, overflowY: getComputedStyle(node).overflowY,
  }));
  assert.ok(measured.scrollHeight > measured.clientHeight, `the document must overflow its pane: ${JSON.stringify(measured)}`);
  assert.notEqual(measured.overflowY, 'hidden', 'the pane must not clip the document');

  // Scrolling to the end brings the last card into view.
  await page.locator('.tab-editor').evaluate(node => { node.scrollTop = node.scrollHeight; });
  await page.waitForTimeout(200);
  const last = await page.locator('.card-entry h2').last().boundingBox();
  const pane = await page.locator('.tab-editor').boundingBox();
  assert.ok(last && pane, 'the last card and the pane are measured');
  assert.ok(last.y + last.height <= pane.y + pane.height + 2, `the last card must be inside the pane: ${JSON.stringify({ last, pane })}`);
  assert.deepEqual(errors, []);
  console.log('Tab scrolling passed: the document overflows the pane, the pane scrolls, and the last card is reachable. Screenshots: ' + repo);
  await page.screenshot({ path: path.join(repo, 'tab-scroll.png') });
} finally { await browser?.close(); await service.close(); }
