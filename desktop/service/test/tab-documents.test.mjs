import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createService } from '../server.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const board = {
  id: 'lab', title: 'Character Lab', description: '', tags: ['gallery'], status: 'active',
  folder: 'lab', created: '2026-01-01', updated: '2026-01-01', pages: [],
};

async function fixture(t) {
  await mkdir(path.join(root, '.cache'), { recursive: true });
  const repo = await mkdtemp(path.join(root, '.cache', 'tab-documents-test-'));
  await mkdir(path.join(repo, 'workspace', 'lab'), { recursive: true });
  await mkdir(path.join(repo, 'ui'));
  await writeFile(path.join(repo, 'ui', 'index.html'), '<html>Fixture</html>');
  await writeFile(path.join(repo, 'workspace', 'workspace.json'), JSON.stringify({ format: 'pko-vault', version: 2, boards: [board] }));
  const native = [];
  const service = await createService({ repo, uiDir: path.join(repo, 'ui'), native: event => native.push(event) });
  t.after(() => service.close());
  const headers = { Authorization: 'Bearer ' + service.token, 'Content-Type': 'application/json', Origin: service.origin };
  const call = async (route, body, method, extra = {}) => {
    const response = await fetch(service.origin + '/api' + route, { method: method || (body === undefined ? 'GET' : 'POST'), headers: { ...headers, ...extra }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, value: await response.json() };
  };
  const upload = (route, bytes) => fetch(service.origin + '/api' + route, { method: 'POST', headers: { Authorization: 'Bearer ' + service.token, Origin: service.origin, 'Content-Type': 'application/octet-stream' }, body: bytes });
  return { repo, service, call, upload, native };
}

async function created(call) {
  const page = await call('/workspace/boards/lab/pages', { title: 'Game Mechanics', tags: ['game-mechanics'] });
  assert.equal(page.status, 201);
  const tab = await call('/workspace/boards/lab/pages/game-mechanics/tabs', { name: 'Overview', layout: 'gallery' });
  assert.equal(tab.status, 201);
  return { pageId: page.value.page.id, tabId: tab.value.tab.id };
}

test('a board is born empty and a page gets its own folder', async t => {
  const { call } = await fixture(t);
  const createdBoard = await call('/workspace/boards', { title: 'Iron Path', tags: ['game-project'] });
  assert.equal(createdBoard.status, 201);
  assert.deepEqual(createdBoard.value.board.pages, []);
  assert.match(createdBoard.value.board.folder, /^\d{4}-\d{2}-\d{2}_iron-path$/);
  const page = await call('/workspace/boards/' + createdBoard.value.board.id + '/pages', { title: 'UI', tags: ['ui', '2d'] });
  assert.equal(page.status, 201);
  assert.equal(page.value.page.id, 'ui');
});

test('a tab is a document under the page folder, and it round-trips', async t => {
  const { repo, call } = await fixture(t);
  await created(call);
  const file = path.join(repo, 'workspace', 'lab', 'game-mechanics', 'overview.tab.json');
  const document = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(document.format, 'pko-tab');
  assert.deepEqual(document.nodes, []);

  const loaded = await call('/workspace/boards/lab/pages/game-mechanics/tabs/overview');
  assert.equal(loaded.status, 200);
  const revision = loaded.value.revision;

  const next = {
    ...loaded.value.document,
    summary: 'How the loop works.',
    nodes: [
      { kind: 'section', id: 'loop', title: 'The loop', note: 'Read this first.' },
      { kind: 'card', id: 'tick', title: 'One tick', body: 'Sixty a second.', status: 'review' },
    ],
  };
  const saved = await call('/workspace/boards/lab/pages/game-mechanics/tabs/overview', { revision, document: next }, 'PUT');
  assert.equal(saved.status, 200);
  assert.notEqual(saved.value.revision, revision);
  assert.equal(JSON.parse(await readFile(file, 'utf8')).nodes[1].id, 'tick');
});

test('a stale revision is refused, and so is a block the format does not know', async t => {
  const { repo, call } = await fixture(t);
  await created(call);
  const loaded = await call('/workspace/boards/lab/pages/game-mechanics/tabs/overview');
  const revision = loaded.value.revision;
  const good = { ...loaded.value.document, nodes: [{ kind: 'card', id: 'tick', title: 'One tick' }] };
  assert.equal((await call('/workspace/boards/lab/pages/game-mechanics/tabs/overview', { revision, document: good }, 'PUT')).status, 200);
  assert.equal((await call('/workspace/boards/lab/pages/game-mechanics/tabs/overview', { revision, document: good }, 'PUT')).status, 409);
  const current = await call('/workspace/boards/lab/pages/game-mechanics/tabs/overview');
  const file = path.join(repo, 'workspace', 'lab', 'game-mechanics', 'overview.tab.json');
  const before = await readFile(file, 'utf8');
  const bad = { ...current.value.document, nodes: [{ kind: 'block', id: 'x', title: 'X' }] };
  assert.equal((await call('/workspace/boards/lab/pages/game-mechanics/tabs/overview', { revision: current.value.revision, document: bad }, 'PUT')).status, 400);
  assert.equal(await readFile(file, 'utf8'), before);
});

test('an image is written beside the page, and a non-image is refused', async t => {
  const { repo, upload, call } = await fixture(t);
  await created(call);
  const saved = await upload('/workspace/boards/lab/pages/game-mechanics/tabs/overview/images?name=shot.png', png);
  assert.equal(saved.status, 201);
  const { image } = await saved.json();
  assert.match(image, /^media\/shot-[a-f0-9]{8}\.png$/);
  await access(path.join(repo, 'workspace', 'lab', 'game-mechanics', image));
  const refused = await upload('/workspace/boards/lab/pages/game-mechanics/tabs/overview/images?name=notes.txt', Buffer.from('not an image'));
  assert.equal(refused.status, 400);
});

test('deleting a page takes its folder to the trash and leaves the board', async t => {
  const { repo, call, native } = await fixture(t);
  await created(call);
  const removed = await call('/workspace/boards/lab/pages/game-mechanics', undefined, 'DELETE');
  assert.equal(removed.status, 200);
  assert.equal(removed.value.removed, true);
  assert.equal(removed.value.folder, path.join(repo, 'workspace', 'lab', 'game-mechanics'));
  assert.ok(native.some(event => event.type === 'recycle-file' && event.path.endsWith(path.join('lab', 'game-mechanics'))));
  const registry = await call('/workspace');
  assert.equal(registry.value.boards[0].id, 'lab');
  assert.deepEqual(registry.value.boards[0].pages, []);
});
