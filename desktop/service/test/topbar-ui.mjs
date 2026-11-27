// The vault space topbar: the breadcrumb on the left, the open tab's facts on
// the right, and the tab strip on the row below.
//
//   node desktop/service/test/topbar-ui.mjs
import { expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createService } from '../server.mjs';
import { launchBrowser, desktopAuth } from './browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
await mkdir(path.join(root, '.cache'), { recursive: true });
const repo = await mkdtemp(path.join(root, '.cache', 'topbar-ui-'));
await cp(path.join(root, 'dist'), path.join(repo, 'ui'), { recursive: true });
await cp(path.join(root, 'public/assets'), path.join(repo, 'ui/assets'), { recursive: true });

const boardFolder = '2026-11-27_ironpath';
await mkdir(path.join(repo, 'workspace', boardFolder, 'game-design'), { recursive: true });
await mkdir(path.join(repo, 'workspace', boardFolder, 'one-tab'), { recursive: true });

const nodes = [
  { kind: 'section', id: 'section-1', title: 'The loop', note: '' },
  { kind: 'card', id: 'card-1', title: 'One tick', body: 'Sixty a second.', status: 'idea' },
  { kind: 'card', id: 'card-2', title: 'Two ticks', body: 'And a beat.', status: 'idea' },
  { kind: 'section', id: 'section-2', title: 'The feel', note: '' },
  { kind: 'card', id: 'card-3', title: 'Weight', body: 'Heavy.', status: 'idea' },
  { kind: 'card', id: 'card-4', title: 'Snap', body: 'Quick.', status: 'idea' },
];
const document = { format: 'pko-tab', version: 1, layout: 'gallery', summary: '', nodes };
for (const name of ['overview', 'spec', 'solo']) {
  await writeFile(path.join(repo, 'workspace', boardFolder, 'game-design', name + '.tab.json'), JSON.stringify(document), 'utf8');
}
await writeFile(path.join(repo, 'workspace', boardFolder, 'one-tab', 'solo.tab.json'), JSON.stringify(document), 'utf8');

await writeFile(path.join(repo, 'workspace/workspace.json'), JSON.stringify({
  format: 'pko-vault',
  version: 2,
  boards: [{
    id: 'ironpath', title: 'IronPath', description: 'A board with two pages.', tags: ['game-project'],
    created: '2026-11-27', updated: '2026-11-27', folder: boardFolder, status: 'active',
    pages: [
      {
        id: 'game-design', title: 'Game Design Page', tags: ['game-mechanics'],
        created: '2026-11-27', updated: '2026-11-27',
        tabs: [
          { id: 'overview', name: 'Briefing', path: 'game-design/overview.tab.json' },
          { id: 'spec', name: 'Spec', path: 'game-design/spec.tab.json' },
        ],
      },
      {
        id: 'one-tab', title: 'One Tab Page', tags: ['game-mechanics'],
        created: '2026-11-27', updated: '2026-11-27',
        tabs: [{ id: 'solo', name: 'Solo', path: 'one-tab/solo.tab.json' }],
      },
    ],
  }],
}, 'utf8'), 'utf8');

const service = await createService({ repo, uiDir: path.join(repo, 'ui'), mcpOptions: { home: repo, env: {} } });
let browser;
try {
  browser = await launchBrowser();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await desktopAuth(context, service.urls.workspace);
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));

  /* ── Two tabs: the facts share the breadcrumb's row ─────────────────── */
  await page.goto(service.urls.workspace + '#/ironpath/game-design/overview');
  await expect(page.locator('.tab-editor')).toBeVisible();
  await page.waitForTimeout(400);

  const bar = page.locator('.tab-editor-bar');
  await expect(bar).toHaveCount(1);
  assert.equal(await bar.evaluate(node => node.closest('.topbar') ? 'topbar' : 'inline'), 'topbar',
    'the bar is drawn in the topbar, not in the content');
  await expect(page.locator('.tab-editor-count')).toHaveText('4 cards · 2 headings');

  const where = async selector => page.locator(selector).boundingBox();
  const facts = await where('.tab-editor-bar');
  const crumb = await where('.breadcrumb');
  const strip = await where('.step-tabs');
  assert.ok(facts && crumb && strip, 'the topbar is measured');
  assert.ok(Math.abs(facts.y - crumb.y) < 20, `the facts share the breadcrumb's row: ${JSON.stringify({ facts, crumb })}`);
  assert.ok(facts.x > crumb.x, 'the facts are to the right of the breadcrumb');
  assert.ok(strip.y > facts.y + facts.height - 2, `the tab strip is on the row below: ${JSON.stringify({ facts, strip })}`);
  await page.screenshot({ path: path.join(repo, 'two-tabs.png') });

  /* ── The Edit button still opens the editor, from the topbar ─────────── */
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.locator('.tab-edit-body')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('.tab-edit-body')).toHaveCount(0);

  /* ── One tab: no strip, so the row is the breadcrumb and the facts ───── */
  await page.goto(service.urls.workspace + '#/ironpath/one-tab/solo');
  await expect(page.locator('.tab-editor')).toBeVisible();
  await page.waitForTimeout(400);
  const alone = await where('.tab-editor-bar');
  const newTab = await where('.topbar-new-tab');
  assert.ok(alone && newTab, 'the one-tab row is measured');
  assert.ok(alone.x > newTab.x, `the facts are to the right of the new tab button: ${JSON.stringify({ alone, newTab })}`);
  assert.ok(Math.abs(alone.y - newTab.y) < 20, 'the facts share the new tab button\'s row');
  await page.screenshot({ path: path.join(repo, 'one-tab.png') });

  /* ── A board without a tab has no facts ──────────────────────────────── */
  await page.goto(service.urls.workspace + '#/ironpath');
  await page.waitForTimeout(400);
  await expect(page.locator('.tab-editor-bar')).toHaveCount(0);

  assert.deepEqual(errors, []);
  console.log('Topbar passed: the facts sit on the breadcrumb\'s row at the right, the strip below, the editor opens from there. Screenshots: ' + repo);
} finally { await browser?.close(); await service.close(); }
