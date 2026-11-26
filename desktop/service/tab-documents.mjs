import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { validateRegistry, validateTabDocument, TAB_MAX_BYTES, TAB_MAX_IMAGE_BYTES, TAB_FORMAT, TAB_VERSION, ID_PATTERN, slugify, localDay } from './vault-schema.mjs';
import { realFile, saveJson, within } from './util.mjs';

const hash = source => createHash('sha256').update(source).digest('hex');
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const conflict = () => fail('This tab changed on disk. Your draft is kept. Review the latest version before saving.', 409);
const sourceOf = value => JSON.stringify(value, null, 2) + '\n';

export class TabDocuments {
  constructor(workspace) { this.workspace = workspace; this.repo = workspace.repo; }

  async resolve(boardId, pageId, tabId) {
    const registry = validateRegistry(await this.workspace.registry());
    const board = registry.boards.find(item => item.id === boardId);
    const page = board?.pages.find(item => item.id === pageId);
    const tab = page?.tabs.find(item => item.id === tabId);
    if (!board || !page || !tab) fail('This tab was not found.', 404);
    if (tab.viewer || !tab.path.endsWith('.tab.json')) fail('This tab is not an editable document.', 404);
    // A tab path is relative to the board's folder. A card document lives under
    // the page's own folder; an existing report stays where it was written, so
    // converting a Vault moves no report and breaks no relative link.
    const vaultRoot = await realpath(this.workspace.vault.root);
    const folder = this.workspace.folderPath(board);
    const { file: root, info: rootInfo } = await realFile(vaultRoot, path.relative(vaultRoot, folder));
    if (!rootInfo.isDirectory()) fail('Board folder not found.', 404);
    const { file, info } = await realFile(root, tab.path);
    if (!info.isFile() || info.size > TAB_MAX_BYTES) fail('Choose an editable tab of up to 1 MB.');
    return { board, page, tab, file, root, vaultRoot };
  }

  async read(boardId, pageId, tabId) {
    const target = await this.resolve(boardId, pageId, tabId), source = await readFile(target.file, 'utf8');
    if (Buffer.byteLength(source) > TAB_MAX_BYTES) fail('Choose an editable tab of up to 1 MB.');
    let document; try { document = JSON.parse(source); } catch { fail('This tab contains invalid JSON. Its original file has been kept.'); }
    return { document: validateTabDocument(document), revision: hash(source) };
  }

  /** Adds a tab to a page: the file first, then the registry entry. A failure
   *  in either half leaves neither behind. */
  create(boardId, pageId, { name, layout } = {}) {
    if (typeof name !== 'string' || !name.trim() || name.length > 120 || /[\x00-\x1f]/.test(name)) fail('Enter a tab name.');
    const wantedLayout = layout === undefined ? 'gallery' : layout;
    return this.workspace.change(async registry => {
      const board = registry.boards.find(item => item.id === boardId);
      if (!board) throw Object.assign(new Error('Board was not found.'), { status: 404 });
      const page = board.pages.find(item => item.id === pageId);
      if (!page) throw Object.assign(new Error('Page was not found.'), { status: 404 });
      const taken = new Set(page.tabs.map(item => item.id));
      let id = slugify(name);
      if (taken.has(id)) { for (let index = 2; index < 200; index++) if (!taken.has(id + index)) { id = id + index; break; } }
      const file = page.id + '/' + id + '.tab.json';
      const document = { format: TAB_FORMAT, version: TAB_VERSION, layout: wantedLayout, summary: '', nodes: [] };
      // Validating here means a bad layout is refused before a file is written.
      validateTabDocument(document);
      const folder = this.workspace.pagePath(board, page);
      await mkdir(folder, { recursive: true });
      try { await writeFile(path.join(this.workspace.folderPath(board), file), sourceOf(document), { flag: 'wx' }); }
      catch (error) { if (error.code === 'EEXIST') fail('A tab with that name already exists.'); throw error; }
      const tab = { id, name: name.trim(), path: file };
      page.tabs.push(tab);
      page.updated = localDay();
      board.updated = localDay();
      return { tab, document, revision: hash(sourceOf(document)) };
    });
  }

