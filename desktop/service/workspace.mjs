import { readFile, stat, realpath, mkdir, readdir, rmdir } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { realFile, saveJson, sleep, within } from './util.mjs';
import { validateRegistry, validateTabDocument, tabText, TAB_MAX_BYTES, ID_PATTERN, localDay, folderFor, slugify } from './vault-schema.mjs';

const execute = promisify(execFile);
export { localDay };

const briefTab = tab => ({ id: tab.id, name: tab.name, path: tab.path, viewer: tab.viewer });
const briefPage = page => ({ id: page.id, title: page.title, description: page.description || '', tags: page.tags || [], created: page.created, updated: page.updated, icon: page.icon, tabs: (page.tabs || []).map(briefTab) });
const briefBoard = board => ({ id: board.id, title: board.title, description: board.description || '', tags: board.tags || [], status: board.status, created: board.created, updated: board.updated, pinned: !!board.pinned, sample: !!board.sample, folder: board.folder, icon: board.icon, pages: (board.pages || []).map(briefPage) });

const invalid = message => Object.assign(new Error(message), { status: 400 });
const STALE = Symbol('stale');

// Removes <script> and <style> blocks in one pass. A lazy regex up to the closing
// tag rescans the rest of the text for every unclosed opening tag, which lets a
// report stall the service. An unclosed block hides the rest, as it does in a browser.
export function stripCodeBlocks(text) {
  const opening = /<(script|style)\b/gi, closing = { script: /<\/script>/gi, style: /<\/style>/gi };
  let result = '', kept = 0, match;
  while ((match = opening.exec(text))) {
    const tagEnd = text.indexOf('>', opening.lastIndex);
    if (tagEnd < 0) break;
    const close = closing[match[1].toLowerCase()];
    close.lastIndex = tagEnd + 1;
    result += text.slice(kept, match.index) + ' ';
    if (!close.exec(text)) return result;
    kept = opening.lastIndex = close.lastIndex;
  }
  return result + text.slice(kept);
}

// What a board's own record may be changed to from the UI. The files, the pages
// and the folder are never reachable from here.
export function boardPatch(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.keys(value).length || Object.keys(value).some(key => !['tags', 'status', 'pinned'].includes(key))) {
    throw invalid('Choose tags, a status or a pin change.');
  }
  return value;
}
export const pagePatch = value => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.keys(value).length || Object.keys(value).some(key => !['title', 'description', 'tags'].includes(key))) {
    throw invalid('Choose a title, a description or tags.');
  }
  return value;
};

export class Workspace {
  constructor(vault, changed = () => {}) {
    // A plain repository path still means its own 'workspace/', which is what
    // the service opens when no Vault folder has been chosen.
    this.vault = typeof vault === 'string'
      ? { repo: vault, root: path.join(vault, 'workspace'), file: path.join(vault, 'workspace', 'workspace.json') }
      : vault;
    // The registry path is read from the Vault on every call: pointing the Vault
    // at another folder must move the registry this workspace reads.
    this.repo = this.vault.repo; this.changed = changed; this.writes = Promise.resolve();
  }

  /** The registry, validated. A registry from before the page layer is refused
   *  by name rather than read as if it were empty. */
  async registry() {
    return validateRegistry(JSON.parse(await readFile(this.vault.file, 'utf8')));
  }

  async list({ query = '', tag, status } = {}) {
    const { boards } = await this.registry();
    const needle = String(query || '').toLowerCase();
    return boards
      .filter(board => !needle || [board.id, board.title, board.description || '', ...board.pages.map(page => page.title)].join(' ').toLowerCase().includes(needle))
      .filter(board => !tag || (board.tags || []).includes(tag))
      .filter(board => !status || board.status === status)
      .map(briefBoard);
  }

