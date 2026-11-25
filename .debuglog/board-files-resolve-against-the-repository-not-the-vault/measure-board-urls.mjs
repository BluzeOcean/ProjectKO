// Measurement for the ticket "a board in a Vault outside the repository
// cannot open its Markdown or HTML tabs".
//
// It starts its own service instance against the real repository and the real
// Vault, with a throwaway state directory so the owner's settings.json is not
// touched. It then builds the two URLs for the same file and compares them.
//
//   1. the URL the desktop UI builds   -> contentBase + '/workspace/<folder>/<file>'
//   2. the URL the service builds      -> files.url(<absolute path>)
//
// Usage: node .debuglog/board-files-resolve-against-the-repository-not-the-vault/measure-board-urls.mjs

import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createService } from '../../desktop/service/server.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const VAULT = 'V:\\03_Vault\\PKO';
const board = '2026-11-25_epic-game-jam-2026';
const html = `${board}/board.html`;               // the Studio Board report
const md = '2026-09-15_creative-mcp/connect.md'; // a Markdown step, also in the Vault

const stateDir = await mkdtemp(path.join(repo, '.cache', 'measure-state-'));
await writeFile(path.join(stateDir, 'settings.json'), JSON.stringify({ vaultPath: VAULT, defaultAgent: 'codex' }));

const service = await createService({ repo, uiDir: path.join(repo, 'dist'), stateDir });
const headers = { Authorization: `Bearer ${service.token}` };
const say = (...parts) => console.log(...parts);

try {
  const bootstrap = await (await fetch(`${service.origin}/api/bootstrap`, { headers })).json();
  say('repo        :', bootstrap.repo);
  say('contentBase :', bootstrap.contentBase);
  say('vault root  :', VAULT);
  say('');

  // ---- 1. the URL the UI builds ------------------------------------------
  const uiUrl = `${bootstrap.contentBase}/workspace/${html}`;
  const uiResponse = await fetch(uiUrl, { headers });
  say('UI url      :', uiUrl);
  say('UI status   :', uiResponse.status, uiResponse.headers.get('content-type') || '');
  say('UI body     :', (await uiResponse.text()).slice(0, 200));
  say('');

  // ---- 2. the URL the service builds --------------------------------------
  const serviceUrl = service.files.url(path.join(VAULT, html));
  const serviceResponse = await fetch(serviceUrl, { headers });
  say('svc url     :', serviceUrl);
  say('svc status  :', serviceResponse.status);
  say('svc body    :', (await serviceResponse.text()).slice(0, 120).replace(/\s+/g, ' '));
  say('');

  // ---- 3. the Markdown preview, both ways ---------------------------------
  const uiPreview = await fetch(`${service.origin}/api/preview?path=${encodeURIComponent(`${bootstrap.repo}/workspace/${md}`)}`, { headers });
  say('UI preview  :', uiPreview.status, (await uiPreview.text()).slice(0, 200));
  const vaultPreview = await fetch(`${service.origin}/api/preview?path=${encodeURIComponent(path.join(VAULT, md))}`, { headers });
  const vaultBody = await vaultPreview.text();
  say('vault prev  :', vaultPreview.status, vaultBody.slice(0, 120).replace(/\s+/g, ' '));
  say('');

  // ---- 4. cards, the control that works ----------------------------------
  const registry = await (await fetch(`${service.origin}/api/workspace`, { headers })).json();
  const entity = registry.entities.find(item => item.folder === board);
  say('cards       :', (await fetch(`${service.origin}/api/workspace/cards/${entity.id}/1`, { headers })).status);
  say('registry    :', registry.entities.map(item => item.folder).join(', '));
  say('');

  // ---- 5. the board folder, for the record --------------------------------
  say('board.html  :', (await readFile(path.join(VAULT, board, 'board.html'), 'utf8')).length, 'bytes in the Vault');
} finally {
  await service.close();
}
