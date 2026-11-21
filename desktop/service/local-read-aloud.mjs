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

// One voice for now: Chatterbox's own. A clip dropped into voices/voice.wav in
// the install folder turns it into the owner's voice on the next start.
export const readingVoices = [{ id: 'chatterbox', label: 'Chatterbox · this machine' }];

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
  }

  async installed() {
    try {
      await Promise.all([access(this.python), access(this.marker)]);
      const info = JSON.parse(await readFile(this.marker, 'utf8'));
      return info?.engine === 'chatterbox';
    } catch { return false; }
  }

  async status() {
    const ready = await this.installed();
    return {
      engine: 'chatterbox',
      ready,
      installing: !!this.installing,
      progress: this.progress,
      voices: readingVoices,
      // A clip in voices/ is the owner's voice: the worker prefers it to the
      // one that ships with the model.
      custom: await this.customVoice(),
      label: await this.customVoice() ? await this.customLabel(null) : null,
    };
  }

  async customVoice() {
    for (const name of ['voice.wav', 'voice.flac', 'voice.mp3', 'voice.m4a']) {
      try { await access(path.join(this.root, 'voices', name)); return name; } catch { /* Keep looking. */ }
    }
    return null;
  }

  // Point the voice at a recording: one clip, copied in, engine reloaded.
  async setVoice(file) {
    const extension = path.extname(String(file || '')).toLowerCase();
    if (!['.wav', '.flac', '.mp3', '.m4a', '.ogg'].includes(extension)) throw fail('Choose a WAV, FLAC, MP3, M4A or OGG recording.');
    if (!(await this.installed())) throw fail('Set up read aloud first.', 503);
    const folder = path.join(this.root, 'voices');
    await mkdir(folder, { recursive: true });
    for (const name of await readdir(folder).catch(() => [])) if (/^voice\./.test(name)) await rm(path.join(folder, name), { force: true });
    await copyFile(file, path.join(folder, 'voice' + extension));
    // The recording's own name is what the owner recognises, not "voice.wav";
    // "Marilyn Monroe voice.wav" is the voice "Marilyn Monroe".
    const stem = (String(file).split(/[\\/]/).filter(Boolean).pop() || 'voice' + extension).replace(/\.[^.]+$/, '');
    const name = stem.replace(/[ _-]*(voice|clip|sample|recording)$/i, '').trim() || stem;
    await writeFile(path.join(folder, 'voice.json'), JSON.stringify({ name, addedAt: new Date().toISOString() }), 'utf8');
    this.close(); // the clip is read once, at start
    return { custom: await this.customVoice(), label: await this.customLabel(name) };
  }

  async clearVoice() {
    const folder = path.join(this.root, 'voices');
    for (const name of await readdir(folder).catch(() => [])) if (/^voice\.|^voice\.json$/.test(name)) await rm(path.join(folder, name), { force: true });
    this.close();
    return { custom: null, label: null };
  }

  async customLabel(fallback) {
    try {
      const info = JSON.parse(await readFile(path.join(this.root, 'voices', 'voice.json'), 'utf8'));
      if (typeof info.name === 'string' && info.name.trim()) return info.name.trim();
    } catch { /* No name recorded: the file name is enough. */ }
    return fallback || null;
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
      const pending = this.pending; if (!pending) return;
      try { const result = JSON.parse(line); if (!result.audio || result.error) throw Error(); pending.resolve(Buffer.from(result.audio, 'base64')); }
      catch { pending.reject(fail('Local speech generation failed. Try again.', 502)); }
    });
    const ended = () => {
      if (this.child !== child) return;
      this.child = null;
      // The last lines say why: a driver that refused, weights that are gone,
      // or a model that ran out of memory.
      const tail = (this.stderr || '').trim().split('\n').slice(-1)[0] || '';
      this.pending?.reject(fail('Read aloud stopped' + (tail ? ': ' + tail.slice(0, 160) : '. Try again.'), 502));
    };
    child.on('error', ended); child.on('exit', ended); child.stdin.on('error', ended);
  }

  async synthesize(deviceId, { voice, text }, signal) {
    if (typeof text !== 'string' || !text.trim() || text.length > 2000) throw fail('Choose a short text segment.');
    if (this.pending) throw fail('Speech is busy. Try again in a moment.', 429);
    if (!(await this.installed())) throw fail('Read aloud is not set up on this computer.', 503);
    if (signal?.aborted) throw fail('Playback cancelled.', 499);
    clearTimeout(this.idle); this.start();
    let abort, timeout;
    try {
      return await new Promise((resolve, reject) => {
        this.pending = { deviceId, resolve, reject };
        abort = () => { reject(fail('Playback cancelled.', 499)); this.close(); };
        signal?.addEventListener('abort', abort, { once: true });
        timeout = setTimeout(() => { reject(fail('Local speech timed out. Retry a shorter segment.', 504)); this.close(); }, 120000);
        this.child.stdin.write(JSON.stringify({ voice, text }) + '\n');
      });
    } finally {
      clearTimeout(timeout); signal?.removeEventListener('abort', abort); this.pending = null;
      clearTimeout(this.idle);
      // Chatloading Chatterbox takes about twenty seconds, so the worker stays
      // up for ten minutes after the last sentence rather than two.
      this.idle = setTimeout(() => this.close(), 600000); this.idle.unref?.();
    }
  }

  // A phone that disconnects stops its own speech; nothing else is affected.
  revoke(deviceId) {
    if (this.pending?.deviceId !== deviceId) return;
    this.pending.reject(fail('Playback cancelled.', 499));
    this.close();
  }

  close() {
    clearTimeout(this.idle);
    const child = this.child; this.child = null;
    try { child?.kill(); } catch { /* Already gone. */ }
  }
}
