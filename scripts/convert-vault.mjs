// One-way conversion of a Vault written before the page layer:
//   entities[] with steps[] and .card.json  ->  boards[] with pages[] and .tab.json
//
// It moves no report: a report tab keeps its own path, which is relative to the
// board folder, so every link next to it still resolves. Only a card becomes a
// tab document under the page's folder, and only the pictures that document
// names are copied beside it.
//
//   node scripts/convert-vault.mjs <vault folder> [--write]
//
// Without --write it prints what it would do and changes nothing.

import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VAULT_FORMAT, VAULT_VERSION, TAB_FORMAT, TAB_VERSION, slugify, validateRegistry, validateTabDocument } from '../desktop/service/vault-schema.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const write = args.includes('--write');
const root = path.resolve(args.find(value => !value.startsWith('--')) || path.join(here, '..', 'workspace'));
const file = path.join(root, 'workspace.json');

// The old tags were a free-form category. These are the four the deck offers now.
const TAGS = { project: 'game-project', research: 'research', 'image-gen': 'gallery', dev: 'app-project' };
const LAYOUTS = { gallery: 'gallery', workbench: 'workbench', pinboard: 'pinboard', research: 'workbench' };

const report = { boards: 0, pages: 0, documents: 0, reports: 0, media: 0, skipped: [] };

function cardNodes(card) {
  return (card.items || []).map(item => {
    const node = { kind: 'card', id: String(item.id), title: String(item.title === undefined ? '' : item.title) };
    for (const key of ['body', 'image', 'alt', 'prompt', 'url', 'linkLabel', 'feedback', 'annotation']) {
      if (item[key] !== undefined && item[key] !== '') node[key] = item[key];
    }
    if (item.status !== undefined) node.status = item.status;
    return node;
  });
}

async function convertCard(boardFolder, step, pageId, tabId) {
  const source = path.join(root, boardFolder, step.path);
  let card;
  try { card = JSON.parse(await readFile(source, 'utf8')); }
  catch (error) { report.skipped.push(step.path + ': ' + error.message); return null; }
  const document = {
    format: TAB_FORMAT, version: TAB_VERSION,
    layout: LAYOUTS[card.template] || 'gallery',
    summary: card.summary || '',
    nodes: cardNodes(card),
  };
  validateTabDocument(document);
  const pageFolder = path.join(root, boardFolder, pageId);
  const target = path.join(pageFolder, tabId + '.tab.json');
  if (write) {
    await mkdir(pageFolder, { recursive: true });
    await writeFile(target, JSON.stringify(document, null, 2) + '\n', { flag: 'wx' });
    // The pictures this document names travel with it. A shared one is copied,
    // not moved: the board-level report that also uses it still has it.
    for (const node of document.nodes) {
      for (const key of ['image', 'annotation']) {
        if (!node[key]) continue;
        const from = path.join(root, boardFolder, node[key]);
        const to = path.join(pageFolder, node[key]);
        try { await mkdir(path.dirname(to), { recursive: true }); await copyFile(from, to); report.media++; }
        catch (error) { report.skipped.push(node[key] + ': ' + error.message); }
      }
    }
  }
  report.documents++;
  return { id: tabId, name: step.name, path: pageId + '/' + tabId + '.tab.json' };
}

const registry = JSON.parse(await readFile(file, 'utf8'));
if (registry.format === VAULT_FORMAT) { console.log('Already ' + VAULT_FORMAT + ' v' + VAULT_VERSION + '. Nothing to do.'); process.exit(0); }
if (!Array.isArray(registry.entities)) { console.error('No entities in ' + file + '. Not a Vault registry.'); process.exit(1); }

const boards = [];
for (const entity of registry.entities) {
  const folder = entity.folder;
  if (typeof folder !== 'string' || !folder) { report.skipped.push('a board with no folder'); continue; }
  const pages = [];
  const pageIds = new Set();
  for (const step of entity.steps || []) {
    let pageId = slugify(step.name, 'page');
    while (pageIds.has(pageId)) pageId = pageId + '-2';
    pageIds.add(pageId);
    const tabs = [];
    if (step.viewer === 'card' && String(step.path).endsWith('.card.json')) {
      let tabId = 'overview';
      const tab = await convertCard(folder, step, pageId, tabId);
      if (tab) tabs.push(tab); else report.skipped.push(step.path + ' stayed a report');
    } else {
      tabs.push({ id: slugify(step.name, 'tab'), name: step.name, path: step.path, ...(step.viewer === 'compare3d' ? { viewer: 'compare3d' } : { viewer: 'report' }) });
      report.reports++;
    }
    pages.push({
      id: pageId, title: step.name, description: '',
      tags: [], created: entity.created, updated: entity.updated || entity.created,
      tabs,
    });
    report.pages++;
  }
  boards.push({
    id: entity.id, title: entity.title, description: entity.description || '',
    tags: [TAGS[entity.category] || 'research'],
    created: entity.created, updated: entity.updated || entity.created,
    folder, status: entity.status || 'active',
    ...(entity.pinned ? { pinned: true } : {}), ...(entity.sample ? { sample: true } : {}),
    ...(entity.icon ? { icon: entity.icon } : {}),
    ...(entity.agent ? { agent: { chatId: entity.agent.chatId, name: entity.agent.name, agent: entity.agent.agent } } : {}),
    pages,
  });
  report.boards++;
}

const next = { format: VAULT_FORMAT, version: VAULT_VERSION, boards };
validateRegistry(next);

console.log((write ? 'Converting ' : 'Would convert ') + root);
console.log('  boards    ' + report.boards);
console.log('  pages     ' + report.pages);
console.log('  documents ' + report.documents + ' (were .card.json)');
console.log('  reports   ' + report.reports + ' (path unchanged)');
if (report.media) console.log('  pictures  ' + report.media + ' copied beside their document');
if (report.skipped.length) console.log('  skipped   ' + report.skipped.length + '\n    ' + report.skipped.join('\n    '));

if (write) {
  await writeFile(file, JSON.stringify(next, null, 2) + '\n');
  console.log('Wrote ' + file + '. The old .card.json files were left in place; remove them once the boards read correctly.');
}
