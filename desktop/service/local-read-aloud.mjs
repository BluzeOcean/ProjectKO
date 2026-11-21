import path from 'node:path';
import { access, copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

/**
 * Read aloud: Chatterbox on this machine's GPU, installed on demand.
 *
 * The engine is not part of the app. It is a folder — an interpreter, the
 * Chatterbox package, its weights — under the user's local app data, and the
 * app either finds its marker file or offers to build it. Nothing leaves the
 * machine while it speaks, and nothing is downloaded until the owner asks.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = path.join(here, 'chatterbox-tts.py');
const installer = path.join(here, 'chatterbox-setup.py');
const fail = (message, status = 400) => Object.assign(new Error(message), { status });

// Every recording in voices/ is a voice the owner can choose between; the one
// that ships with the weights is always there, so a voice is never "missing".
export const builtinVoice = { id: 'builtin', label: 'Chatterbox · built-in voice' };
const clipTypes = ['.wav', '.flac', '.mp3', '.m4a', '.ogg'];

const exists = file => access(file).then(() => true, () => false);

// An id has to survive being a file name and a JSON value. "Aiko" is "aiko";
// names with nothing latin in them keep the fallback rather than a bare dash.
function voiceId(name) {
  const slug = String(name || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return slug || 'voice';
}

// The name a recording arrives with: "Marilyn Monroe voice.wav" is the voice
// "Marilyn Monroe". A file called "3_female_actress_only.wav" is not a name, so
// the owner can say what to call it instead.
function nameFromFile(file, extension) {
  const stem = (String(file).split(/[\\/]/).filter(Boolean).pop() || 'voice' + extension).replace(/\.[^.]+$/, '');
  return stem.replace(/[ _-]*(voice|clip|sample|recording)$/i, '').trim() || stem;
}

// The worker speaks one segment at a time, so segments wait their turn instead
// of failing: the app asks for the next sentence while the current one plays,
// and that overlap is what turns separate files into a continuous voice.
const maximumQueue = 24;

// Ten minutes of speech at this sample rate is tens of megabytes, and it makes
// reading the same passage again instant.
const maximumCached = 64;

// Chatterbox publishes wheels for 3.10-3.12 only, so the interpreter has to be
// asked rather than assumed.
function supportsChatterbox(python) {
  return new Promise(resolve => {
    const probe = spawn(python, ['-c', 'import sys; sys.exit(0 if (3, 10) <= sys.version_info[:2] <= (3, 12) else 1)'], { windowsHide: true, stdio: 'ignore' });
    probe.on('error', () => resolve(false));
    probe.on('exit', code => resolve(code === 0));
  });
}

export const readAloudRoot = env => path.join(env.LOCALAPPDATA || path.join(env.USERPROFILE || '.', 'AppData', 'Local'), 'ProjectKO', 'voice', 'chatterbox');

export class LocalReadAloud {
  constructor(env = process.env) {
    this.root = readAloudRoot(env);
    this.env = env;
    this.python = path.join(this.root, 'venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
    this.marker = path.join(this.root, 'ready.json');
    this.progress = { phase: 'idle', percent: 0, message: '' };
    this.installing = null;
    this.queue = [];
    this.running = null;
    this.cache = new Map();
  }

  // Segments are remembered by voice and words; the newest use keeps its place,
  // so a short list holds the passage the owner is listening to.
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

  async installed() {
    try {
      await Promise.all([access(this.python), access(this.marker)]);
      const info = JSON.parse(await readFile(this.marker, 'utf8'));
      return info?.engine === 'chatterbox';
    } catch { return false; }
  }

  async readInfo(base) {
    try { return JSON.parse(await readFile(base + '.json', 'utf8')); } catch { return null; }
  }

  // The first version kept one clip, voices/voice.wav. It is still a voice, so
  // it is renamed after its own name instead of being replaced or lost.
  async migrate(folder) {
    await rm(path.join(folder, 'clip-used.wav'), { force: true }).catch(() => {});
    let clip = null;
    for (const extension of clipTypes) if (await exists(path.join(folder, 'voice' + extension))) { clip = 'voice' + extension; break; }
    if (!clip) return;
    const info = await this.readInfo(path.join(folder, 'voice'));
    const name = (info?.name || '').trim() || 'voice';
    const id = await this.freeId(folder, voiceId(name));
    await copyFile(path.join(folder, clip), path.join(folder, id + path.extname(clip)));
    await writeFile(path.join(folder, id + '.json'), JSON.stringify({ name, addedAt: info?.addedAt || new Date().toISOString() }), 'utf8');
    await rm(path.join(folder, clip), { force: true });
    await rm(path.join(folder, 'voice.json'), { force: true });
  }

  // Oldest first: the first recording is the voice the app speaks with until
  // the owner picks another.
  async voices() {
    const folder = path.join(this.root, 'voices');
    await this.migrate(folder);
    const found = [];
    for (const name of await readdir(folder).catch(() => [])) {
      const extension = path.extname(name).toLowerCase();
      if (!clipTypes.includes(extension)) continue;
      const id = path.basename(name, extension);
      const info = await this.readInfo(path.join(folder, id));
      found.push({ id, label: (info?.name || id).trim(), addedAt: info?.addedAt || '', file: path.join(folder, name) });
    }
    found.sort((left, right) => String(left.addedAt).localeCompare(String(right.addedAt)) || left.id.localeCompare(right.id));
    return found;
  }

  async freeId(folder, base) {
    for (let index = 1; index < 100; index += 1) {
      const id = index === 1 ? base : `${base}-${index}`;
      if (!(await this.voicesNamed(folder, id))) return id;
    }
    return `${base}-${Date.now()}`;
  }

  async voicesNamed(folder, id) {
    for (const extension of clipTypes) if (await exists(path.join(folder, id + extension))) return true;
    return false;
  }

  async status() {
    const ready = await this.installed();
    const voices = await this.voices();
    const current = voices[0] || null;
    return {
      engine: 'chatterbox',
      ready,
      installing: !!this.installing,
      progress: this.progress,
      // The built-in voice is always offered, even when no recording is here.
      voices: [...voices.map(({ id, label }) => ({ id, label })), builtinVoice],
      voice: current ? current.id : builtinVoice.id,
      label: current?.label || null,
      clips: voices.length,
    };
  }

  // A recording is added, not swapped in: the voices already here stay, and the
  // owner can choose between them.
  async setVoice(file, name) {
    const extension = path.extname(String(file || '')).toLowerCase();
    if (!clipTypes.includes(extension)) throw fail('Choose a WAV, FLAC, MP3, M4A or OGG recording.');
    if (!(await this.installed())) throw fail('Set up read aloud first.', 503);
    const folder = path.join(this.root, 'voices');
    await mkdir(folder, { recursive: true });
    const label = (typeof name === 'string' && name.trim()) || nameFromFile(file, extension);
    const id = await this.freeId(folder, voiceId(label));
    await copyFile(file, path.join(folder, id + extension));
    await writeFile(path.join(folder, id + '.json'), JSON.stringify({ name: label.trim(), addedAt: new Date().toISOString() }), 'utf8');
    return { id, label: label.trim() };
  }

  async removeVoice(id) {
    const safe = voiceId(id);
    if (safe !== id) throw fail('Choose a voice to remove.');
    const folder = path.join(this.root, 'voices');
    for (const extension of clipTypes) await rm(path.join(folder, safe + extension), { force: true });
    await rm(path.join(folder, safe + '.json'), { force: true });
    this.cache.clear();
    return { removed: safe };
  }

  async clearVoice() {
    const folder = path.join(this.root, 'voices');
    for (const voice of await this.voices()) {
      for (const extension of clipTypes) await rm(path.join(folder, voice.id + extension), { force: true });
      await rm(path.join(folder, voice.id + '.json'), { force: true });
    }
    this.cache.clear();
    return { removed: true };
  }

  // "chatterbox" is what clients asked for before there was a choice, and it
  // means the first voice here; an unknown id falls back the same way rather
  // than failing to speak.
  async resolveVoice(requested) {
    if (requested === builtinVoice.id) return { id: builtinVoice.id, label: builtinVoice.label, file: '' };
    const voices = await this.voices();
    return voices.find(voice => voice.id === requested) || voices[0] || { id: builtinVoice.id, label: builtinVoice.label, file: '' };
  }

  // One install at a time; the second caller joins the first.
  setup() {
    if (this.installing) return this.installing;
    this.progress = { phase: 'install', percent: 1, message: 'Starting' };
    this.installing = (async () => {
      await mkdir(this.root, { recursive: true });
      const child = spawn(await this.pythonForSetup(), ['-u', installer, this.root], {
        env: { ...this.env, PYTHONIOENCODING: 'utf-8' },
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let log = '';
      const lines = createInterface({ input: child.stdout });
      lines.on('line', line => {
        try {
          const event = JSON.parse(line);
          if (typeof event.phase === 'string') this.progress = { phase: event.phase, percent: Number(event.percent) || 0, message: String(event.message || '') };
        } catch { /* Anything that is not a progress line is log text. */ }
      });
      child.stderr.on('data', chunk => { log = (log + chunk.toString()).slice(-8000); });
      const code = await new Promise(resolve => child.on('exit', resolve).on('error', () => resolve(-1)));
      if (code !== 0 || !(await this.installed())) {
        this.progress = { phase: 'failed', percent: 0, message: (log.trim().split('\n').pop() || 'The engine could not be installed.').slice(0, 300) };
        throw fail(this.progress.message, 502);
      }
      this.progress = { phase: 'ready', percent: 100, message: 'Chatterbox is ready' };
      return { ready: true };
    })().finally(() => { this.installing = null; });
    return this.installing;
  }

  // The installer needs an interpreter that can build a venv, and the engine's
  // own venv is not it. Chatterbox has no wheels past 3.12, so the interpreter
  // is probed rather than assumed: a 3.13 would install nothing.
  async pythonForSetup() {
    if (this.setupPython) return this.setupPython;
    const candidates = [];
    if (this.env.PKO_PYTHON) candidates.push(this.env.PKO_PYTHON);
    if (process.platform === 'win32' && this.env.APPDATA) {
      const uvRoot = path.join(this.env.APPDATA, 'uv', 'python');
      for (const name of await readdir(uvRoot).catch(() => [])) {
        if (/^cpython-3\.(?:10|11|12)[-.].*windows/.test(name)) candidates.push(path.join(uvRoot, name, 'python.exe'));
      }
    }
    candidates.push(process.platform === 'win32' ? 'python' : 'python3');
    for (const candidate of candidates) {
      if (await supportsChatterbox(candidate)) { this.setupPython = candidate; return candidate; }
    }
    throw fail('Python 3.10-3.12 is needed to install the engine. Install it, or set PKO_PYTHON to its path.', 501);
  }

  start() {
    if (this.child) return;
    const child = spawn(this.python, ['-u', worker, this.root], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: { ...this.env, HF_HOME: path.join(this.root, 'models', 'hf'), TORCH_HOME: path.join(this.root, 'models', 'torch') } });
    this.child = child;
    this.stderr = '';
    child.stderr.on('data', chunk => { this.stderr = (this.stderr + chunk.toString()).slice(-4000); });
    let text = '';
    child.stdout.on('data', chunk => {
      text += chunk.toString();
      if (text.length > 16 * 1024 * 1024) { this.close(); return; }
      const end = text.indexOf('\n'); if (end < 0) return;
      const line = text.slice(0, end); text = text.slice(end + 1);
      this.spoke(line);
    });
    const ended = () => {
      if (this.child !== child) return;
      this.child = null;
      // The last lines say why: a driver that refused, weights that are gone,
      // or a model that ran out of memory.
      const tail = (this.stderr || '').trim().split('\n').slice(-1)[0] || '';
      this.dropAll(fail('Read aloud stopped' + (tail ? ': ' + tail.slice(0, 160) : '. Try again.'), 502));
    };
    child.on('error', ended); child.on('exit', ended); child.stdin.on('error', ended);
  }

  // Two segments that arrive together must be spoken in the order they were
  // asked for, whatever order their file reads finish in — otherwise the reply
  // is spoken out of order. Preparing one at a time is the cheapest way to keep
  // that promise; speaking them is still a queue.
  synthesize(deviceId, { voice: requested, text }, signal) {
    let settle = null;
    const audio = new Promise((resolve, reject) => { settle = { resolve, reject }; });
    const prepared = (this.preparing || Promise.resolve()).then(() => this.enqueue({ deviceId, requested, text, signal, ...settle }));
    this.preparing = prepared.catch(() => {});
    return audio;
  }

  async enqueue({ deviceId, requested, text, signal, resolve, reject }) {
    try {
      if (typeof text !== 'string' || !text.trim() || text.length > 2000) throw fail('Choose a short text segment.');
      if (!(await this.installed())) throw fail('Read aloud is not set up on this computer.', 503);
      if (signal?.aborted) throw fail('Playback cancelled.', 499);
      const voice = await this.resolveVoice(requested);
      const key = `${voice.id}\u0000${text}`;
      const said = this.recentlySaid(key);
      if (said) { resolve(said); return; }
      // One GPU, one voice: a third or fourth segment can wait, a hundred cannot.
      if (this.queue.length >= maximumQueue) throw fail('Speech is busy. Try again in a moment.', 429);
      // The worker is handed the recording, not the name: it prepares the voice
      // once and keeps it beside the others.
      const job = { deviceId, voice: voice.file, text, key, cancelled: false, settled: false, timer: null };
      job.resolve = value => { if (job.settled) return; job.settled = true; clearTimeout(job.timer); resolve(value); };
      job.reject = error => { if (job.settled) return; job.settled = true; clearTimeout(job.timer); reject(error); };
      // A stopped player still leaves the segment it asked for to finish: the
      // result is kept, the worker stays warm, and the next read is instant.
      const cancel = () => { job.cancelled = true; job.reject(fail('Playback cancelled.', 499)); };
      signal?.addEventListener('abort', cancel, { once: true });
      // The stop can arrive while the voice is being looked up, before the
      // listener above existed; the signal remembers, so ask it once more.
      if (signal?.aborted) cancel();
      this.queue.push(job);
      this.pump();
    } catch (error) {
      reject(error);
    }
  }

  // The worker takes one segment at a time; this hands it the next one.
  pump() {
    while (!this.running && this.queue.length) {
      const job = this.queue.shift();
      if (job.cancelled || job.settled) continue;
      this.running = job;
      clearTimeout(this.idle);
      try {
        this.start();
        job.timer = setTimeout(() => {
          job.reject(fail('Local speech timed out. Retry a shorter segment.', 504));
          this.close(fail('Local speech timed out. Retry a shorter segment.', 504));
        }, 120000);
        this.child.stdin.write(JSON.stringify({ voice: job.voice, text: job.text }) + '\n');
      } catch {
        this.running = null;
        job.reject(fail('Read aloud stopped. Try again.', 502));
      }
    }
  }

  // One line per segment the worker spoke, in the order it was asked for.
  spoke(line) {
    const job = this.running;
    if (!job) return;
    this.running = null;
    let audio = null;
    try {
      const result = JSON.parse(line);
      if (!result.audio || result.error) throw Error();
      audio = Buffer.from(result.audio, 'base64');
    } catch { audio = null; }
    if (audio) {
      this.remember(job.key, audio);
      job.resolve(audio);
    } else {
      job.reject(fail('Local speech generation failed. Try again.', 502));
    }
    this.idleAfter();
    this.pump();
  }

  // Chatterbox takes about twenty seconds to load, so the worker stays up for
  // ten minutes after the last sentence rather than two.
  idleAfter() {
    clearTimeout(this.idle);
    this.idle = setTimeout(() => this.close(), 600000);
    this.idle.unref?.();
  }

  // A phone that disconnects stops its own speech; nothing else is affected.
  revoke(deviceId) {
    for (const job of [this.running, ...this.queue]) {
      if (!job || job.deviceId !== deviceId || job.cancelled || job.settled) continue;
      job.cancelled = true; job.reject(fail('Playback cancelled.', 499));
    }
  }

  // Everything still waiting fails for the same reason the worker did.
  dropAll(error) {
    const jobs = [this.running, ...this.queue].filter(Boolean);
    this.running = null; this.queue = [];
    for (const job of jobs) job.reject(error);
  }

  close(error) {
    clearTimeout(this.idle);
    const child = this.child; this.child = null;
    try { child?.kill(); } catch { /* Already gone. */ }
    this.dropAll(error || fail('Playback cancelled.', 499));
  }
}
