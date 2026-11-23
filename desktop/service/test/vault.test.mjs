import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createService } from '../server.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const chrome = '/* shared report chrome */';

const board = { id: 'outside', title: 'Outside board', category: 'research', status: 'active', folder: '2026-01-01_outside', created: '2026-01-01', steps: [{ name: 'Report', path: 'report.html' }] };

async function folder(name) {
  await mkdir(path.join(root, '.cache'), { recursive: true });
  return mkdtemp(path.join(root, '.cache', name));
}

async function fixture() {
  const repo = await folder('vault-repo-');
  await mkdir(path.join(repo, 'workspace', '_shared'), { recursive: true });
  await mkdir(path.join(repo, 'ui'));
  await writeFile(path.join(repo, 'ui', 'index.html'), '<html>Fixture</html>');
  // The shared report chrome belongs to the app, not to the boards.
  await writeFile(path.join(repo, 'workspace', '_shared', 'report.js'), chrome);
  await writeFile(path.join(repo, 'workspace', 'workspace.json'), JSON.stringify({ entities: [] }));
  const vault = await folder('vault-data-');
  await mkdir(path.join(vault, board.folder));
  await writeFile(path.join(vault, 'workspace.json'), JSON.stringify({ entities: [board] }));
  await writeFile(path.join(vault, board.folder, 'report.html'), '<html><head><link rel="stylesheet" href="../_shared/report.css"></head><body><h1>Outside</h1><script src="../_shared/report.js"></script></body></html>');
  const service = await createService({ repo, uiDir: path.join(repo, 'ui') });
  const headers = { Authorization: `Bearer ${service.token}`, 'Content-Type': 'application/json', Origin: service.origin };
  const settings = data => fetch(`${service.origin}/api/settings`, { method: 'POST', headers, body: JSON.stringify(data) });
  return { repo, vault, service, headers, settings };
}

test('a Vault outside the repository holds the boards and serves its reports', async () => {
  const { repo, vault, service, headers, settings } = await fixture();
  try {
    assert.deepEqual((await (await fetch(`${service.origin}/api/workspace`, { headers })).json()).entities, []);
    const moved = await (await settings({ vaultPath: vault })).json();
    assert.equal(moved.vaultPath, vault);
    const registry = await (await fetch(`${service.origin}/api/workspace`, { headers })).json();
    assert.deepEqual(registry.entities.map(item => item.id), ['outside']);
    // The setting is kept, so the next launch opens the same folder.
    assert.equal(JSON.parse(await readFile(path.join(repo, '.mrmak', 'settings.json'), 'utf8')).vaultPath, vault);

    const document = await fetch(service.files.url(path.join(vault, board.folder, 'report.html')), { headers });
    assert.equal(document.status, 200);
    assert.match(await document.text(), /Outside/);
    // A report still reaches the app's own chrome, not the boards' folder.
    const site = new URL(document.url), token = site.pathname.split('/')[2];
    const shared = await fetch(new URL(`/view/${token}/_shared/report.js`, site), { headers });
    assert.equal(shared.status, 200);
    assert.equal(await shared.text(), chrome);
  } finally { await service.close(); }
});

test('the service refuses a Vault folder it cannot use', async () => {
  const { repo, service, settings } = await fixture();
  try {
    const relative = await settings({ vaultPath: 'relative/folder' });
    assert.equal(relative.status, 400);
    assert.match((await relative.json()).error, /absolute folder/i);
    const repository = await settings({ vaultPath: repo });
    assert.equal(repository.status, 400);
    assert.match((await repository.json()).error, /not the repository itself/i);
  } finally { await service.close(); }
});

test('a saved Vault folder is opened on the next launch', async () => {
  const repo = await folder('vault-saved-');
  await mkdir(path.join(repo, 'workspace'), { recursive: true });
  await mkdir(path.join(repo, '.mrmak'), { recursive: true });
  await mkdir(path.join(repo, 'ui'));
  await writeFile(path.join(repo, 'ui', 'index.html'), '<html>Fixture</html>');
  await writeFile(path.join(repo, 'workspace', 'workspace.json'), JSON.stringify({ entities: [] }));
  const vault = await folder('vault-saved-data-');
  await mkdir(path.join(vault, board.folder));
  await writeFile(path.join(vault, board.folder, 'report.html'), '<h1>Outside</h1>');
  await writeFile(path.join(vault, 'workspace.json'), JSON.stringify({ entities: [board] }));
  await writeFile(path.join(repo, '.mrmak', 'settings.json'), JSON.stringify({ vaultPath: vault }));
  const service = await createService({ repo, uiDir: path.join(repo, 'ui') });
  try {
    const headers = { Authorization: `Bearer ${service.token}`, Origin: service.origin };
    const registry = await (await fetch(`${service.origin}/api/workspace`, { headers })).json();
    assert.deepEqual(registry.entities.map(item => item.id), ['outside']);
  } finally { await service.close(); }
});
