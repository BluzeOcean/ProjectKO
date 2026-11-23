import { mkdir, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };

/**
 * The Vault keeps the app's data away from the app: one folder of board
 * folders and one registry file, free to live on another drive, a synced
 * folder or a share. A fresh install opens `workspace/` inside the
 * repository, which stays the default until another folder is chosen.
 */
export class Vault {
  constructor(repo, requested) {
    this.repo = repo;
    this.root = path.resolve(requested || path.join(repo, 'workspace'));
    this.file = path.join(this.root, 'workspace.json');
  }

  get isDefault() { return this.root === path.join(this.repo, 'workspace'); }

  /** Creates the folder and an empty registry when they are not there yet. */
  async open() {
    await mkdir(this.root, { recursive: true });
    await writeFile(this.file, '{"entities":[]}\n', { flag: 'wx' }).catch(error => {
      if (error.code !== 'EEXIST') throw error;
    });
    this.root = await realpath(this.root);
    this.file = path.join(this.root, 'workspace.json');
    return this;
  }

  /**
   * Points the service at another folder. The old boards stay where they are:
   * moving files is the owner's decision, not a side effect of a setting.
   */
  async pointTo(requested) {
    const value = typeof requested === 'string' ? requested.trim() : '';
    if (!value || !path.isAbsolute(value)) fail('Choose an absolute folder for the Vault.');
    if (path.resolve(value) === this.repo) fail('Choose a folder for the Vault, not the repository itself.');
    const next = new Vault(this.repo, value);
    try { await next.open(); }
    catch (error) { fail('That folder cannot hold the Vault. ' + (error.code === 'EACCES' ? 'Permission was denied.' : error.message)); }
    if (next.root === this.root) return this;
    this.root = next.root;
    this.file = next.file;
    return this;
  }
}
