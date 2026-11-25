// Third measurement: the images inside a card that lives in a Vault outside
// the repository. The card document itself opens (it is fetched through the
// API route), but its images resolve against the card's report URL.
//
// Usage: node .debuglog/board-files-resolve-against-the-repository-not-the-vault/measure-card-images.mjs

import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createService } from '../../desktop/service/server.mjs';

const scratch = name => mkdtemp(path.join(process.env.TEMP || '.', name));
const repo = await scratch('ko-repo-');
await mkdir(path.join(repo, 'workspace', '_shared'), { recursive: true });
await mkdir(path.join(repo, 'ui'));
await writeFile(path.join(repo, 'ui', 'index.html'), '<html>Fixture</html>');
await writeFile(path.join(repo, 'workspace', 'workspace.json'), JSON.stringify({ entities: [] }));

const vault = await scratch('ko-vault-');
await mkdir(path.join(vault, 'board', 'media'), { recursive: true });
await writeFile(path.join(vault, 'board', 'content.card.json'), JSON.stringify({ format: 'card/1', version: 1, template: 'gallery', title: 'Gallery', summary: '', items: [{ id: 'i1', title: 'Shot', image: 'media/shot.png' }] }));
// A one-pixel PNG.
await writeFile(path.join(vault, 'board', 'media', 'shot.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
await writeFile(path.join(vault, 'workspace.json'), JSON.stringify({ entities: [{ id: 'b1', title: 'Board', category: 'research', status: 'active', folder: 'board', created: '2026-01-01', steps: [{ name: 'Gallery', path: 'content.card.json', viewer: 'card' }] }] }));

const stateDir = await scratch('ko-state-');
await writeFile(path.join(stateDir, 'settings.json'), JSON.stringify({ vaultPath: vault }));
const service = await createService({ repo, uiDir: path.join(repo, 'ui'), stateDir });
const headers = { Authorization: `Bearer ${service.token}` };

try {
  const bootstrap = await (await fetch(`${service.origin}/api/bootstrap`, { headers })).json();

  // The card's report URL, as the UI builds it.
  const cardUrl = `${bootstrap.contentBase}/workspace/board/content.card.json`;
  // The card's report URL, as the service builds it.
  const serviceCardUrl = service.files.url(path.join(vault, 'board', 'content.card.json'));

  const imageFrom = base => new URL('media/shot.png', base).href;
  const uiImage = await fetch(imageFrom(cardUrl), { headers });
  const svcImage = await fetch(imageFrom(serviceCardUrl), { headers });
  console.log('card url (UI)      :', cardUrl);
  console.log('image from UI card :', imageFrom(cardUrl));
  console.log('  ->', uiImage.status, (await uiImage.text()).slice(0, 110).replace(/\s+/g, ' '));
  console.log('card url (service) :', serviceCardUrl);
  console.log('image from svc card:', imageFrom(serviceCardUrl));
  console.log('  ->', svcImage.status, svcImage.headers.get('content-type'), (await svcImage.arrayBuffer()).byteLength, 'bytes');
} finally { await service.close(); }
