// The MiniMax agent's quota, from the same CLI the owner's quota.ps1 polls:
// two windows (a five-hour interval and a week) reported as percentages left,
// the week with a boost multiplier the CLI applies on top of the raw share.
// The Chats window shows the two as one line; this module is the only place
// that runs the command.
import { exec } from 'node:child_process';
import { publicError } from './util.mjs';

const CACHE_MS = 30_000;
const RUN_TIMEOUT_MS = 15_000;

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

// Reduce `mmx quota` to the numbers the footer draws. Exported for its test:
// the arithmetic is the feature. The CLI reports the week raw and then a
// permille boost; quota.ps1 rounds the product half away from zero (PowerShell's
// own default is banker's rounding) and clamps the result to 0-200, not the
// permille, so a boosted week may read past 100.
export function deriveQuota(payload) {
  const general = (payload?.model_remains || []).find(item => item?.model_name === 'general');
  if (!general) throw new Error('mmx quota carried no general model');
  const boost = Number(general.weekly_boost_permille ?? 1000);
  const raw = Number(general.current_weekly_remaining_percent ?? 0);
  return {
    session: {
      left: Number(general.current_interval_remaining_percent ?? 0),
      resetMs: Number(general.remains_time ?? 0),
    },
    week: {
      left: clamp(Math.round(raw * boost / 1000), 0, 200),
      raw,
      boost,
      resetMs: Number(general.weekly_remains_time ?? 0),
    },
  };
}

export class Quota {
  // `read` is the seam the tests use, so no CLI is started under test.
  constructor({ read, env = process.env, cacheMs = CACHE_MS } = {}) {
    this.reading = read || (() => this.take(env));
    this.cacheMs = cacheMs;
    this.last = null;
    this.at = 0;
    this.pending = null;
  }

  take(env) {
    return new Promise((resolve, reject) => {
      exec('mmx quota', { timeout: RUN_TIMEOUT_MS, windowsHide: true, env, maxBuffer: 8 * 1024 * 1024 }, (error, stdout) => {
        if (error) { reject(new Error('mmx quota did not answer')); return; }
        try { resolve(JSON.parse(String(stdout).trim())); }
        catch { reject(new Error('mmx quota did not answer with JSON')); }
      });
    });
  }

  // The window asks once a minute, and a machine without the CLI keeps working:
  // a failure is a reading too, remembered for the same while so it is not paid
  // for on every poll.
  async status() {
    if (this.last && Date.now() - this.at < this.cacheMs) return this.last;
    if (this.pending) return this.pending;
    this.pending = (async () => {
      const fetchedAt = new Date().toISOString();
      let value;
      try { value = { ok: true, fetchedAt, model: 'general', ...deriveQuota(await this.reading()) }; }
      catch (error) { value = { ok: false, fetchedAt, error: publicError(error) }; }
      this.last = value;
      this.at = Date.now();
      this.pending = null;
      return value;
    })();
    return this.pending;
  }
}
