import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createService } from '../server.mjs';

// The dictation probe is a diagnostic, not product behaviour. It has to be
// switchable by an agent over the service, and it has to survive a restart, so
// the setting is the only thing that decides whether it records.
test('the dictation probe records by default, waits to be shown, and keeps what it was told', async () => {
  const repo = await mkdtemp(path.join(os.tmpdir(), 'mrmak-dictation-probe-'));
  await mkdir(path.join(repo, 'workspace')); await mkdir(path.join(repo, 'ui'));
  await writeFile(path.join(repo, 'workspace/workspace.json'), '{"entities":[]}');
  const options = () => ({ repo, uiDir: path.join(repo, 'ui'), mcpOptions: { home: repo, env: {} } });
  let service = await createService(options());
  const call = (target, method, body) => fetch(target.origin + '/api/dictation/probe', {
    method,
    headers: { Authorization: `Bearer ${target.token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  try {
    // A measurement that is never taken cannot be read, so recording starts on.
    // The badge stays off the screen until somebody asks for it.
    assert.deepEqual((await (await call(service, 'GET')).json()).probe, { recording: true, badge: false });

    // Changing one half keeps the other half.
    assert.deepEqual((await (await call(service, 'POST', { badge: true })).json()).probe, { recording: true, badge: true });
    assert.deepEqual((await (await call(service, 'POST', { recording: false })).json()).probe, { recording: false, badge: true });

    // It is saved, so the next start of the app finds the same probe.
    const saved = JSON.parse(await readFile(path.join(repo, '.mrmak/settings.json')));
    assert.deepEqual(saved.dictationProbe, { recording: false, badge: true });

    await service.close();
    service = await createService(options());
    assert.deepEqual((await (await call(service, 'GET')).json()).probe, { recording: false, badge: true });
  } finally { await service.close(); }
});
