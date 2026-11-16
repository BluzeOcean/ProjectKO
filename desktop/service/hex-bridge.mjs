// Hex (the desktop dictation app) takes its dictation shortcut through its own
// Windows listener, and that listener does not act on the chord while a Project
// KO window is focused, so the chord arrives in the terminal as a ^T control
// character instead. Hex already answers its command line "as the shortcut
// would", so the terminal asks Hex directly. See
// knowledge/hex-dictation-shortcut.md for the measurements behind this.
import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { readdir, readFile, stat } from 'node:fs/promises';

const DETECT_INTERVAL_MS = 60_000;
const RUN_TIMEOUT_MS = 10_000;
// The CLI documents these exit codes: 0 done or nothing to change, 1 refused,
// 2 usage, 3 Hex is not running.
const EXIT_NOT_RUNNING = 3;

const isFile = async file => (await stat(file).catch(() => null))?.isFile() === true;

export class HexBridge {
  // hexDir is the install folder Hex writes, %APPDATA%\hex by default.
  constructor({ hexDir, appData = process.env.APPDATA, env = process.env } = {}) {
    // Hex keeps every version beside the others and records the live one.
    this.root = hexDir || path.join(appData || path.join(os.homedir(), 'AppData', 'Roaming'), 'hex');
    this.env = env;
    this.found = null;
    this.lookedUpAt = 0;
  }

  // Locating the CLI costs a few directory reads, so remember the answer for a
  // minute; a reinstall is picked up on the next request after that.
  async command() {
    if (this.found !== null && Date.now() - this.lookedUpAt < DETECT_INTERVAL_MS) return this.found;
    const versions = path.join(this.root, 'versions');
    const current = (await readFile(path.join(this.root, 'current-version'), 'utf8').catch(() => '')).trim();
    const installed = await readdir(versions).catch(() => []);
    const ordered = [...new Set([current, ...installed.sort().reverse()].filter(Boolean))];
    this.found = null;
    this.lookedUpAt = Date.now();
    for (const version of ordered) {
      const cli = path.join(versions, version, 'hex.com');
      if (await isFile(cli)) { this.found = { cli, version }; break; }
    }
    return this.found;
  }

  async status() {
    const found = await this.command();
    return { available: !!found, version: found?.version || null };
  }

  // "dictation toggle" is the same decision the shortcut makes: start while
  // idle, finish and paste while recording.
  async toggle() {
    const found = await this.command();
    if (!found) return { ok: false, reason: 'missing', message: 'Hex is not installed' };
    const run = await new Promise(resolve => {
      execFile(found.cli, ['dictation', 'toggle', '--json'], { timeout: RUN_TIMEOUT_MS, windowsHide: true, env: this.env },
        (error, stdout, stderr) => resolve({ error, stdout, stderr }));
    });
    let reply = null;
    try { reply = JSON.parse(run.stdout); } catch { /* A refusal prints a message instead. */ }
    if (run.error?.code === EXIT_NOT_RUNNING) return { ok: false, reason: 'stopped', message: 'Hex is not running' };
    if (run.error) {
      return { ok: false, reason: 'failed', message: reply?.message || 'Hex refused the dictation', detail: String(run.stderr || run.error.message || '').trim().slice(0, 400) };
    }
    return { ok: true, changed: reply?.changed ?? null, message: reply?.message || 'Hex dictation' };
  }
}
