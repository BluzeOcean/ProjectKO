// The Vaultspace archive. A board is put away from the deck itself - one
// click on Archive beside the way in - and the boards that are put away are
// found from the deck too, where they can be brought back in one click.
//
//   node desktop/service/test/deck-archive-ui.mjs
import { expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, cp } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createService } from '../server.mjs';
import { localDay } from '../workspace.mjs';
import { launchBrowser, desktopAuth } from './browser.mjs';

// Real built UI and isolated service; never mutates the owner's Vault.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
await mkdir(path.join(root, '.cache'), { recursive: true });
const repo = await mkdtemp(path.join(root, '.cache', 'deck-archive-ui-'));
await mkdir(path.join(repo, 'workspace', 'sample'), { recursive: true });
await writeFile(path.join(repo, 'workspace', 'sample', 'report.html'), '<h1>Notes</h1><p>The report must survive.</p>');
const card = { id: 'sample', title: 'Character Workshop', description: 'A reviewable sample.', category: 'research', type: 'group', folder: 'sample', status: 'active', created: localDay(), steps: [{ name: 'Notes', path: 'report.html' }] };
// The third board has been quiet for years: the date rule puts it away on its
// own, without anybody asking.
const quiet = { ...card, id: 'old', title: 'Old Project', category: 'game', created: '2020-01-01' };
await writeFile(path.join(repo, 'workspace', 'workspace.json'), JSON.stringify({ entities: [card, { ...card, id: 'other', title: 'Another project', category: 'game' }, quiet] }));
await cp(path.join(root, 'public', 'assets'), path.join(root, 'dist', 'assets'), { recursive: true });
const service = await createService({ repo, uiDir: path.join(root, 'dist') });
let browser;
try {
  browser = await launchBrowser();
  const context = await browser.newContext({ viewport: { width: 1200, height: 860 } });
  await desktopAuth(context, service.urls.workspace);
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(service.urls.workspace);

  const inspector = page.locator('.deck-inspector');
  const toggle = page.getByRole('button', { name: /Archived \(1\)/ });

  // The quiet board is already in the archive, so the deck says so.
  await expect(toggle).toBeVisible();
  await expect(page.locator('.deck-tile[data-card="old"]')).toHaveCount(0);

  // The archive opens in the deck, and holds the quiet board.
  await toggle.click();
  await expect(page.locator('.deck-label')).toHaveText('Archive');
  await expect(page.locator('.deck-tile[data-card="old"]')).toHaveCount(1);
  await expect(page.locator('.deck-tile[data-card="sample"]')).toHaveCount(0);

  // A board that is in the archive by the date rule is brought back by the
  // same button, and it says Restore, not Archive.
  await page.locator('.deck-tile[data-card="old"]').hover();
  await expect(inspector).toHaveAttribute('data-card', 'old');
  await inspector.getByRole('button', { name: 'Bring Old Project back' }).click();
  await expect(page.locator('.deck-label')).toHaveText('Boards');
  await expect(page.locator('.deck-tile[data-card="old"]')).toHaveCount(1);
  await expect(toggle).toHaveCount(0);

  // Putting a board away is one click, beside the way in.
  await page.locator('.deck-tile[data-card="sample"]').hover();
  await expect(inspector).toHaveAttribute('data-card', 'sample');
  await inspector.getByRole('button', { name: 'Archive Character Workshop' }).click();
  await expect(page.locator('.deck-tile[data-card="sample"]')).toHaveCount(0);
  await expect(page.locator('.deck-note')).toContainText('archived');

  // The board keeps its files: archiving is a status, not a deletion.
  assert.equal(await readFile(path.join(repo, 'workspace', 'sample', 'report.html'), 'utf8'), '<h1>Notes</h1><p>The report must survive.</p>');

  // The deck now says what is in the archive and where to find it.
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(page.locator('.deck-tile[data-card="sample"]')).toHaveCount(1);

  // And a board that is put away can be brought back in one click.
  await page.locator('.deck-tile[data-card="sample"]').hover();
  await inspector.getByRole('button', { name: 'Bring Character Workshop back' }).click();

  // The board comes back to the working boards, and the empty archive closes
  // behind it, so the view is never a dead end.
  await expect(page.locator('.deck-label')).toHaveText('Boards');
  await expect(toggle).toHaveCount(0);
  await expect(page.locator('.deck-tile[data-card="sample"]')).toHaveCount(1);
  assert.equal(JSON.parse(await readFile(path.join(repo, 'workspace', 'workspace.json'))).entities[0].status, 'active', 'the board is active again');

  // The status dialog still offers Archived, next to the new button.
  await page.locator('.deck-tile[data-card="sample"]').hover();
  await inspector.getByRole('button', { name: /^Edit Character Workshop:/ }).click();
  const menu = page.getByRole('dialog', { name: 'Card settings: Character Workshop' });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('button', { name: 'Archived', exact: true })).toBeVisible();

  await page.screenshot({ path: path.join(repo, 'deck-archive.png') });
  assert.deepEqual(errors, [], 'the deck raised no error');
  console.log(JSON.stringify({ ok: true, screenshot: path.join(repo, 'deck-archive.png'), checks: ['the date rule fills the archive', 'the archive opens in the deck', 'a quiet board is restored', 'archive in one click', 'the board leaves the deck', 'the files stay', 'the archive is announced', 'restore in one click', 'the empty archive is not a dead end', 'the status dialog still offers Archived'] }));
} finally { await browser?.close(); await service.close(); }
