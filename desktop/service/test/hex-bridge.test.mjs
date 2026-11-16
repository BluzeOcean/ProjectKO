import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createService } from '../server.mjs';
import { HexBridge } from '../hex-bridge.mjs';

// The bridge reads the install layout Hex itself writes: a versioned folder
// beside current-version, which names the copy the running app uses.
async function hexRoot(t, { version = null } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'mrmak-hex-'));
  t.after(async () => {
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    await rm(root, { recursive: true, force: true });
  });
  if (version) {
    await mkdir(path.join(root, 'versions', version), { recursive: true });
    await writeFile(path.join(root, 'versions', version, 'hex.com'), '');
    await writeFile(path.join(root, 'current-version'), version);
  }
  return root;
}

test('the Hex bridge reports a missing install rather than failing', async t => {
  const bridge = new HexBridge({ hexDir: await hexRoot(t) });
  assert.deepEqual(await bridge.status(), { available: false, version: null });
  assert.deepEqual(await bridge.toggle(), { ok: false, reason: 'missing', message: 'Hex is not installed' });
});

test('the Hex bridge finds the copy the install records as current', async t => {
  const root = await hexRoot(t, { version: '3.4.0' });
  await mkdir(path.join(root, 'versions', '9.9.9'), { recursive: true });
  const bridge = new HexBridge({ hexDir: root });
  assert.deepEqual(await bridge.status(), { available: true, version: '3.4.0' });
});

test('the desktop service exposes the bridge and saves the terminal setting', async t => {
  const repo = await mkdtemp(path.join(os.tmpdir(), 'mrmak-hex-service-'));
  t.after(async () => {
    assert.equal(path.dirname(repo), path.resolve(os.tmpdir()));
    await rm(repo, { recursive: true, force: true });
  });
  await mkdir(path.join(repo, 'ui'));
  await writeFile(path.join(repo, 'ui', 'index.html'), '<html></html>');
  await mkdir(path.join(repo, 'workspace'));
  await writeFile(path.join(repo, 'workspace', 'workspace.json'), '{"entities":[]}');
  const service = await createService({ repo, uiDir: path.join(repo, 'ui') });
  t.after(() => service.close());
  const request = (route, data) => fetch(service.origin + '/api' + route, {
    method: data === undefined ? 'GET' : 'POST',
    headers: { Authorization: 'Bearer ' + service.token, 'Content-Type': 'application/json' },
    body: data === undefined ? undefined : JSON.stringify(data),
  });

  const status = await (await request('/hex')).json();
  assert.equal(typeof status.available, 'boolean');
  assert.equal(status.enabled, true);

  await request('/settings', { hexShortcut: false });
  assert.equal((await (await request('/hex')).json()).enabled, false);
  await request('/settings', { hexShortcut: true });
  assert.equal((await (await request('/hex')).json()).enabled, true);
});
