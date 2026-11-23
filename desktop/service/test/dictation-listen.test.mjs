import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createService } from '../server.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

// The chat microphone is one switch: the service wakes Toxic, asks it to listen
// and hands the transcript back. Project KO records nothing here.
async function build(t, settings, options = {}) {
  await mkdir(path.join(root, '.cache'), { recursive: true });
  const repo = await mkdtemp(path.join(root, '.cache', 'dictation-listen-'));
  await mkdir(path.join(repo, 'ui')); await writeFile(path.join(repo, 'ui', 'index.html'), '<html></html>');
  await mkdir(path.join(repo, 'workspace')); await writeFile(path.join(repo, 'workspace', 'workspace.json'), '{"entities":[]}');
  if (settings) { await mkdir(path.join(repo, '.mrmak'), { recursive: true }); await writeFile(path.join(repo, '.mrmak', 'settings.json'), JSON.stringify(settings)); }
  const calls = [];
  const client = {
    health: async () => ({ running: true }),
    dictation: async action => {
      calls.push(action);
      // Toxic's own shortcut opened the microphone a moment earlier.
      if (action === 'start' && options.busy) throw Object.assign(new Error('Toxic is already listening'), { status: 502 });
      if (action === 'stop') return '  Hello from Toxic.  ';
      if (action === 'status') return JSON.stringify({ listening: true, last: { text: 'Earlier.', at: 12 } });
      return action;
    },
  };
  const dictation = { toxicClient: () => client, status: async () => ({ available: true, provider: 'toxic', providers: [] }), transcribe: async () => ({ text: '' }), close() {} };
  const wakes = [];
  const ensureToxic = async asked => { wakes.push(asked === client); return { started: true, executable: 'Toxic.exe' }; };
  const service = await createService({ repo, uiDir: path.join(repo, 'ui'), mobileOptions: { dictation, ensureToxic } });
  t.after(() => service.close());
  const post = (action) => fetch(service.origin + '/api/dictation/listen', { method: 'POST', headers: { Authorization: 'Bearer ' + service.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
  return { service, calls, wakes, post };
}

test('starting wakes Toxic, and stopping returns the transcript', { timeout: 30000 }, async t => {
  const { calls, wakes, post } = await build(t);
  let response = await post('start');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { listening: true, owner: 'project-ko' });
  assert.equal(wakes.length, 1, 'start asks for Toxic to be running first');
  // The switch polls while it listens: the answer says whose take it is.
  response = await post('status');
  assert.deepEqual(await response.json(), { listening: true, owner: 'project-ko', last: { text: 'Earlier.', at: 12 } });
  response = await post('stop');
  assert.deepEqual(await response.json(), { listening: false, text: 'Hello from Toxic.', owner: 'project-ko' });
  response = await post('status');
  assert.deepEqual(await response.json(), { listening: true, owner: null, last: { text: 'Earlier.', at: 12 } });
  response = await post('cancel');
  assert.deepEqual(await response.json(), { listening: false });
  assert.deepEqual(calls, ['start', 'status', 'stop', 'status', 'cancel']);
});

test('a take Toxic opened first is left alone', { timeout: 30000 }, async t => {
  const { calls, post } = await build(t, null, { busy: true });
  // Toxic's hook wins the race with the web view, so "already listening" is the
  // normal answer rather than a failure.
  let response = await post('start');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { listening: true, owner: 'toxic' });
  response = await post('stop');
  assert.deepEqual(await response.json(), { listening: false, text: '', owner: 'toxic' }, 'words Toxic typed are not handed back twice');
  assert.deepEqual(calls, ['start', 'stop']);
});

test('the switch refuses unknown actions and a disabled provider', { timeout: 30000 }, async t => {
  const { post } = await build(t);
  assert.equal((await post('wiggle')).status, 400);
  const off = await build(t, { transcribeProvider: 'off' });
  const response = await off.post('start');
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /Dictation is off/);
});
