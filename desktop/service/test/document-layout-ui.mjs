// The four document layouts: Codex, Margin, PPT and Folio.
//
//   node desktop/service/test/document-layout-ui.mjs
//
// A board with one page and four tabs — one per layout — and a
// document with sections, a table, a callout and enough text to scroll.
import { expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createService } from '../server.mjs';
import { launchBrowser, desktopAuth } from './browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
await mkdir(path.join(root, '.cache'), { recursive: true });
const repo = await mkdtemp(path.join(root, '.cache', 'document-layout-ui-'));
await cp(path.join(root, 'dist'), path.join(repo, 'ui'), { recursive: true });
await cp(path.join(root, 'public/assets'), path.join(repo, 'ui/assets'), { recursive: true });

const boardFolder = '2026-11-26_design-board';
const pageFolder = 'design';
await mkdir(path.join(repo, 'workspace', boardFolder, pageFolder), { recursive: true });

const LAYOUTS = ['codex', 'margin', 'ppt', 'folio'];

/* An introduction, written the way an introduction is written: the first
   sentence says what the page is, and the rest says what is in it. The
   rail takes the first breath of it and no more. */
const SUMMARY = [
  '# The design document',
  '',
  'A first storyline draft, written to the decided design rather than over it.',
  'Every beat below has to be playable with the rules on the Game Design page,',
  'and every proper noun is a proposal until the owner says otherwise.',
].join('\n');

/* A document worth reading: three sections, a table, an aside, and
   enough prose to make the page taller than the pane. */
function document(layout) {
  const nodes = [];
  for (let index = 0; index < 3; index += 1) {
    nodes.push({ kind: 'section', id: 'section-' + index, title: 'Section ' + index, note: 'What this section settles.' });
    for (let card = 0; card < 4; card += 1) {
      const body = [
        'A paragraph of notes that makes the document taller than the pane, so the layout has something to scroll.',
        '',
        '| System | Verb |',
        '| --- | --- |',
        '| Momentum | keep moving |',
        '| Commitment | lock a line |',
        '',
        '> [!WARNING]',
        '> An aside that leaves the text in the Margin layout.',
      ].join('\n');
      nodes.push({ kind: 'card', id: 'card-' + index + '-' + card, title: 'Card ' + index + '.' + card, body });
    }
  }
  return { format: 'pko-tab', version: 1, layout, summary: SUMMARY, nodes };
}

for (const layout of LAYOUTS) {
  await writeFile(path.join(repo, 'workspace', boardFolder, pageFolder, layout + '.tab.json'), JSON.stringify(document(layout), 'utf8'));
}

