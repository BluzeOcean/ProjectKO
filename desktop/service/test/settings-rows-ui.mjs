// A look at the settings panel in its new shape.
//
//   node desktop/service/test/settings-rows-ui.mjs
import { expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, cp } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createService } from '../server.mjs';
import { launchBrowser, desktopAuth } from './browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
await mkdir(path.join(root, '.cache'), { recursive: true });
const repo = await mkdtemp(path.join(root, '.cache', 'settings-rows-ui-'));
await mkdir(path.join(repo, 'workspace/test'), { recursive: true });
await cp(path.join(root, 'public/assets'), path.join(root, 'dist/assets'), { recursive: true });
await writeFileVault(repo);

async function writeFileVault(dir) {
  const { writeFile } = await import('node:fs/promises');
  await writeFile(path.join(dir, 'workspace/workspace.json'), JSON.stringify({ format: 'pko-vault', version: 2, boards: [{ id: 'test', folder: 'test', title: 'Settings check', sample: true, tags: ['app-project'], created: '2026-10-02', updated: '2026-10-02', status: 'active', pages: [] }] }));
}

const service = await createService({ repo, uiDir: path.join(root, 'dist'), mcpOptions: { home: repo, env: {} } });
let browser;
try {
  browser = await launchBrowser();
  const context = await browser.newContext({ viewport: { width: 1300, height: 920 } });
  await desktopAuth(context, service.urls.workspace);
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));

  await page.goto(service.urls.workspace);
  await page.getByRole('button', { name: 'Toggle settings', exact: true }).click();
  await expect(page.locator('.workspace-settings')).toBeVisible();

  // The list: one row per group, in blocks of two.
  const rows = await page.locator('.settings-row-link').count();
  if (rows !== 9) throw new Error(`the panel lists ${rows} groups, expected 9`);
  const blocks = await page.locator('.settings-rows-block').count();
  if (blocks !== 5) throw new Error(`the panel has ${blocks} blocks, expected 5`);
  await page.screenshot({ path: path.join(repo, 'settings-list.png') });

  // A row opens its group, and the back button returns to the list.
  await page.getByRole('button', { name: /^Chats/ }).click();
  await expect(page.locator('.settings-detail')).toBeVisible();
  await expect(page.locator('.settings-row-help').first()).toBeVisible();
  await page.screenshot({ path: path.join(repo, 'settings-chats.png') });
  await page.getByRole('button', { name: 'All settings' }).click();
  await expect(page.locator('.settings-rows')).toBeVisible();

  // The Appearance page draws itself.
  await page.getByRole('button', { name: /^Appearance/ }).click();
  await expect(page.locator('.settings-theme-dots')).toBeVisible();
  const dots = await page.locator('.settings-theme-dot').count();
  if (dots < 16) throw new Error(`the theme page shows ${dots} swatches, expected the fifteen palettes and System`);
  await page.screenshot({ path: path.join(repo, 'settings-appearance.png') });

  // The search narrows the list.
  await page.getByRole('button', { name: 'All settings' }).click();
  await page.getByLabel('Search settings').fill('quota');
  await page.waitForTimeout(150);
  const found = await page.locator('.settings-row-link').count();
  if (found !== 1) throw new Error(`the search left ${found} rows, expected 1`);
  await page.getByLabel('Search settings').fill('');
  await page.waitForTimeout(150);

  assert.deepEqual(errors, []);
  console.log('Settings rows passed: nine groups in five blocks, drill-down, the Appearance page, and the search. Screenshots: ' + repo);
} finally { await browser?.close(); await service.close(); }
