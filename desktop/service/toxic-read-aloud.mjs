import { ToxicClient } from './toxic.mjs';

/**
 * Read aloud through Toxic (Pocket TTS, inside Toxic).
 *
 * Project KO no longer runs a speech model of its own. Toxic owns the voice,
 * the weights and the engine process; this adapter keeps only what the player
 * needs from the old engine: one request at a time, in the order the reply was
 * written, a short-lived cache, and a cancel per surface.
 */

const fail = (message, status = 400) => Object.assign(new Error(message), { status });

export const toxicVoice = { id: 'toxic', label: 'Toxic' };
const maximumQueue = 24;
const maximumCached = 64;

/**
 * An engine that answers with no samples in it.
 *
 * Toxic owns whatever is behind the wrapper, so Project KO does not look at
 * ports or processes to explain this. What the owner needs is the one action
 * that fixes it: Toxic's tray has "Restart engines", and Toxic adopts a
 * server left behind by an earlier run, so its engine can answer while saying
 * nothing. The message says that, instead of repeating "no audio".
 */
const silentEngine = /no audio|empty recording/i;

export function engineFailure(error) {
  const message = String(error?.message || '');
  if (!silentEngine.test(message)) return error;
  return Object.assign(
    new Error('Toxic\'s speech engine answered with no sound. Right-click the Toxic tray icon and choose Restart engines, then try again.'),
    { status: error?.status || 502 },
  );
}

export class ToxicReadAloud {
  constructor({ client = null, env = process.env } = {}) {
    this.client = client || new ToxicClient({ env });
    this.queue = [];
    this.running = null;
    this.pumping = false;
    this.cache = new Map();
  }

  remember(key, audio) {
    this.cache.delete(key);
    this.cache.set(key, audio);
    while (this.cache.size > maximumCached) this.cache.delete(this.cache.keys().next().value);
  }

  recentlySaid(key) {
    const known = this.cache.get(key);
    if (!known) return null;
    this.cache.delete(key);
    this.cache.set(key, known);
    return known;
  }

  // Toxic answers health without a token. A stopped engine is still ready: the
  // first speak starts it, exactly as the app's own hotkey would.
  async status() {
    const health = await this.client.health();
    return {
      engine: 'toxic',
      ready: !!health,
      // Phone settings reads "available"; the desktop bar reads "ready". Both
      // mean the same thing here: Toxic answered its health check.
      available: !!health,
      installing: false,
      progress: { phase: 'idle', percent: 0, message: '' },
      voices: [toxicVoice],
      voice: toxicVoice.id,
      // Toxic is the interface. Whatever speaks behind it is Toxic's business,
      // so the label names only Toxic.
      label: health ? 'Toxic' : null,
      clips: 0,
      detail: health ? `Toxic ${health.version || ''}`.trim() : 'Toxic is not running',
    };
  }

  synthesize(deviceId, { text }, signal) {
    let settle = null;
    const audio = new Promise((resolve, reject) => { settle = { resolve, reject }; });
    const prepared = (this.preparing || Promise.resolve()).then(() => this.enqueue({ deviceId, text, signal, ...settle }));
    this.preparing = prepared.catch(() => {});
    return audio;
  }

  async enqueue({ deviceId, text, signal, resolve, reject }) {
    try {
      if (typeof text !== 'string' || !text.trim() || text.length > 8000) throw fail('Choose a short text segment.');
      if (signal?.aborted) throw fail('Playback cancelled.', 499);
      const key = `${toxicVoice.id}\u0000${text}`;
      const said = this.recentlySaid(key);
      if (said) { resolve(said); return; }
      if (this.queue.length >= maximumQueue) throw fail('Speech is busy. Try again in a moment.', 429);
      const job = { deviceId, text, key, cancelled: false, settled: false };
      job.resolve = value => { if (job.settled) return; job.settled = true; resolve(value); };
      job.reject = error => { if (job.settled) return; job.settled = true; reject(error); };
      const cancel = () => { job.cancelled = true; job.reject(fail('Playback cancelled.', 499)); };
      signal?.addEventListener('abort', cancel, { once: true });
      if (signal?.aborted) cancel();
      this.queue.push(job);
      this.pump();
    } catch (error) {
      reject(error);
    }
  }

  pump() {
    if (this.pumping) return;
    this.pumping = true;
    void (async () => {
      while (this.queue.length) {
        const job = this.queue.shift();
        if (!job || job.cancelled || job.settled) continue;
        this.running = job;
        try {
          const audio = await this.client.speak(job.text, 1);
          if (job.cancelled || job.settled) continue;
          this.remember(job.key, audio);
          job.resolve(audio);
        } catch (error) {
          job.reject(engineFailure(error));
        } finally {
          if (this.running === job) this.running = null;
        }
      }
    })().finally(() => {
      this.pumping = false;
      if (this.queue.length) this.pump();
    });
  }

  // A phone that disconnects stops its own speech; nothing else is affected.
  revoke(deviceId) {
    for (const job of [this.running, ...this.queue]) {
      if (!job || job.deviceId !== deviceId || job.cancelled || job.settled) continue;
      job.cancelled = true;
      job.reject(fail('Playback cancelled.', 499));
    }
  }

  close(error) {
    const jobs = [this.running, ...this.queue].filter(Boolean);
    this.running = null;
    this.queue = [];
    for (const job of jobs) job.reject(error || fail('Playback cancelled.', 499));
  }
}