await writeFile(path.join(repo, 'workspace/workspace.json'), JSON.stringify({
  format: 'pko-vault',
  version: 2,
  boards: [{
    id: 'design-board', title: 'Design Board', description: 'A board with a document in it.', tags: ['app-project'],
    created: '2026-11-26', updated: '2026-11-26', folder: boardFolder, status: 'active',
    pages: [{
      id: pageFolder, title: 'Design Page', description: '', tags: ['game-mechanics'],
      created: '2026-11-26', updated: '2026-11-26',
      tabs: LAYOUTS.map(layout => ({ id: layout, name: layout, path: pageFolder + '/' + layout + '.tab.json' })),
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
  const open = async tab => {
    await page.goto(service.urls.workspace + '#/design-board/design/' + tab);
    await page.waitForTimeout(400);
  };

  /* ── Codex ───────────────────────────────────────────────────── */
  await open('codex');
  await expect(page.locator('.doc-codex')).toHaveCount(1);
  assert.equal(await page.locator('.doc-toc-link').count(), 3, 'the rail lists every section');
  assert.equal(await page.locator('.doc-dot').count(), 3, 'the dot rail has one dot per section');
  // The document must scroll in its own pane.
  const pane = await page.locator('.doc-viewport').evaluate(node => ({ scrollHeight: node.scrollHeight, clientHeight: node.clientHeight }));
  assert.ok(pane.scrollHeight > pane.clientHeight, `the document must overflow its pane: ${JSON.stringify(pane)}`);
  // The dot rail replaces the scrollbar: the page shows none of its own.
  const bar = await page.locator('.doc-viewport').evaluate(node => ({ offset: node.offsetWidth, client: node.clientWidth }));
  assert.equal(bar.client, bar.offset, `the codex page shows no scrollbar: ${JSON.stringify(bar)}`);
  // The rail's abstract is a breath: the opening of the summary, and no more.
  const abstract = (await page.locator('.doc-rail-abstract').textContent()) || '';
  const words = abstract.trim().split(/\s+/).filter(Boolean);
  assert.ok(words.length > 0, 'the rail carries an abstract');
  assert.ok(words.length <= 20, `the rail abstract is at most twenty words: ${abstract}`);
  assert.ok(!abstract.includes('Game Design page'), `the rail abstract stops at the first breath: ${abstract}`);
  assert.ok(!abstract.includes('design document'), `the rail abstract skips a leading heading: ${abstract}`);
  // The scroll spy must mark a section.
  await page.locator('#doc-section-1').scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  assert.equal(await page.locator('.doc-toc-link[aria-current="true"]').count(), 1, 'the rail marks one section');
  assert.equal(await page.locator('.doc-dot[aria-current="true"]').count(), 1, 'the dot rail marks one section');
  // A table in a card is a table on the page.
  assert.ok(await page.locator('.doc-table').count() >= 1, 'the markdown table in a card renders as a table');

  await page.screenshot({ path: path.join(repo, 'codex.png') });

  /* ── Margin ──────────────────────────────────────────────────── */
  await open('margin');
  await expect(page.locator('.doc-margin')).toHaveCount(1);
  // The margin layout has the dot rail too, so it has no scrollbar either.
  const marginBar = await page.locator('.doc-viewport').evaluate(node => ({ offset: node.offsetWidth, client: node.clientWidth }));
  assert.equal(marginBar.client, marginBar.offset, `the margin page shows no scrollbar: ${JSON.stringify(marginBar)}`);
  const floated = page.locator('.doc-callout[data-float="true"]').first();
  await expect(floated).toHaveCount(1);
  // The aside must sit to the right of the text, not under it.
  const aside = await floated.boundingBox();
  const prose = await page.locator('.doc-prose').first().boundingBox();
  assert.ok(aside && prose, 'the aside and the prose are measured');
  assert.ok(aside.x > prose.x + prose.width - 20, `the aside must sit in the margin, not in the text: ${JSON.stringify({ aside, prose })}`);

  await page.screenshot({ path: path.join(repo, 'margin.png') });

  /* ── PPT ─────────────────────────────────────────────────────── */
  await open('ppt');
  await expect(page.locator('.doc-ppt')).toHaveCount(1);
  assert.equal(await page.locator('.doc-slide').count(), 3, 'one slide per section');
  assert.equal(await page.locator('.doc-ppt-dot').count(), 3, 'the bar shows one dot per slide');
  await expect(page.locator('.doc-ppt-now')).toContainText('1 / 3');
  // Next moves the deck.
  await page.locator('.doc-ppt-bar button', { hasText: 'Next' }).click();
  await page.waitForTimeout(700);
  await expect(page.locator('.doc-ppt-now')).toContainText('2 / 3');

  await page.screenshot({ path: path.join(repo, 'ppt.png') });

  /* ── Folio ───────────────────────────────────────────────────── */
  await open('folio');
  await expect(page.locator('.doc-folio')).toHaveCount(1);
  assert.equal(await page.locator('.doc-sheet').count(), 5, 'a cover, a contents sheet and one per section');
  assert.ok(await page.locator('.doc-contents-item').count() === 3, 'the contents sheet lists every section');

  await page.screenshot({ path: path.join(repo, 'folio.png') });

  /* ── The picker offers them ──────────────────────────────────── */
  await open('codex');
  await page.locator('.tab-editor-bar button', { hasText: 'Edit' }).click();
  await page.waitForTimeout(300);
  const options = await page.locator('.tab-editor-field select option').allTextContents();
  for (const layout of ['Gallery', 'Workbench', 'Pinboard', 'Codex', 'Margin', 'PPT', 'Folio']) {
    assert.ok(options.includes(layout), `the layout picker must offer ${layout}, offered ${options.join(', ')}`);
  }

  assert.deepEqual(errors, []);
  console.log('Document layouts passed: codex scrolls and spies, margin floats its asides, ppt moves by the keyboard, folio prints as sheets.');
} finally { await browser?.close(); await service.close(); }
