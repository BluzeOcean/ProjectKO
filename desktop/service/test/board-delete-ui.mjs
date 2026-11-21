// Real built UI and isolated service; never mutates the user's Workspace.
import { expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, cp } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createService } from '../server.mjs';
import { localDay } from '../workspace.mjs';
import { launchBrowser, desktopAuth } from './browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
await mkdir(path.join(root, '.cache'), { recursive: true });
const repo = await mkdtemp(path.join(root, '.cache', 'board-delete-ui-'));
await mkdir(path.join(repo, 'workspace', 'sample'), { recursive: true });
await mkdir(path.join(repo, 'workspace', 'other'), { recursive: true });
const report = '<h1>Project notes</h1><p>The report belongs to the board that is deleted.</p>';
await writeFile(path.join(repo, 'workspace', 'sample', 'report.html'), report);
await writeFile(path.join(repo, 'workspace', 'other', 'report.html'), '<h1>Other</h1>');
const file = path.join(repo, 'workspace', 'workspace.json');
const card = { id: 'sample', title: 'Character Workshop', description: 'A reviewable sample.', category: 'research', type: 'group', folder: 'sample', status: 'active', created: localDay(), steps: [{ name: 'Notes', path: 'report.html' }] };
await writeFile(file, JSON.stringify({ entities: [card, { ...card, id: 'other', title: 'Another project', category: 'game', folder: 'other' }] }));
await cp(path.join(root, 'public', 'assets'), path.join(root, 'dist', 'assets'), { recursive: true });
const native = [];
const service = await createService({ repo, uiDir: path.join(root, 'dist'), native: event => native.push(event) });
let browser;
try {
  browser = await launchBrowser();
  const context = await browser.newContext({ viewport: { width: 1100, height: 820 } });
  await desktopAuth(context, service.urls.workspace);
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(service.urls.workspace);
  const tile = page.locator('.deck-tile[data-card="sample"]');
  await tile.hover();
  const inspector = page.locator('.deck-inspector');
  await expect(inspector).toHaveAttribute('data-card', 'sample');
  // The bin sits beside the way in, on the same row.
  const bin = inspector.getByRole('button', { name: 'Delete Character Workshop' });
  await expect(bin).toBeVisible();
  const row = page.locator('.deck-insp-actions');
  const action = row.locator('.deck-insp-action');
  const actionBox = await action.boundingBox(), binBox = await bin.boundingBox();
  assert.ok(actionBox && binBox, 'the action row must be laid out');
  assert.equal(Math.round(actionBox.y), Math.round(binBox.y), 'the bin shares the row of "Open board"');
  assert.ok(binBox.x > actionBox.x + actionBox.width - 2, 'the bin sits to the right of "Open board"');
  // The confirmation names the board, its steps and its folder.
  const dialog = page.getByRole('dialog', { name: 'Delete this board?' });
  await bin.click();
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Character Workshop');
  await expect(dialog).toContainText('1 — Notes');
  await expect(dialog).toContainText('sample');
  await expect(dialog).toContainText("The files in this board's folder go with it.");
  // Cancel keeps the board and its files.
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(tile).toBeVisible();
  assert.equal(await readFile(path.join(repo, 'workspace', 'sample', 'report.html'), 'utf8'), report);
  // Deleting takes the board away and leaves a quiet note.
  await tile.hover();
  await inspector.getByRole('button', { name: 'Delete Character Workshop' }).click();
  await dialog.getByRole('button', { name: 'Delete board' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(tile).toHaveCount(0);
  await expect(page.locator('.deck-note')).toContainText('Character Workshop');
  await expect(page.locator('.deck-note')).toContainText('deleted');
  const registry = JSON.parse(await readFile(file, 'utf8'));
  assert.deepEqual(registry.entities.map(item => item.id), ['other']);
  // The service never removes the files itself: the folder goes to the trash.
  assert.equal(await readFile(path.join(repo, 'workspace', 'sample', 'report.html'), 'utf8'), report);
  assert.ok(native.some(event => event.type === 'recycle-file' && event.path === path.join(repo, 'workspace', 'sample')));
  assert.deepEqual(errors, []);
  console.log(`Board delete passed: bin beside "Open board", confirmation with the board's facts, cancel keeps it, delete removes the board and hands the folder to the trash. Screenshots: ${repo}`);
} finally { await browser?.close(); await service.close(); }
