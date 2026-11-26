import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createService } from '../server.mjs';
import { localDay } from '../workspace.mjs';
import { saveJson } from '../util.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test('board edits are authenticated, scoped, persistent and preserve reports and concurrent metadata', async () => {
  await mkdir(path.join(root, '.cache'), { recursive: true });
  const repo = await mkdtemp(path.join(root, '.cache', 'workspace-edit-test-'));
  await mkdir(path.join(repo, 'workspace', 'sample', 'report'), { recursive: true });
  await mkdir(path.join(repo, 'ui'));
  await writeFile(path.join(repo, 'ui', 'index.html'), '<html>Fixture</html>');
  const file = path.join(repo, 'workspace', 'workspace.json');
  const report = path.join(repo, 'workspace', 'sample', 'report', 'report.html');
  await writeFile(report, '<h1>Keep this report</h1>');
  const first = {
    id: 'sample', title: 'A sample', description: '', tags: ['research'], status: 'active',
    folder: 'sample', created: '2026-01-01', updated: '2026-01-01',
    pages: [{ id: 'report', title: 'Report', description: '', tags: ['game-idea'], created: '2026-01-01', updated: '2026-01-01', tabs: [{ id: 'report', name: 'Report', path: 'report/report.html', viewer: 'report' }] }],
  };
  const second = { ...first, id: 'other', title: 'Another board', status: 'done' };
  await writeFile(file, JSON.stringify({ format: 'pko-vault', version: 2, boards: [first, second], unknownRoot: 'keep' }));
  const service = await createService({ repo, uiDir: path.join(repo, 'ui') });
  const headers = { Authorization: 'Bearer ' + service.token, 'Content-Type': 'application/json', Origin: service.origin };
  const edit = (patch, id = 'sample', extra = {}) => fetch(service.origin + '/api/workspace/boards/' + id, { method: 'PATCH', headers: { ...headers, ...extra }, body: JSON.stringify(patch) });
  try {
    assert.equal((await edit({ status: 'archived' }, 'sample', { Authorization: '' })).status, 401);
    assert.equal((await edit({ status: 'archived' }, 'sample', { Origin: service.files.origin })).status, 403);
    assert.equal((await edit({ status: 'archived' }, 'sample', { Origin: 'https://untrusted.example' })).status, 403);
    for (const patch of [{}, [], null, { status: 'deleted' }, { pinned: 'yes' }, { tags: ['nope'] }, { tags: 'research' }, { folder: 'elsewhere' }, { status: 'done', steps: [] }, { tags: 7 }]) {
      assert.equal((await edit(patch)).status, 400, JSON.stringify(patch));
    }
    assert.equal((await edit({ status: 'done' }, 'missing')).status, 404);
    assert.deepEqual(JSON.parse(await readFile(file, 'utf8')).boards[0], first);
    // Independent actions may arrive together, but must patch the latest record.
    const responses = await Promise.all([edit({ status: 'done' }), edit({ tags: ['gallery'] }), edit({ pinned: true })]);
    assert.ok(responses.every(response => response.status === 200));
    let state = JSON.parse(await readFile(file, 'utf8'));
    assert.deepEqual(state.boards[0], { ...first, status: 'done', tags: ['gallery'], pinned: true, updated: localDay() });
    assert.deepEqual(state.boards[1], second);
    assert.equal(state.unknownRoot, 'keep');
    assert.equal((await (await edit({ status: 'archived' })).json()).board.status, 'archived');
    assert.equal((await (await edit({ status: 'active', tags: ['app-project'], pinned: false })).json()).board.tags[0], 'app-project');
    state = JSON.parse(await readFile(file, 'utf8'));
    assert.equal(state.boards[0].status, 'active');
    assert.equal(state.boards[0].pinned, false);
    assert.deepEqual(state.boards[0].pages, first.pages);
    assert.equal(await readFile(report, 'utf8'), '<h1>Keep this report</h1>');
    const response = await fetch(service.origin + '/api/workspace', { headers });
    assert.deepEqual(await response.json(), state);
    assert.ok((await readdir(path.dirname(file))).every(name => !name.endsWith('.tmp')));
  } finally { await service.close(); }
});

test('failed atomic JSON replacement removes only its temporary file', async () => {
  await mkdir(path.join(root, '.cache'), { recursive: true });
  const directory = await mkdtemp(path.join(root, '.cache', 'workspace-save-test-'));
  const target = path.join(directory, 'keep-directory');
  await mkdir(target); await writeFile(path.join(target, 'keep.txt'), 'unchanged');
  await assert.rejects(saveJson(target, { value: 'new' }));
  assert.deepEqual(await readdir(directory), ['keep-directory']);
  assert.equal(await readFile(path.join(target, 'keep.txt'), 'utf8'), 'unchanged');
});
