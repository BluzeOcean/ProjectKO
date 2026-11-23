import assert from 'node:assert/strict';
import test from 'node:test';
import { ensureToxic, fromShortcuts, shortcutTargets, toxicExecutable } from '../toxic-launch.mjs';

const winEnv = {
  LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local',
  APPDATA: 'C:\\Users\\me\\AppData\\Roaming',
  PROGRAMFILES: 'C:\\Program Files',
};

test('the executable comes from PKO_TOXIC_EXE first, then the installer folder', () => {
  const override = 'D:\\Apps\\Toxic\\Toxic.exe';
  const bundle = 'C:\\Users\\me\\AppData\\Local\\Programs\\Toxic\\Toxic.exe';
  assert.equal(toxicExecutable({ env: { ...winEnv, PKO_TOXIC_EXE: override }, exists: file => file === override || file === bundle }), override);
  assert.equal(toxicExecutable({ env: winEnv, exists: file => file === bundle }), bundle);
  assert.equal(toxicExecutable({ env: winEnv, exists: () => false, readdir: () => [] }), null);
});

test('a Start Menu shortcut is read from its bytes', () => {
  const shortcut = Buffer.from('C:\\Users\\me\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Toxic.lnk', 'utf16le');
  const target = 'V:\\04_Projects\\Toxic\\src-tauri\\target\\release\\toxic.exe';
  const lnk = Buffer.concat([shortcut, Buffer.from(target, 'utf16le'), Buffer.from(target, 'latin1')]);
  assert.ok(shortcutTargets(lnk).includes(target));
  const folder = 'C:\\Users\\me\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs';
  const found = fromShortcuts({
    env: winEnv,
    exists: file => file === target,
    readdir: directory => directory === folder ? [{ name: 'Toxic.lnk', isFile: () => true }] : [],
    readFile: () => lnk,
  });
  assert.equal(found, target);
});

test('a running Toxic is left alone', async () => {
  let spawned = 0;
  const result = await ensureToxic({ health: async () => ({ running: true }) }, { spawn: () => { spawned += 1; return { on() {}, unref() {} }; } });
  assert.deepEqual(result, { started: false, executable: null });
  assert.equal(spawned, 0);
});

test('a missing app asks the user to install Toxic', async () => {
  await assert.rejects(
    ensureToxic({ health: async () => null }, { env: winEnv, exists: () => false, readdir: () => [] }),
    error => error.status === 503 && /Install Toxic/.test(error.message),
  );
});

test('a closed app is started detached and waited for', async () => {
  const exe = 'C:\\Users\\me\\AppData\\Local\\Programs\\Toxic\\Toxic.exe';
  let healthy = false, spawned = null;
  const client = { health: async () => (healthy ? { running: true } : null) };
  const spawn = (file, args, options) => { spawned = { file, args, options }; healthy = true; return { on() {}, unref() {} }; };
  const result = await ensureToxic(client, { env: winEnv, exists: file => file === exe, spawn, wait: async () => {} });
  assert.deepEqual(result, { started: true, executable: exe });
  assert.equal(spawned.file, exe);
  assert.equal(spawned.options.detached, true);
});
