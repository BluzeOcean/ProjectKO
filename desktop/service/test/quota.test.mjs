import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveQuota, Quota } from '../quota.mjs';

// The shape mmx quota answers with, as it was on 21 November 2026: the general
// row carries the two windows, the video row is a different budget.
const general = (overrides = {}) => ({
  model_name: 'general',
  current_interval_remaining_percent: 100,
  remains_time: 10046105,
  current_weekly_remaining_percent: 3,
  weekly_boost_permille: 1500,
  weekly_remains_time: 96446105,
  ...overrides,
});
const payload = (...rows) => ({ model_remains: rows.length ? rows : [general(), { model_name: 'video', current_interval_remaining_percent: 100 }], base_resp: { status_code: 0 } });

test('the week is boosted the way quota.ps1 boosts it', () => {
  const value = deriveQuota(payload());
  assert.deepEqual(value.session, { left: 100, resetMs: 10046105 });
  assert.equal(value.week.raw, 3);
  assert.equal(value.week.boost, 1500);
  assert.equal(value.week.left, 5);
});

test('the boost rounds the product, not the permille', () => {
  // 55 raw at 1.5x is 82.5, and the script rounds half away from zero: 83.
  // Clamping the permille first would have answered 55.
  assert.equal(deriveQuota(payload(general({ current_weekly_remaining_percent: 55 }))).week.left, 83);
});

test('a boosted week may pass 100 and stops at 200', () => {
  assert.equal(deriveQuota(payload(general({ current_weekly_remaining_percent: 120, weekly_boost_permille: 1500 }))).week.left, 180);
  assert.equal(deriveQuota(payload(general({ current_weekly_remaining_percent: 100, weekly_boost_permille: 4000 }))).week.left, 200);
});

test('a week without a boost is not multiplied', () => {
  const value = deriveQuota(payload(general({ weekly_boost_permille: undefined })));
  assert.equal(value.week.boost, 1000);
  assert.equal(value.week.left, 3);
});

test('a row without the general window is a failure, not a zero', () => {
  assert.throws(() => deriveQuota({ model_remains: [{ model_name: 'video', current_interval_remaining_percent: 100 }] }), /no general model/);
  assert.throws(() => deriveQuota(null), /no general model/);
});

test('the reading is cached for its window', async () => {
  let calls = 0;
  const quota = new Quota({ read: async () => { calls += 1; return payload(); }, cacheMs: 60_000 });
  const first = await quota.status();
  const second = await quota.status();
  assert.equal(calls, 1);
  assert.equal(first.ok, true);
  assert.equal(first.fetchedAt, second.fetchedAt);
});

test('a poll that lands mid-call joins the call', async () => {
  let calls = 0;
  const quota = new Quota({ read: async () => { calls += 1; await new Promise(resolve => setTimeout(resolve, 20)); return payload(); } });
  const [first, second] = await Promise.all([quota.status(), quota.status()]);
  assert.equal(calls, 1);
  assert.equal(first, second);
});

test('a failing CLI answers with ok:false instead of throwing', async () => {
  const quota = new Quota({ read: async () => { throw new Error('mmx quota did not answer'); } });
  const value = await quota.status();
  assert.equal(value.ok, false);
  assert.match(value.error, /did not answer/);
  assert.equal(value.session, undefined);
});