  save(boardId, pageId, tabId, options) {
    if (!options || typeof options !== 'object' || Array.isArray(options) || Object.keys(options).some(key => !['revision', 'document'].includes(key))) fail('Send the tab and its current revision.');
    let { revision, document } = options;
    if (typeof revision !== 'string' || !/^[a-f0-9]{64}$/.test(revision)) fail('Reopen the tab to get its current revision.');
    const validated = validateTabDocument(document), replacement = sourceOf(validated);
    if (Buffer.byteLength(replacement) > TAB_MAX_BYTES) fail('Keep this tab under 1 MB.');
    // Snapshot caller input before waiting for another write.
    document = JSON.parse(replacement);
    // Not on the registry's write chain: this writes one document, whose own
    // revision check is the guard, and the registry update below is queued
    // separately. Nesting the two would wait for itself.
    return (async () => {
      const target = await this.resolve(boardId, pageId, tabId), source = await readFile(target.file, 'utf8');
      if (hash(source) !== revision) conflict();
      const backups = path.join(this.repo, '.mrmak', 'tab-backups');
      await mkdir(backups, { recursive: true });
      const actualBackups = await realpath(backups);
      if (!within(await realpath(this.repo), actualBackups)) fail('The recovery folder must stay inside this repository.');
      const backupId = Date.now() + '-' + randomUUID();
      await writeFile(path.join(actualBackups, backupId + '.tab.json'), source, { flag: 'wx', mode: 0o600 });
      await writeFile(path.join(actualBackups, backupId + '.json'), sourceOf({ boardId, pageId, tabId, path: path.relative(this.repo, target.file), revision, savedAt: new Date().toISOString() }), { flag: 'wx', mode: 0o600 });
      await saveJson(target.file, document, { beforeReplace: async () => {
        const current = await this.resolve(boardId, pageId, tabId);
        if (current.file !== target.file || hash(await readFile(current.file)) !== revision) conflict();
      } });
      let warning;
      try {
        await this.workspace.change(registry => {
          const board = registry.boards.find(item => item.id === boardId);
          const page = board?.pages.find(item => item.id === pageId);
          const tab = page?.tabs.find(item => item.id === tabId);
          if (!tab) throw new Error('This tab was removed from the Vault.');
          page.updated = localDay();
          board.updated = localDay();
          return true;
        });
      } catch { warning = 'Your content was saved, but the Vault listing could not be refreshed. Reopen the tab to refresh its listing.'; }
      this.workspace.changed();
      return { document, revision: hash(replacement), ...(warning ? { warning } : {}) };
    })();
  }

  async image(boardId, pageId, tabId, request, name) {
    const target = await this.resolve(boardId, pageId, tabId);
    if (Number(request.headers['content-length']) > TAB_MAX_IMAGE_BYTES) fail('Choose an image of up to 16 MB.', 413);
    const chunks = []; let length = 0;
    for await (const chunk of request) { length += chunk.length; if (length > TAB_MAX_IMAGE_BYTES) fail('Choose an image of up to 16 MB.', 413); chunks.push(chunk); }
    const bytes = Buffer.concat(chunks);
    const extension = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? 'png'
      : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? 'jpg'
        : /^GIF8[79]a$/.test(bytes.subarray(0, 6).toString('ascii')) ? 'gif'
          : bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP' ? 'webp' : null;
    if (!extension) fail('Choose a PNG, JPEG, WebP or GIF image.');
    // A card's pictures live with the page, so deleting the page takes them too.
    const relative = target.page.id + '/media';
    const media = path.join(target.root, relative); await mkdir(media, { recursive: true });
    const { file: actualMedia, info } = await realFile(target.root, relative);
    if (!info.isDirectory()) fail('The image folder is not a directory.');
    const stem = path.basename(String(name || 'image')).replace(/\.[^.]*$/, '').replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 60) || 'image';
    const filename = stem + '-' + randomUUID().slice(0, 8) + '.' + extension;
    await writeFile(path.join(actualMedia, filename), bytes, { flag: 'wx' });
    return { image: 'media/' + filename };
  }
}
