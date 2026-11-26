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
const repo = await mkdtemp(path.join(root, '.cache', 'workspace-edit-ui-'));
await mkdir(path.join(repo, 'workspace', 'sample'), { recursive: true });
const report = '<h1>Project notes</h1><p>The report must survive metadata edits.</p>';
await writeFile(path.join(repo, 'workspace', 'sample', 'report.html'), report);
const file = path.join(repo, 'workspace', 'workspace.json');
const page = () => ({ id: 'notes', title: 'Notes', description: '', tags: ['game-idea'], created: localDay(), updated: localDay(), tabs: [{ id: 'notes', name: 'Notes', path: 'report.html', viewer: 'report' }] });
const board = { id: 'sample', title: 'Character Workshop', description: 'A reviewable sample.', tags: ['research'], status: 'active', folder: 'sample', created: localDay(), updated: localDay(), pages: [page()] };
await writeFile(file, JSON.stringify({ format: 'pko-vault', version: 2, boards: [board, { ...board, id: 'other', title: 'Another project', tags: ['gallery'], folder: 'other', pages: [] }, { ...board, id: 'old', title: 'Older project', created: '2020-01-01', updated: '2020-01-01', pages: [] }] }));
await cp(path.join(root, 'public', 'assets'), path.join(root, 'dist', 'assets'), { recursive: true });
const service = await createService({ repo, uiDir: path.join(root, 'dist') });
let browser;
try {
  browser = await launchBrowser();
  const context = await browser.newContext({ viewport: { width: 1100, height: 820 } });
  await desktopAuth(context, service.urls.workspace);
  const page = await context.newPage(), peer = await context.newPage();
  page.setDefaultTimeout(15000); peer.setDefaultTimeout(15000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(service.urls.workspace); await peer.goto(service.urls.workspace);
  const homeCard = page.locator('.deck-tile[data-card="sample"]');
  const inspector = page.locator('.deck-inspector');
  // Pointing at a board is what puts it in the inspector column.
  const point = async (target, id) => { await target.hover(); await expect(page.locator('.deck-inspector')).toHaveAttribute('data-card', id); };
  const dot = () => inspector.getByRole('button', { name: /^Edit Character Workshop:/ });
  const menu = page.getByRole('dialog', { name: 'Board settings: Character Workshop' });
  await point(homeCard, 'sample');
  await dot().click(); await expect(menu).toBeVisible();
  assert.equal(new URL(page.url()).hash, '', 'The status button must not follow the card link');
  await menu.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(menu).toHaveCount(0);
  await point(homeCard, 'sample');
  await expect(dot()).toHaveAttribute('aria-label', 'Edit Character Workshop: Done');
  await peer.locator('.deck-tile[data-card="sample"]').hover();
  await expect(peer.locator('.deck-inspector .entity-status-button')).toHaveAttribute('aria-label', 'Edit Character Workshop: Done');
  await point(homeCard, 'sample');
  // Tags are toggles in the inspector now: a board can carry more than one.
  await inspector.getByRole('button', { name: 'App Project', exact: true }).click();
  await expect(inspector.getByRole('button', { name: 'App Project', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.deck-genres')).toContainText('App Project');
  await point(homeCard, 'sample');
  await dot().click(); await menu.getByRole('button', { name: 'Archived', exact: true }).click();
  await expect(homeCard).toHaveCount(0);
  assert.equal(await readFile(path.join(repo, 'workspace', 'sample', 'report.html'), 'utf8'), report);
  await page.getByRole('button', { name: 'Show menu', exact: true }).click();
  await page.getByRole('button', { name: /Show archive/ }).click();
  const row = page.locator('.sidebar [data-card="sample"]');
  await row.getByRole('button').click();
  await menu.getByRole('button', { name: 'Active', exact: true }).click();
  await expect(row.getByRole('button')).toHaveAttribute('aria-label', 'Edit Character Workshop: Active');
  await page.getByRole('button', { name: /Hide archive/ }).click();
  await expect(homeCard).toBeVisible();
  // A date-archived card can be brought back even if its stored status is active.
  await page.getByRole('textbox', { name: 'Search boards and pages' }).fill('Older project');
  await page.locator('.sidebar [data-card="old"] button').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Active', exact: true }).click();
  await page.getByRole('button', { name: 'Clear search', exact: true }).click();
  await expect(page.locator('.deck-tile[data-card="old"]')).toBeVisible();
  await row.getByRole('button').click(); await menu.getByRole('button', { name: 'Pin board', exact: true }).click();
  await expect(row.locator('a')).toHaveClass(/pinned/);
  await row.getByRole('button').click(); await menu.getByRole('button', { name: 'Unpin board', exact: true }).click();
  await expect(row.locator('a')).not.toHaveClass(/pinned/);
  await row.getByRole('button').focus(); await page.keyboard.press('Enter'); await expect(menu).toBeVisible();
  await page.keyboard.press('Escape'); await expect(menu).toHaveCount(0); await expect(row.getByRole('button')).toBeFocused();
  await row.getByRole('button').click(); await page.mouse.click(800, 15); await expect(menu).toHaveCount(0);
  // Failed writes stay visible and never pretend the status changed.
  await page.route('**/api/workspace/boards/sample', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Fixture: service temporarily unavailable.' }) }));
  await row.getByRole('button').click(); await menu.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(menu.getByRole('alert')).toHaveText('Fixture: service temporarily unavailable.');
  await expect(row.getByRole('button')).toHaveAttribute('aria-label', 'Edit Character Workshop: Active');
  await page.unroute('**/api/workspace/boards/sample');
  await menu.getByRole('button', { name: 'Done', exact: true }).click(); await expect(menu).toHaveCount(0);
  // The selected report also has an always-accessible status button.
  // A board link opens the page grid; the page holds the report.
  await row.getByRole('link').click();
  await page.locator('.deck-tile[data-card="notes"]').click();
  await page.frameLocator('iframe.report-frame').getByRole('heading', { name: 'Project notes' }).waitFor();
  await page.locator('.topbar').getByRole('button', { name: 'Edit Character Workshop: Done' }).click();
  // Let the save land before reloading; WebKit cancels in-flight requests on reload.
  const saved = page.waitForResponse(response => response.url().includes('/api/workspace/boards/sample') && response.request().method() === 'PATCH');
  await menu.getByRole('button', { name: 'Active', exact: true }).click(); await saved;
  await page.reload();
  await expect(page.locator('.topbar').getByRole('button', { name: 'Edit Character Workshop: Active' })).toBeVisible();
  for (const theme of ['dark', 'light']) {
    await page.evaluate(theme => document.documentElement.dataset.workspaceTheme = theme, theme);
    for (const width of [1100, 390]) {
      await page.setViewportSize({ width, height: 740 });
      const control = page.locator('.topbar .entity-status-button');
      await control.click();
      await expect(menu).toBeVisible();
      const rect = await menu.boundingBox();
      assert.ok(rect.x >= 10 && rect.y >= 10 && rect.x + rect.width <= width - 10 && rect.y + rect.height <= 730, JSON.stringify(rect));
      const color = await menu.evaluate(element => getComputedStyle(element).backgroundColor);
      assert.equal(color, theme === 'light' ? 'rgb(255, 255, 255)' : 'rgb(19, 19, 22)');
      await page.screenshot({ path: path.join(repo, `menu-${theme}-${width}.png`) });
      await page.keyboard.press('Escape');
    }
  }
  const registry = JSON.parse(await readFile(file, 'utf8'));
  assert.deepEqual(registry.boards.find(item => item.id === 'sample').pages, board.pages);
  assert.ok(registry.boards.find(item => item.id === 'sample').tags.includes('app-project'), 'the tag assigned in the inspector is kept');
  assert.deepEqual(errors, []);
  console.log(`Workspace controls passed: status/category/pin, archive and restore, date archive, live peer sync, keyboard/focus, error/retry, report preservation, persisted reload, dark/light and 390px layout. Screenshots: ${repo}`);
} finally { await browser?.close(); await service.close(); }
