// The tab editor end to end: a board is born empty, a page gets its folder, a
// tab gets its document, and the document is edited and saved in the browser.
//   node desktop/service/test/cards-ui.mjs
import { expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createService } from '../server.mjs';
import { launchBrowser, desktopAuth } from './browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
await mkdir(path.join(root, '.cache'), { recursive: true });
const repo = await mkdtemp(path.join(root, '.cache', 'cards-ui-'));
await cp(path.join(root, 'dist'), path.join(repo, 'ui'), { recursive: true });
await cp(path.join(root, 'public/assets'), path.join(repo, 'ui/assets'), { recursive: true });
await mkdir(path.join(repo, 'workspace'), { recursive: true });
await writeFile(path.join(repo, 'workspace/workspace.json'), JSON.stringify({ format: 'pko-vault', version: 2, boards: [] }));
const service = await createService({ repo, uiDir: path.join(repo, 'ui'), mcpOptions: { home: repo, env: {} } });
let browser;
try {
  browser = await launchBrowser();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await desktopAuth(context, service.urls.workspace);
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(service.urls.workspace);

  // A board is born with no pages.
  await page.getByRole('button', { name: '+ New board', exact: true }).click();
  const boardDialog = page.getByRole('dialog', { name: 'New board' });
  await boardDialog.getByLabel('Board title').fill('My editable board');
  await boardDialog.getByLabel('What is this board for?').fill('Everything about the editable board.');
  await boardDialog.getByRole('button', { name: 'App Project', exact: true }).click();
  await boardDialog.getByRole('button', { name: 'Create board', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My editable board', exact: true })).toBeVisible();
  await expect(page.getByText('No page yet. A page is a folder for one topic - make the first one.')).toBeVisible();
  const boardId = new URL(page.url()).hash.slice(2).split('/')[0];
  const created = JSON.parse(await readFile(path.join(repo, 'workspace/workspace.json'), 'utf8')).boards.find(item => item.id === boardId);
  const folder = created.folder;

  // A page gets its own folder and a first tab.
  await page.getByRole('button', { name: '+ New page', exact: true }).click();
  const pageDialog = page.getByRole('dialog', { name: 'New page' });
  await pageDialog.getByLabel('Page title').fill('Game Mechanics');
  await pageDialog.getByRole('button', { name: 'Game Mechanics', exact: true }).click();
  await pageDialog.getByRole('button', { name: 'Gallery', exact: true }).click();
  await pageDialog.getByRole('button', { name: 'Create page', exact: true }).click();
  await expect(page.locator('.tab-editor')).toBeVisible();
  assert.equal(new URL(page.url()).hash.split('/').length, 3, 'the page opens on its first tab');
  const documentFile = path.join(repo, 'workspace', folder, 'game-mechanics', 'overview.tab.json');
  assert.equal(JSON.parse(await readFile(documentFile, 'utf8')).format, 'pko-tab');

  // The document is edited as blocks: a heading, then a card.
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('button', { name: '+ Heading', exact: true }).click();
  await page.getByRole('button', { name: '+ Card', exact: true }).click();
  await page.getByLabel('Heading', { exact: true }).fill('The loop');
  await page.getByLabel('Card title', { exact: true }).fill('One tick');
  await page.getByLabel(/^Notes/).first().fill('Sixty a second.');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved.', { exact: true })).toBeVisible();

  const saved = JSON.parse(await readFile(documentFile, 'utf8'));
  assert.deepEqual(saved.nodes.map(node => [node.kind, node.title]), [['section', 'The loop'], ['card', 'One tick']]);
  assert.equal(saved.nodes[1].body, 'Sixty a second.');

  // The saved document is what the browser renders, after a reload too.
  await page.reload();
  await expect(page.locator('.tab-section h2')).toHaveText('The loop');
  await expect(page.locator('.card-entry h2')).toHaveText('One tick');
  assert.deepEqual(errors, []);
  console.log('Tab editor passed: empty board, page folder, tab document, heading and card saved, rendered after reload. Screenshots: ' + repo);
  await page.screenshot({ path: path.join(repo, 'tab-editor.png'), fullPage: true });
} finally { await browser?.close(); await service.close(); }
