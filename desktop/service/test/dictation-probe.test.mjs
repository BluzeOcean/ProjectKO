import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createService } from '../server.mjs';
import { probeMode, probeState } from '../dictation-probe.mjs';

// The dictation probe is a diagnostic, not product behaviour. It has to be
// switchable by an agent over the service, and it has to survive a restart, so
// the setting is the only thing that decides whether it records.
//
// A development build records by default - a measurement that is never taken
// cannot be read. A release build records nothing until an agent asks for it,
// so the shipped app is not a silent recorder. The saved choice belongs to the
// build that made it.
//
// A service in development mode starts Vite against its repository, so the
// development build is exercised through the state it starts from; the release
// build is exercised through the service itself.
const fixture = async () => {
  const repo = await mkdtemp(path.join(os.tmpdir(), 'mrmak-dictation-probe-'));
  await mkdir(path.join(repo, 'workspace')); await mkdir(path.join(repo, 'ui'));
  await writeFile(path.join(repo, 'workspace/workspace.json'), '{"entities":[]}');
  return repo;
};
const options = repo => ({ repo, uiDir: path.join(repo, 'ui'), mcpOptions: { home: repo, env: {} } });
const call = (target, method, body) => fetch(target.origin + '/api/dictation/probe', {
  method,
  headers: { Authorization: `Bearer ${target.token}`, 'Content-Type': 'application/json' },
  body: body ? JSON.stringify(body) : undefined,
});
const probeOf = async target => (await (await call(target, 'GET')).json()).probe;

test('a development build records by default and waits to be shown', () => {
  // A measurement that is never taken cannot be read, so recording starts on.
  // The badge stays off the screen until somebody asks for it.
  assert.deepEqual(probeState(undefined, probeMode(true)), { recording: true, badge: false, mode: 'dev' });
  // A setting left behind by the release build does not silence it.
  assert.deepEqual(probeState({ recording: false, badge: true, mode: 'release' }, probeMode(true)), { recording: true, badge: false, mode: 'dev' });
  // What the development build was told is what it keeps.
  assert.deepEqual(probeState({ recording: false, badge: true, mode: 'dev' }, probeMode(true)), { recording: false, badge: true, mode: 'dev' });
});

test('a release build records nothing until an agent asks for it', () => {
  assert.deepEqual(probeState(undefined, probeMode(false)), { recording: false, badge: false, mode: 'release' });
  // A probe left on while developing does not follow the owner into the
  // release build.
  assert.deepEqual(probeState({ recording: true, badge: true, mode: 'dev' }, probeMode(false)), { recording: false, badge: false, mode: 'release' });
});

test('the release build keeps what it was told, and it survives a restart', async () => {
  const repo = await fixture();
  let service = await createService(options(repo));
  try {
    // The shipped app is not a silent recorder: no lines, no badge.
    assert.deepEqual(await probeOf(service), { recording: false, badge: false, mode: 'release' });

    // Changing one half keeps the other half.
    assert.deepEqual((await (await call(service, 'POST', { recording: true })).json()).probe, { recording: true, badge: false, mode: 'release' });
    assert.deepEqual((await (await call(service, 'POST', { badge: true })).json()).probe, { recording: true, badge: true, mode: 'release' });
    assert.deepEqual((await (await call(service, 'POST', { recording: false })).json()).probe, { recording: false, badge: true, mode: 'release' });

    // It is saved, so the next start of the app finds the same probe.
    const saved = JSON.parse(await readFile(path.join(repo, '.mrmak/settings.json')));
    assert.deepEqual(saved.dictationProbe, { recording: false, badge: true, mode: 'release' });

    await service.close();
    service = await createService(options(repo));
    assert.deepEqual(await probeOf(service), { recording: false, badge: true, mode: 'release' });
  } finally { await service.close(); }
});

test('an agent can switch the probe on in the release build, which is how the open dictation defect is measured', async () => {
  const repo = await fixture();
  let service = await createService(options(repo));
  try {
    assert.deepEqual((await (await call(service, 'POST', { recording: true })).json()).probe, { recording: true, badge: false, mode: 'release' });
    await service.close();
    service = await createService(options(repo));
    assert.deepEqual(await probeOf(service), { recording: true, badge: false, mode: 'release' });
  } finally { await service.close(); }
});
