import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { spawn as spawnProcess } from 'node:child_process';
import path from 'node:path';
import { toxicConfigDir } from './toxic.mjs';

/**
 * Waking Toxic.
 *
 * Project KO draws the microphone; Toxic does the listening. The button has to
 * work while Toxic is closed, so the service finds the installed app, starts it
 * detached and waits for its MCP server to answer. No app means the user is
 * asked to install Toxic, not given a silent failure.
 */

const fail = (message, status = 503) => Object.assign(new Error(message), { status });
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

// The NSIS bundle installs under %LOCALAPPDATA%\Programs; a portable build can
// sit in either Program Files. PKO_TOXIC_EXE overrides all of it.
function installed(env) {
  const list = [];
  if (env.PKO_TOXIC_EXE) list.push(env.PKO_TOXIC_EXE);
  if (process.platform === 'darwin') list.push('/Applications/Toxic.app');
  if (process.platform === 'win32') {
    const roots = [env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Programs'), env.PROGRAMFILES, env['PROGRAMFILES(X86)']].filter(Boolean);
    for (const root of roots) list.push(path.join(root, 'Toxic', 'Toxic.exe'));
    if (env.LOCALAPPDATA) list.push(path.join(env.LOCALAPPDATA, 'Toxic', 'Toxic.exe'));
  }
  return list;
}

// A .lnk stores its target twice, as ANSI and as UTF-16, so the bytes can be
// searched without a COM helper inside the service.
export function shortcutTargets(buffer) {
  const targets = [];
  for (const encoding of ['latin1', 'utf16le']) {
    for (const match of buffer.toString(encoding).matchAll(/[A-Za-z]:\\[^\u0000-\u001f"<>|?*]{0,240}?toxic\.exe/gi)) targets.push(match[0]);
  }
  return targets;
}

function shortcutFolders(env) {
  if (process.platform !== 'win32') return [];
  return [
    env.APPDATA && path.join(env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    env.PROGRAMDATA && path.join(env.PROGRAMDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
  ].filter(Boolean);
}

// An installer leaves a Start Menu shortcut even when it writes no uninstall
// key, and a developer build is usually launched from one too.
export function fromShortcuts({ env = process.env, exists = existsSync, readFile = readFileSync, readdir = readdirSync } = {}) {
  for (const folder of shortcutFolders(env)) {
    let entries = [];
    try { entries = readdir(folder, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (!entry.isFile() || !/toxic.*\.lnk$/i.test(entry.name)) continue;
      let buffer;
      try { buffer = readFile(path.join(folder, entry.name)); } catch { continue; }
      for (const target of shortcutTargets(buffer)) if (exists(target)) return target;
    }
  }
  return null;
}

export function toxicExecutable({ env = process.env, exists = existsSync, readFile = readFileSync, readdir = readdirSync } = {}) {
  for (const candidate of installed(env)) if (candidate && exists(candidate)) return candidate;
  return fromShortcuts({ env, exists, readFile, readdir });
}

// The dictation shortcut is Toxic's, not ours: read it from Toxic's config so a
// chat can honour the same chord while it has focus.
export function toxicShortcut({ env = process.env, readFile = readFileSync } = {}) {
  try {
    const config = JSON.parse(readFile(path.join(toxicConfigDir(env), 'config.json'), 'utf8'));
    const hotkeys = config?.hotkeys || {};
    if (hotkeys.enabled === false || hotkeys.sttMode !== 'chord') return null;
    const chord = typeof hotkeys.sttChord === 'string' ? hotkeys.sttChord.trim() : '';
    return chord || null;
  } catch {
    return null;
  }
}

export function startToxic(executable, { spawn = spawnProcess } = {}) {
  const child = process.platform === 'darwin' && executable.endsWith('.app')
    ? spawn('open', ['-a', executable], { detached: true, stdio: 'ignore' })
    : spawn(executable, [], { detached: true, stdio: 'ignore', windowsHide: false });
  // A failed spawn reports on the child, not at the call site.
  child.on('error', () => {});
  child.unref?.();
  return child;
}

/** Return once Toxic answers its MCP health check, starting it when it is closed. */
export async function ensureToxic(client, { env = process.env, exists = existsSync, readFile = readFileSync, readdir = readdirSync, spawn = spawnProcess, wait = pause, timeoutMs = 30_000, intervalMs = 500 } = {}) {
  if (await client.health()) return { started: false, executable: null };
  const executable = toxicExecutable({ env, exists, readFile, readdir });
  if (!executable) throw fail('Toxic is not installed on this computer. Install Toxic, then press the microphone again.', 503);
  let failed = null;
  const child = startToxic(executable, { spawn });
  child.on('error', error => { failed = error; });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await wait(intervalMs);
    if (failed) throw fail('Toxic could not start: ' + failed.message, 503);
    if (await client.health(1_200)) return { started: true, executable };
  }
  throw fail('Toxic is starting but has not answered yet. Give it a moment, then press the microphone again. If Toxic is already open, turn on its MCP server in Toxic settings.', 503);
}
