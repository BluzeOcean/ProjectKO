// Second measurement: a self-contained fixture.
//
//  A. A board in a Vault OUTSIDE the repository, with a Markdown step and an
//     HTML step. What does the UI's URL do? What does the service's URL do?
//  B. The same board in the DEFAULT Vault (<repo>/workspace). Is the service's
//     URL byte-identical to the one the UI builds today?
//
// Usage: node .debuglog/board-files-resolve-against-the-repository-not-the-vault/measure-board-fixture.mjs

import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createService } from '../../desktop/service/server.mjs';

const say = (...parts) => console.log(...parts);
const scratch = name => mkdtemp(path.join(process.env.TEMP || '.', name));

async function build({ vaultOutside }) {
  const repo = await scratch('ko-repo-');
  await mkdir(path.join(repo, 'workspace', '_shared'), { recursive: true });
  await mkdir(path.join(repo, 'ui'));
  await writeFile(path.join(repo, 'ui', 'index.html'), '<html>Fixture</html>');
  await writeFile(path.join(repo, 'workspace', '_shared', 'report.css'), '/* chrome */');
  await writeFile(path.join(repo, 'workspace', 'workspace.json'), JSON.stringify({ entities: [] }));

  const vaultRoot = vaultOutside ? await scratch('ko-vault-') : path.join(repo, 'workspace');
  await mkdir(path.join(vaultRoot, 'board'), { recursive: true });
  await writeFile(path.join(vaultRoot, 'board', 'report.html'), '<html><body>Report</body></html>');
  await writeFile(path.join(vaultRoot, 'board', 'notes.md'), '# Notes\n\nHello.');
  const board = { id: 'b1', title: 'Board', category: 'research', status: 'active', folder: 'board', created: '2026-01-01', steps: [{ name: 'Report', path: 'report.html' }, { name: 'Notes', path: 'notes.md' }] };
  await writeFile(path.join(vaultRoot, 'workspace.json'), JSON.stringify({ entities: [board] }));

  const stateDir = await scratch('ko-state-');
  await writeFile(path.join(stateDir, 'settings.json'), JSON.stringify({ vaultPath: vaultRoot }));
  const service = await createService({ repo, uiDir: path.join(repo, 'ui'), stateDir });
  return { repo, vaultRoot, service };
}

async function probe(label, { repo, vaultRoot, service }) {
  const headers = { Authorization: `Bearer ${service.token}` };
  const bootstrap = await (await fetch(`${service.origin}/api/bootstrap`, { headers })).json();
  say(`--- ${label}`);
  say('  vault root  :', vaultRoot);
  say('  contentBase :', bootstrap.contentBase);

  for (const step of ['report.html', 'notes.md']) {
    const uiUrl = `${bootstrap.contentBase}/workspace/board/${step}`;
    const uiResponse = await fetch(uiUrl, { headers });
    say(`  UI  ${step} -> ${uiResponse.status}  ${(await uiResponse.text()).slice(0, 110).replace(/\s+/g, ' ')}`);

    const serviceUrl = service.files.url(path.join(vaultRoot, 'board', step));
    const serviceResponse = await fetch(serviceUrl, { headers });
    say(`  SVC ${step} -> ${serviceResponse.status}  ${serviceUrl}`);

    const preview = await fetch(`${service.origin}/api/preview?path=${encodeURIComponent(`${bootstrap.repo}/workspace/board/${step}`)}`, { headers });
    say(`  PRV ${step} -> ${preview.status}  ${(await preview.text()).slice(0, 110).replace(/\s+/g, ' ')}`);
  }
  say('');
}

const outside = await build({ vaultOutside: true });
try { await probe('A. Vault OUTSIDE the repository', outside); } finally { await outside.service.close(); }

const inside = await build({ vaultOutside: false });
try {
  await probe('B. DEFAULT Vault (<repo>/workspace)', inside);
  // The default must come out byte-identical to the URL the UI builds today.
  const headers = { Authorization: `Bearer ${inside.service.token}` };
  const bootstrap = await (await fetch(`${inside.service.origin}/api/bootstrap`, { headers })).json();
  const uiUrl = `${bootstrap.contentBase}/workspace/board/report.html`;
  const serviceUrl = inside.service.files.url(path.join(inside.vaultRoot, 'board', 'report.html'));
  say('  byte-identical to the UI url today?', uiUrl === serviceUrl ? 'YES' : `NO  ui=${uiUrl}\n     svc=${serviceUrl}`);
} finally { await inside.service.close(); }
