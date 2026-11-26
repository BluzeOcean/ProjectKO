import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createService } from '../server.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const board = {
  id: 'doomed', title: 'Doomed board', description: '', tags: ['research'], status: 'active',
  folder: 'sample', created: '2026-01-01', updated: '2026-01-01',
  pages: [{ id: 'report', title: 'Report', tags: [], created: '2026-01-01', updated: '2026-01-01', tabs: [{ id: 'report', name: 'Report', path: 'report/report.html', viewer: 'report' }] }],
};

async function fixture() {
  await mkdir(path.join(root, '.cache'), { recursive: true });
  const repo = await mkdtemp(path.join(root, '.cache', 'board-delete-test-'));
  await mkdir(path.join(repo, 'workspace', 'sample', 'report'), { recursive: true });
  await mkdir(path.join(repo, 'workspace', 'keep'), { recursive: true });
  await mkdir(path.join(repo, 'ui'));
  await writeFile(path.join(repo, 'ui', 'index.html'), '<html>Fixture</html>');
  await writeFile(path.join(repo, 'workspace', 'sample', 'report', 'report.html'), '<h1>Doomed</h1>');
  await writeFile(path.join(repo, 'workspace', 'keep', 'report.html'), '<h1>Safe</h1>');
  const file = path.join(repo, 'workspace', 'workspace.json');
  await writeFile(file, JSON.stringify({ format: 'pko-vault', version: 2, boards: [board, { ...board, id: 'keep', title: 'Safe board', folder: 'keep', pages: [] }] }));
  const native = [];
  const service = await createService({ repo, uiDir: path.join(repo, 'ui'), native: event => native.push(event) });
  const headers = { Authorization: 'Bearer ' + service.token, 'Content-Type': 'application/json', Origin: service.origin };
  return { repo, file, native, service, remove: (id, extra = {}) => fetch(service.origin + '/api/workspace/boards/' + id, { method: 'DELETE', headers: { ...headers, ...extra } }) };
}

test('a board can be deleted, and its folder is handed to the system trash', async () => {
  const { repo, file, native, service, remove } = await fixture();
  try {
    assert.equal((await remove('doomed', { Authorization: '' })).status, 401);
    assert.equal((await remove('doomed', { Origin: 'https://untrusted.example' })).status, 403);
    assert.equal((await remove('missing')).status, 404);
    const response = await remove('doomed');
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.removed, true);
    assert.equal(result.board.title, 'Doomed board');
    assert.equal(result.folder, path.join(repo, 'workspace', 'sample'));
    // Only the board is gone. The other board and the registry's shape stay.
    const state = JSON.parse(await readFile(file, 'utf8'));
    assert.deepEqual(state.boards.map(item => item.id), ['keep']);
    // The service never removes the user's files itself: the folder travels to
    // the system trash, where a mistake can still be undone.
    assert.equal(await readFile(path.join(repo, 'workspace', 'sample', 'report', 'report.html'), 'utf8'), '<h1>Doomed</h1>');
    assert.ok(native.some(event => event.type === 'recycle-file' && event.path === path.join(repo, 'workspace', 'sample')));
  } finally { await service.close(); }
});

test('a board whose folder is a path is refused, and stays in the registry', async () => {
  const { file, service, remove } = await fixture();
  try {
    const registry = JSON.parse(await readFile(file, 'utf8'));
    registry.boards.push({ ...board, id: 'tricky', folder: '../escape' });
    await writeFile(file, JSON.stringify(registry));
    assert.equal((await remove('tricky')).status, 400);
    assert.deepEqual(JSON.parse(await readFile(file, 'utf8')).boards.map(item => item.id), ['doomed', 'keep', 'tricky']);
  } finally { await service.close(); }
});
