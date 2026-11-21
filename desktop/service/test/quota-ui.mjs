// Isolated UI fixture. The quota command is faked, so no account is read and no
// CLI is started: the point is the line, its order and its behaviour.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from '@playwright/test';
import { createService } from '../server.mjs';
import { launchBrowser } from './browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
await mkdir(path.join(root, '.cache'), { recursive: true });
const repo = await mkdtemp(path.join(root, '.cache/quota-ui-'));
await mkdir(path.join(repo, 'workspace')); await mkdir(path.join(repo, '.mrmak'));
await writeFile(path.join(repo, 'workspace/workspace.json'), '{"entities":[]}');

// 6,300,000 ms is 1h 45m; the week is 3% raw at 1.5x, so 5% left.
const reading = (session, week, boost = 1000) => ({
  model_remains: [
    { model_name: 'general', current_interval_remaining_percent: session, remains_time: 6300000, current_weekly_remaining_percent: week, weekly_boost_permille: boost, weekly_remains_time: 90000000 },
    { model_name: 'video', current_interval_remaining_percent: 0, current_weekly_remaining_percent: 0 },
  ],
});

let answer = reading(100, 3, 1500);
let failing = false;
let service, browser;
const errors = [];
try {
  service = await createService({
    repo,
    uiDir: path.join(root, 'dist'),
    mcpOptions: { home: repo, env: {} },
    quotaOptions: { read: async () => { if (failing) throw new Error('mmx quota did not answer'); return answer }, cacheMs: 0 },
  });
  browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 900, height: 760 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(service.urls.chats);

  const quota = page.getByRole('status', { name: 'Agent quota' });
  await expect(quota).toContainText('100%');
  await expect(quota).toContainText('5%');
  await expect(quota).toContainText('1h 45m');

  // The line is the window's own, outside the conversation.
  assert.equal(await page.locator('.chats-surface > .quota-footer').count(), 1, 'footer is a child of the window');
  assert.equal(await page.locator('.chat-body > .quota-footer').count(), 0, 'footer is not in the conversation');

  // The week stands first and the five-hour window last, against its countdown.
  assert.deepEqual(await quota.locator('.qf-pct').allTextContents(), ['5%', '100%']);
  assert.deepEqual(await quota.locator('.qb-track').evaluateAll(nodes => nodes.map(node => node.dataset.tone)), ['low', 'ok']);
  await expect(quota.locator('.qf-reset')).toHaveAttribute('title', /five-hour window resets in 1h 45m/i);

  // A new reading arrives when the window is looked at again, and the colour
  // follows the script's thresholds without being told.
  answer = reading(42, 12);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(quota).toContainText('42%');
  await expect(quota).toContainText('12%');
  assert.deepEqual(await quota.locator('.qb-track').evaluateAll(nodes => nodes.map(node => node.dataset.tone)), ['warm', 'warm']);

  answer = reading(0, 0);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(quota).toContainText('0%');
  assert.deepEqual(await quota.locator('.qb-track').evaluateAll(nodes => nodes.map(node => node.dataset.tone)), ['low', 'low']);
  await expect(quota.locator('.qb-fill').first()).toHaveAttribute('style', /width: 0%/);

  // The line holds at every width the window is allowed to take, and gives up
  // its countdown before it gives up a meter.
  for (const width of [320, 400, 500, 900, 1440]) {
    await page.setViewportSize({ width, height: 760 });
    await expect(quota).toBeVisible();
    assert.equal(await quota.evaluate(node => node.scrollWidth > node.clientWidth + 1), false, 'quota fits ' + width + 'px');
    assert.equal(await quota.locator('.qf-pct').count(), 2, 'two shares at ' + width + 'px');
  }
  await page.setViewportSize({ width: 320, height: 760 });
  await expect(quota.locator('.qf-reset')).toBeHidden();
  await page.setViewportSize({ width: 900, height: 760 });
  await expect(quota.locator('.qf-reset')).toBeVisible();

  // A short window keeps the line: the empty state gives way, not the footer.
  await page.setViewportSize({ width: 900, height: 430 });
  await expect(quota).toBeVisible();
  assert.equal(await quota.evaluate(node => {
    const box = node.getBoundingClientRect();
    return box.bottom <= window.innerHeight + 1 && box.height === 28;
  }), true, 'footer stays on the window at 430px tall');
  await page.setViewportSize({ width: 900, height: 760 });
  await page.screenshot({ path: path.join(repo, 'quota-900.png') });

  // Without the CLI the line is simply absent, not a broken meter.
  failing = true;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(quota).toHaveCount(0, { timeout: 5000 });
  failing = false;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(quota).toContainText('0%');

  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, fixture: repo, checks: ['order and shares', 'threshold colours', 'countdown title', 'refresh on focus', '320/400/500/900/1440px', 'short window keeps the line', 'absent without the CLI', 'no page errors'] }));
} finally {
  await browser?.close();
  await service?.close();
}
