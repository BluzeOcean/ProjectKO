import path from 'node:path';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';

/**
 * The briefing a worker chat starts with.
 *
 * Project KO is still being built, so the briefing must not describe anything that a
 * later feature will change. It carries the facts that are true everywhere — this is a
 * Project KO project, here are the folders, do not go hunting — and points at one
 * module per domain in `desktop/modules/`. The map is generated from that folder, so a
 * domain is added by adding a file and changed by editing it.
 */

/** The agents whose CLI can take the briefing in its own prompt channel. */
export const BRIEFING_AGENTS = ['claude', 'dsh', 'opencode'];

/** The assembled text, and the owner's prose inside it. */
export const MAX_BRIEFING_BYTES = 12000;
export const MAX_PROSE_BYTES = 4000;

/** A module description in the map is a label, not the module itself. */
const LABEL_BYTES = 32;

export const briefingPath = (stateDir, id) => path.join(stateDir, `briefing-${id}.md`);

const frontmatter = text => {
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] || '';
  const field = name => {
    const match = new RegExp(`^${name}:[ \\t]*(.*)$`, 'm').exec(block);
    return match ? match[1].replace(/^['"]|['"]$/g, '').trim() : '';
  };
  return { name: field('name'), label: field('label'), description: field('description') };
};

/**
 * The module map: every module file, its label and where it lives.
 * A file without frontmatter still appears — the file name is the fallback label —
 * so a missing label is visible rather than silent.
 */
export async function modules(repo) {
  const folder = path.join(repo, 'desktop', 'modules');
  const entries = await readdir(folder, { withFileTypes: true }).catch(() => []);
  const found = [];
  for (const entry of entries.filter(item => item.isFile() && item.name.endsWith('.md')).sort((a, b) => a.name.localeCompare(b.name))) {
    const file = path.join(folder, entry.name);
    const text = await readFile(file, 'utf8').catch(() => '');
    const meta = frontmatter(text);
    found.push({ name: meta.name || entry.name.replace(/\.md$/, ''), label: meta.label, description: meta.description, file });
  }
  return found;
}

const label = text => {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  return value.length > LABEL_BYTES ? `${value.slice(0, LABEL_BYTES - 1).trimEnd()}…` : value;
};

/**
 * A fact about this session's harness, next to the live paths.
 *
 * Claude Code's task tool is called `Task`. The CLI's own prompt still tells the
 * model to use `TaskCreate` and `TaskUpdate` - names this build does not have -
 * so a worker follows the prompt into a call that fails, and says so as "no such
 * tool available". The tool list a session gets is decided by the CLI, so this is
 * the one place that can correct the name before the worker tries it.
 */
const sessionNotes = agent => agent === 'claude'
  ? ['- Task tool: `Task`. `TaskCreate`, `TaskUpdate` and `TaskList` do not exist in a Claude Code session; a call to one of them fails.']
  : [];

const inside = (child, parent) => {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};

/**
 * The text a chat starts with: the owner's prose, the module map, and the live paths.
 * The prose is trimmed from its tail when it is too long, so the live paths — the part
 * that changes per chat — always survive.
 */
export function assemble({ prose = '', modules = [], repo = '', vaultRoot = '', cwd = '', board = null, agent = '' } = {}) {
  const map = modules.length
    ? [`Read the module that covers your task, in ${path.join(repo, 'desktop', 'modules')}:`, ...modules.map(item => `- ${item.name}${item.label ? ` — ${item.label}` : item.description ? ` — ${label(item.description)}` : ''}`)]
    : [];
  const live = [
    repo ? `- App: ${repo}` : '',
    vaultRoot ? `- Vault: ${vaultRoot}` : '',
    cwd ? `- Workspace: ${cwd}` : '',
    board ? `- Board: ${board.folder} ("${board.title}")` : '',
  ].filter(Boolean);
  const tail = [
    map.join('\n'),
    live.join('\n'),
    sessionNotes(agent).join('\n'),
    'These paths are given; do not go hunting for Project KO.',
  ].filter(Boolean).join('\n\n');
  let head = String(prose || '').trim();
  const room = MAX_BRIEFING_BYTES - tail.length - 2;
  if (head.length > room) head = `${head.slice(0, Math.max(0, room - 1)).trimEnd()}…`;
  return head ? `${head}\n\n${tail}` : tail;
}

/**
 * The briefing service: it owns the text, the per-chat file and the cleanup.
 * `enabled` is read at launch time, so turning the setting off stops the briefing
 * for every later launch, including chats resumed later.
 */
export class Briefing {
  constructor({ repo, stateDir, vaultRoot = () => '', boards = async () => [], enabled = () => true }) {
    this.repo = repo;
    this.stateDir = stateDir;
    this.vaultRoot = vaultRoot;
    this.boards = boards;
    this.enabled = enabled;
  }

  /** The board whose folder holds this chat's working folder, when it is in the Vault. */
  async boardFor(cwd, vaultRoot) {
    if (!cwd || !vaultRoot) return null;
    const entities = await this.boards().catch(() => []);
    for (const entity of entities) {
      if (!entity?.folder || !entity.title) continue;
      const folder = path.join(vaultRoot, entity.folder);
      if (inside(path.resolve(cwd), path.resolve(folder))) return { id: entity.id, title: entity.title, folder };
    }
    return null;
  }

  /** The briefing for one chat, written to its own file. Null when it does not apply. */
  async forSession(session) {
    if (!this.enabled()) return null;
    if (!BRIEFING_AGENTS.includes(session.agent)) return null;
    const vaultRoot = this.vaultRoot();
    const board = await this.boardFor(session.cwd, vaultRoot);
    const prose = await readFile(path.join(this.repo, 'desktop', 'briefing.md'), 'utf8').catch(() => '');
    const text = assemble({ prose: prose.slice(0, MAX_PROSE_BYTES), modules: await modules(this.repo), repo: this.repo, vaultRoot, cwd: session.cwd, board, agent: session.agent });
    if (!text.trim()) return null;
    const file = briefingPath(this.stateDir, session.id);
    await mkdir(this.stateDir, { recursive: true });
    await writeFile(file, text, 'utf8');
    return { file, text, board, repo: this.repo };
  }

  /** Remove the files of chats that no longer exist. */
  async prune(liveIds = []) {
    const live = new Set(liveIds);
    const entries = await readdir(this.stateDir, { withFileTypes: true }).catch(() => []);
    let removed = 0;
    for (const entry of entries.filter(item => item.isFile() && item.name.startsWith('briefing-') && item.name.endsWith('.md'))) {
      if (live.has(entry.name.slice('briefing-'.length, -'.md'.length))) continue;
      await rm(path.join(this.stateDir, entry.name), { force: true }).catch(() => {});
      removed += 1;
    }
    return removed;
  }
}