  /** What an agent reads: one tab, as text. */
  async read(boardId, pageId, tabId) {
    const board = (await this.registry()).boards.find(item => item.id === boardId);
    if (!board) throw new Error('Board was not found.');
    const result = { ...briefBoard(board), page: undefined, tab: undefined, text: '' };
    const page = pageId ? board.pages.find(item => item.id === pageId) : board.pages[0];
    if (!page) return result;
    const tab = tabId ? page.tabs.find(item => item.id === tabId) : page.tabs[0];
    result.page = briefPage(page);
    if (!tab) return result;
    result.tab = briefTab(tab);
    // A tab path is relative to the board's folder, so the folder is the base
    // for a report beside it and for a card document under the page's folder.
    const { file } = await realFile(this.folderPath(board), tab.path.split('?')[0]);
    if (tab.path.endsWith('.tab.json') && !tab.viewer && (await stat(file)).size <= TAB_MAX_BYTES) {
      return { ...result, text: tabText(validateTabDocument(JSON.parse(await readFile(file, 'utf8')))).slice(0, 12000) };
    }
    if (!/\.(html?|md|txt)$/i.test(file) || (await stat(file)).size > 3 * 1024 * 1024) return { ...result, note: 'This tab uses a visual or large report. Open it for the full content.' };
    const text = await readFile(file, 'utf8');
    result.text = stripCodeBlocks(text).replace(/<[^<>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim().slice(0, 12000);
    return result;
  }

  async activity(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new Error('Use a date in YYYY-MM-DD format.');
    const { boards } = await this.registry();
    // A Vault outside the repository has no Git history to read: the dates the
    // registry keeps are the record then.
    const relative = within(this.repo, this.vault.root) ? path.relative(this.repo, this.vault.root).split(path.sep).filter(Boolean).join('/') : '';
    const prefix = relative ? relative + '/' : '';
    const { stdout = '' } = relative
      ? await execute('git', ['log', '--since=' + date + 'T00:00:00', '--until=' + date + 'T23:59:59', '--format=%s', '--name-only', '--max-count=45', '--', relative], { cwd: this.repo, windowsHide: true, maxBuffer: 128 * 1024 }).catch(() => ({}))
      : {};
    const lines = stdout.split(/\r?\n/).filter(Boolean);
    const paths = prefix ? lines.filter(line => line.startsWith(prefix)) : [];
    const found = boards.filter(board => board.created === date || board.updated === date || paths.some(file => file.startsWith(prefix + board.folder + '/'))).map(briefBoard);
    return { date, boards: found, commits: [...new Set(lines.filter(line => !prefix || !line.startsWith(prefix)))].slice(0, 15), basis: 'Vault dates and recorded Git changes; not a complete record of unsaved work.' };
  }

  write(operation) {
    const result = this.writes.catch(() => {}).then(operation);
    // A rejected revision is an expected response, not a failed shutdown job.
    this.writes = result.catch(() => {});
    return result;
  }

  /** Read-modify-write of the registry, keeping another writer's change instead
   *  of overwriting it. The update mutates the registry and returns a value. */
  change(update) {
    return this.write(async () => {
      for (let attempt = 0; attempt < 6; attempt++) {
        const file = this.vault.file;
        const source = await readFile(file, 'utf8');
        const registry = validateRegistry(JSON.parse(source));
        const result = await update(registry);
        if (result === STALE) continue;
        // Validate what is about to be written, not only what was read: a bad
        // tag from the UI must fail here, not on the next open.
        validateRegistry(registry);
        if (await readFile(file, 'utf8') !== source) continue;
        try {
          await saveJson(file, registry, { beforeReplace: async () => {
            if (await readFile(file, 'utf8') !== source) throw Object.assign(new Error('The Vault changed while saving.'), { code: 'ESTALE' });
          } });
        } catch (error) {
          // Windows indexers and readers can briefly lock atomic replacements.
          if (!['EPERM', 'EACCES', 'EBUSY', 'ESTALE'].includes(error.code) || attempt === 5) throw error;
          await sleep(40 * (attempt + 1));
          continue;
        }
        this.changed();
        return result;
      }
      throw new Error('The Vault is being updated by another task. Try the change again.');
    });
  }

  /** A board's folder, as an absolute path. The name must be a plain folder
   *  name inside the Vault, never a path of its own. */
  folderPath(board) {
    const name = board.folder;
    if (typeof name !== 'string' || !name.trim() || name !== path.basename(name) || name === '.' || name === '..') {
      throw invalid('This board has no folder of its own.');
    }
    return path.join(this.vault.root, name);
  }

  /** A page's folder is the board's folder plus the page's own id. */
  pagePath(board, page) {
    if (typeof page.id !== 'string' || !ID_PATTERN.test(page.id)) throw invalid('This page has no id of its own.');
    return path.join(this.folderPath(board), page.id);
  }

  /** Creates a folder, adding -2, -3 ... only when the plain name is taken. */
  async uniqueFolder(parent, wanted) {
    for (let index = 1; index < 50; index++) {
      const name = index === 1 ? wanted : wanted + '-' + index;
      try { await mkdir(path.join(parent, name)); return name; }
      catch (error) { if (error.code !== 'EEXIST') throw error; }
    }
    throw invalid('Too many folders share that name. Choose another title.');
  }

  async createBoard({ title, description, tags } = {}) {
    if (typeof title !== 'string' || !title.trim() || title.length > 200 || /[\x00-\x1f]/.test(title)) throw invalid('Enter a board title.');
    if (description !== undefined && (typeof description !== 'string' || description.length > 240)) throw invalid('The description must be up to 240 characters.');
    // Read the registry first: on an old Vault this throws before a folder is
    // made, so a refused create leaves nothing behind.
    const existing = await this.registry();
    const root = await realpath(this.vault.root);
    const wanted = folderFor(title.trim(), localDay());
    const folder = await this.uniqueFolder(root, wanted);
    const board = {
      id: slugify(title), title: title.trim(), description: (description || '').replace(/\s+/g, ' ').trim().slice(0, 240),
      tags: Array.isArray(tags) ? tags : [], created: localDay(), updated: localDay(), folder,
      status: 'active', pinned: false, pages: [],
    };
    // The folder name carries the day; the id only has to be unique, and a
    // second board with the same title keeps its own id.
    const taken = new Set(existing.boards.map(item => item.id));
    if (taken.has(board.id)) {
      for (let index = 2; index < 200; index++) { if (!taken.has(board.id + '-' + index)) { board.id = board.id + '-' + index; break; } }
    }
    try {
      await this.change(registry => { registry.boards.push(board); return briefBoard(board); });
    } catch (error) { await removeEmpty(path.join(root, folder)); throw error; }
    return briefBoard(board);
  }

  async createPage(boardId, { title, description, tags } = {}) {
    if (typeof title !== 'string' || !title.trim() || title.length > 200 || /[\x00-\x1f]/.test(title)) throw invalid('Enter a page title.');
    const board = (await this.registry()).boards.find(item => item.id === boardId);
    if (!board) throw Object.assign(new Error('Board was not found.'), { status: 404 });
    const folder = await this.uniqueFolder(this.folderPath(board), slugify(title));
    const page = {
      id: folder, title: title.trim(), description: (description || '').replace(/\s+/g, ' ').trim().slice(0, 240),
      tags: Array.isArray(tags) ? tags : [], created: localDay(), updated: localDay(), tabs: [],
    };
    try {
      await this.change(registry => {
        const target = registry.boards.find(item => item.id === boardId);
        if (!target) throw Object.assign(new Error('Board was not found.'), { status: 404 });
        if (target.pages.some(item => item.id === page.id)) throw invalid('This page already exists.');
        target.pages.push(page);
        target.updated = localDay();
        return briefPage(page);
      });
    } catch (error) { await removeEmpty(path.join(this.folderPath(board), folder)); throw error; }
    return briefPage(page);
  }

  updateBoard(boardId, patch) {
    const clean = boardPatch(patch);
    return this.change(registry => {
      const board = registry.boards.find(item => item.id === boardId);
      if (!board) throw Object.assign(new Error('Board was not found.'), { status: 404 });
      if (clean.tags !== undefined) board.tags = clean.tags;
      if (clean.pinned !== undefined) board.pinned = clean.pinned;
      if (clean.status !== undefined) board.status = clean.status;
      board.updated = localDay();
      // Validate the record the same way the reader will, so a bad tag cannot
      // be written by the UI and only discovered on the next open.
      return briefBoard(board);
    });
  }

  updatePage(boardId, pageId, patch) {
    const clean = pagePatch(patch);
    return this.change(registry => {
      const board = registry.boards.find(item => item.id === boardId);
      const page = board?.pages.find(item => item.id === pageId);
      if (!page) throw Object.assign(new Error('Page was not found.'), { status: 404 });
      if (clean.title !== undefined) page.title = clean.title;
      if (clean.description !== undefined) page.description = clean.description;
      if (clean.tags !== undefined) page.tags = clean.tags;
      page.updated = localDay();
      board.updated = localDay();
      return briefPage(page);
    });
  }

  /** Takes a board out of the registry. Its files are left where they are:
   *  the caller decides what happens to them, so a failure there cannot take
   *  the user's work with it. */
  removeBoard(boardId) {
    return this.change(registry => {
      const index = registry.boards.findIndex(item => item.id === boardId);
      if (index < 0) throw Object.assign(new Error('Board was not found.'), { status: 404 });
      // The folder is settled before anything is written, so a board with an
      // odd folder name is never half-removed.
      const folder = this.folderPath(registry.boards[index]);
      const [board] = registry.boards.splice(index, 1);
      return { board: briefBoard(board), folder };
    });
  }

  /** Takes one page out of a board. Its folder goes to the caller, like a board's. */
  removePage(boardId, pageId) {
    return this.change(registry => {
      const board = registry.boards.find(item => item.id === boardId);
      if (!board) throw Object.assign(new Error('Board was not found.'), { status: 404 });
      const index = board.pages.findIndex(item => item.id === pageId);
      if (index < 0) throw Object.assign(new Error('Page was not found.'), { status: 404 });
      const folder = this.pagePath(board, board.pages[index]);
      const [page] = board.pages.splice(index, 1);
      board.updated = localDay();
      return { page: briefPage(page), board: briefBoard(board), folder };
    });
  }

}

async function removeEmpty(folder) {
  try { const left = await readdir(folder); if (!left.length) await rmdir(folder); } catch { /* The folder is not there to remove. */ }
}
