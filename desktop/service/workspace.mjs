import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { realFile, saveJson, sleep, within } from './util.mjs';
import { validateCard, cardText, CARD_MAX_BYTES, localDay } from './card-schema.mjs';

const execute = promisify(execFile);
export { localDay };
const brief = ({ id, title, description, status, category, created, updated, pinned, steps }) => ({ id, title, description, status, category, created, updated, pinned: !!pinned, steps: (steps || []).map(({ name }, index) => ({ name, index })) });
const invalid = message => Object.assign(new Error(message), { status: 400 });

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

// UI requests can only change card metadata, never report paths or contents.
export function metadataPatch(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.keys(value).length || Object.keys(value).some(key => !['status', 'category', 'pinned'].includes(key))) {
    throw invalid('Choose a status, category or pin change.');
  }
  return value;
}

export class Workspace {
  constructor(vault, changed = () => {}) {
    // A plain repository path still means its own `workspace/`, which is what
    // the service opens when no Vault folder has been chosen.
    this.vault = typeof vault === 'string'
      ? { repo: vault, root: path.join(vault, 'workspace'), file: path.join(vault, 'workspace', 'workspace.json') }
      : vault;
    this.repo = this.vault.repo; this.file = this.vault.file; this.changed = changed; this.writes = Promise.resolve();
  }
  async registry() {
    const registry = JSON.parse(await readFile(this.file, 'utf8'));
    if (!Array.isArray(registry.entities)) throw new Error('Workspace registry is not ready.');
    return registry;
  }
  async list({ query = '', date, status } = {}) {
    const { entities } = await this.registry();
    return entities.filter(item => (!query || `${item.id} ${item.title} ${item.description}`.toLowerCase().includes(query.toLowerCase())) && (!date || item.created === date || item.updated === date) && (!status || item.status === status)).map(brief);
  }
  async read(id, step = 0) {
    const entity = (await this.registry()).entities.find(item => item.id === id);
    if (!entity) throw new Error('Board was not found.');
    const result = { ...brief(entity), text: '' };
    const selected = entity.steps?.[step];
    if (!selected) return result;
    const relative = path.join(entity.folder, selected.path.split('?')[0]);
    const { file } = await realFile(this.vault.root, relative);
    if (selected.viewer === 'card' && file.endsWith('.card.json') && (await stat(file)).size <= CARD_MAX_BYTES) return { ...result, text: cardText(validateCard(JSON.parse(await readFile(file, 'utf8')))).slice(0, 12000) };
    if (!/\.(html?|md|txt)$/i.test(file) || (await stat(file)).size > 3 * 1024 * 1024) return { ...result, note: 'The card uses a visual or large report. Open it for the full content.' };
    const text = await readFile(file, 'utf8');
    result.text = stripCodeBlocks(text).replace(/<[^<>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim().slice(0, 12000);
    return result;
  }
  async activity(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new Error('Use a date in YYYY-MM-DD format.');
    const registry = await this.registry();
    // A Vault outside the repository has no Git history to read: the dates the
    // registry keeps are the record then.
    const relative = within(this.repo, this.vault.root) ? path.relative(this.repo, this.vault.root).split(path.sep).filter(Boolean).join('/') : '';
    const prefix = relative ? `${relative}/` : '';
    const { stdout = '' } = relative
      ? await execute('git', ['log', `--since=${date}T00:00:00`, `--until=${date}T23:59:59`, '--format=%s', '--name-only', '--max-count=45', '--', relative], { cwd: this.repo, windowsHide: true, maxBuffer: 128 * 1024 }).catch(() => ({}))
      : {};
    const lines = stdout.split(/\r?\n/).filter(Boolean);
    const paths = prefix ? lines.filter(line => line.startsWith(prefix)) : [];
    const cards = registry.entities.filter(item => item.created === date || item.updated === date || paths.some(file => file.startsWith(`${prefix}${item.folder}/`))).map(brief);
    return { date, cards, commits: [...new Set(lines.filter(line => !prefix || !line.startsWith(prefix)))].slice(0, 15), basis: 'Vault dates and recorded Git changes; not a complete record of unsaved work.' };
  }
  update(id, patch) {
    const operation = this.writes.catch(() => {}).then(async () => {
      if (patch.status !== undefined && !['active', 'done', 'archived'].includes(patch.status)) throw invalid('Use active, done or archived status.');
      if (patch.pinned !== undefined && typeof patch.pinned !== 'boolean') throw invalid('Pinned must be true or false.');
      if (patch.category !== undefined && (typeof patch.category !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(patch.category))) throw invalid('Use a category with lowercase letters, numbers and hyphens.');
      if (patch.status === undefined && patch.pinned === undefined && patch.category === undefined) throw invalid('Choose a status, category or pin change.');
      for (let attempt = 0; attempt < 6; attempt++) {
        const source = await readFile(this.file, 'utf8');
        const registry = JSON.parse(source);
        const entity = registry.entities.find(item => item.id === id);
        if (!entity) throw Object.assign(new Error('Board was not found.'), { status: 404 });
        if (patch.status !== undefined) entity.status = patch.status;
        if (patch.pinned !== undefined) entity.pinned = patch.pinned;
        if (patch.category !== undefined) entity.category = patch.category;
        entity.updated = localDay();
        // Preserve other agents' latest registry changes instead of saving a stale snapshot.
        if (await readFile(this.file, 'utf8') !== source) continue;
        try { await saveJson(this.file, registry, { beforeReplace: async () => {
          if (await readFile(this.file, 'utf8') !== source) throw Object.assign(new Error('Workspace changed while saving.'), { code: 'ESTALE' });
        } }); }
        catch (error) {
          // Windows indexers/readers can briefly lock atomic replacements. Retry
          // from a fresh registry so another agent's edits are still retained.
          if (!['EPERM', 'EACCES', 'EBUSY', 'ESTALE'].includes(error.code) || attempt === 5) throw error;
          await sleep(40 * (attempt + 1));
          continue;
        }
        this.changed();
        return brief(entity);
      }
      throw new Error('Workspace is being updated by another task. Try the change again.');
    });
    // The chain itself never rejects: a refused or failed write must not
    // poison the next one, nor the service's shutdown.
    this.writes = operation.catch(() => {});
    return operation;
  }

  /** A board's folder, as an absolute path. The name must be a plain folder
   *  name inside `workspace/`, never a path of its own. */
  folderPath(entity) {
    const name = entity.folder;
    if (typeof name !== 'string' || !name.trim() || name !== path.basename(name) || name === '.' || name === '..') {
      throw invalid('This board has no folder of its own.');
    }
    return path.join(this.vault.root, name);
  }

  /** Takes a board out of the registry. Its files are left where they are:
   *  the caller decides what happens to them, so a failure there cannot take
   *  the user's work with it. */
  remove(id) {
    const operation = this.writes.catch(() => {}).then(async () => {
      for (let attempt = 0; attempt < 6; attempt++) {
        const source = await readFile(this.file, 'utf8');
        const registry = JSON.parse(source);
        const index = registry.entities.findIndex(item => item.id === id);
        if (index < 0) throw Object.assign(new Error('Board was not found.'), { status: 404 });
        const [entity] = registry.entities.splice(index, 1);
        // The folder is settled before anything is written, so a board with an
        // odd folder name is never half-removed.
        const folder = this.folderPath(entity);
        // Preserve other agents' latest registry changes instead of saving a stale snapshot.
        if (await readFile(this.file, 'utf8') !== source) continue;
        try { await saveJson(this.file, registry, { beforeReplace: async () => {
          if (await readFile(this.file, 'utf8') !== source) throw Object.assign(new Error('Workspace changed while saving.'), { code: 'ESTALE' });
        } }); }
        catch (error) {
          // Windows indexers/readers can briefly lock atomic replacements. Retry
          // from a fresh registry so another agent's edits are still retained.
          if (!['EPERM', 'EACCES', 'EBUSY', 'ESTALE'].includes(error.code) || attempt === 5) throw error;
          await sleep(40 * (attempt + 1));
          continue;
        }
        this.changed();
        return { entity: brief(entity), folder };
      }
      throw new Error('Workspace is being updated by another task. Try the change again.');
    });
    // The chain itself never rejects: a refused or failed delete must not
    // poison the next write, nor the service's shutdown.
    this.writes = operation.catch(() => {});
    return operation;
  }
}
