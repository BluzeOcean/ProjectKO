import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Briefing, assemble, briefingPath, modules } from '../briefing.mjs';
import { terminalCommand } from '../agents.mjs';
import { opencodeEnvironment } from '../opencode.mjs';
import { dshOverlay, personaFromDump } from '../dsh.mjs';
import { createService } from '../server.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

async function folder(name) {
  await mkdir(path.join(root, '.cache'), { recursive: true });
  return mkdtemp(path.join(root, '.cache', name));
}

// A repository with one module, one board and a Vault outside it.
async function fixture() {
  const repo = await folder('briefing-repo-');
  await mkdir(path.join(repo, 'ui'), { recursive: true });
  await writeFile(path.join(repo, 'ui', 'index.html'), '<html>Fixture</html>');
  await mkdir(path.join(repo, 'desktop', 'modules'), { recursive: true });
  await writeFile(path.join(repo, 'desktop', 'briefing.md'), '# Project KO\n\nThis project is handled by Project KO.\n');
  await writeFile(path.join(repo, 'desktop', 'modules', 'vault.md'), '---\nname: vault\nlabel: boards, tabs, cards\ndescription: The Vault and its boards.\n---\n\nThe Vault holds boards.\n');
  await writeFile(path.join(repo, 'desktop', 'modules', 'rules.md'), '---\nname: rules\nlabel: the working rules\ndescription: The working rules.\n---\n\nKeep it English.\n');
  const vault = await folder('briefing-vault-');
  const board = { id: 'b1', title: 'Lightkeeper', folder: '2026-01-01_lightkeeper' };
  await mkdir(path.join(vault, board.folder), { recursive: true });
  const stateDir = path.join(repo, '.mrmak');
  await mkdir(stateDir, { recursive: true });
  return { repo, vault: vault, stateDir, board };
}

test('the module map lists every module file, by name, with its label', async () => {
  const { repo } = await fixture();
  const found = await modules(repo);
  assert.deepEqual(found.map(item => item.name), ['rules', 'vault']);
  assert.equal(found[0].description, 'The working rules.');
  assert.ok(found[0].file.endsWith(path.join('desktop', 'modules', 'rules.md')));
});

test("the repository's own modules all carry a name, a label and a description", async () => {
  const found = await modules(root);
  assert.ok(found.length >= 4, 'The app must describe its domains as modules.');
  for (const item of found) {
    assert.ok(item.name && item.description, `${item.file} needs frontmatter with a name and a description.`);
    assert.ok(item.label, `${item.file} needs a short label: it is what the briefing's map shows.`);
  }
});

test('the briefing names the app, the Vault, the workspace and the board', async () => {
  const { repo, vault, board } = await fixture();
  const text = assemble({
    prose: '# Project KO\n\nThis project is handled by Project KO.\n',
    modules: await modules(repo),
    repo,
    vaultRoot: vault,
    cwd: path.join(vault, board.folder),
    board: { title: board.title, folder: path.join(vault, board.folder) },
  });
  assert.match(text, /Project KO/);
  assert.ok(text.includes(repo), 'the app repository is named');
  assert.ok(text.includes(vault), 'the Vault is named');
  assert.ok(text.includes(path.join(vault, board.folder)), 'the workspace is named');
  assert.ok(text.includes(board.title), 'the board is named');
  assert.match(text, /do not go hunting for Project KO/i);
  assert.match(text, /desktop.modules/, 'the module map is present');
});

test('a Claude Code chat is told the task tool by the name it really has', () => {
  // Claude Code's task tool is `Task`. Its own prompt still names `TaskCreate`,
  // so without this a worker follows the prompt into a call that cannot work.
  const claude = assemble({ prose: '', modules: [], repo: 'C:\\app', agent: 'claude' });
  assert.match(claude, /`Task`/, 'the tool that exists is named');
  assert.match(claude, /TaskCreate/, 'the name that does not exist is named too');
  const other = assemble({ prose: '', modules: [], repo: 'C:\\app', agent: 'dsh' });
  assert.doesNotMatch(other, /TaskCreate/, 'another harness is not told about a tool it does not have');
});

test('the written briefing of a Claude Code chat carries the task tool', async () => {
  const { repo, vault, stateDir } = await fixture();
  const briefing = new Briefing({ repo, stateDir, vaultRoot: () => vault, boards: async () => [] });
  const result = await briefing.forSession({ id: 'chat-task', agent: 'claude', cwd: repo });
  const written = await readFile(result.file, 'utf8');
  assert.match(written, /`Task`/);
});

test('the module map is generated: a new module file appears by itself', async () => {
  const { repo } = await fixture();
  await writeFile(path.join(repo, 'desktop', 'modules', 'assets.md'), '---\nname: assets\nlabel: raw and generated assets\ndescription: Where assets live.\n---\n\nIn the media folder.\n');
  const found = await modules(repo);
  assert.deepEqual(found.map(item => item.name), ['assets', 'rules', 'vault']);
});

test('an oversized prose is trimmed from its tail; the live paths survive', () => {
  const text = assemble({
    prose: 'x'.repeat(20000),
    modules: [],
    repo: 'C:\\app',
    vaultRoot: 'V:\\vault',
    cwd: 'V:\\project',
  });
  assert.ok(text.length <= 12000, `the briefing stays small: ${text.length}`);
  assert.ok(text.includes('C:\\app'), 'the app path survives');
  assert.ok(text.includes('V:\\vault'), 'the Vault path survives');
  assert.ok(text.includes('V:\\project'), 'the workspace path survives');
});

test('the setting off means no briefing and no file', async () => {
  const { repo, vault, stateDir } = await fixture();
  const off = new Briefing({ repo, stateDir, vaultRoot: () => vault, boards: async () => [], enabled: () => false });
  assert.equal(await off.forSession({ id: 'chat-1', agent: 'claude', cwd: repo }), null);

  const on = new Briefing({ repo, stateDir, vaultRoot: () => vault, boards: async () => [] });
  const result = await on.forSession({ id: 'chat-1', agent: 'claude', cwd: repo });
  assert.ok(result?.file, 'the briefing is written');
  const written = await readFile(result.file, 'utf8');
  assert.ok(written.includes(repo), 'the file carries the app path');
  assert.equal(briefingPath(stateDir, 'chat-1'), result.file);
});

test('an agent without a briefing channel is left alone', async () => {
  const { repo, vault, stateDir } = await fixture();
  const briefing = new Briefing({ repo, stateDir, vaultRoot: () => vault, boards: async () => [] });
  assert.equal(await briefing.forSession({ id: 'chat-2', agent: 'codex', cwd: repo }), null);
  assert.equal(await briefing.forSession({ id: 'chat-3', agent: 'shell', cwd: repo }), null);
});

test('the board is resolved only inside the Vault', async () => {
  const { repo, vault, stateDir, board } = await fixture();
  const briefing = new Briefing({ repo, stateDir, vaultRoot: () => vault, boards: async () => [board] });
  const inside = await briefing.forSession({ id: 'chat-4', agent: 'claude', cwd: path.join(vault, board.folder) });
  assert.equal(inside.board?.title, 'Lightkeeper');
  const outside = await briefing.forSession({ id: 'chat-5', agent: 'claude', cwd: repo });
  assert.equal(outside.board, null);
});

// A Windows launch of a script goes through PowerShell, so the arguments are
// base64 in the command line. A real executable is launched directly.
const launchOf = command => command.args.includes('-EncodedCommand')
  ? Buffer.from(command.args.at(-1), 'base64').toString('utf16le')
  : command.args.join(' ');

test('the Claude Code launch carries the briefing file and the app repository', async () => {
  const { repo } = await fixture();
  const command = terminalCommand('claude', { briefing: { file: path.join(repo, '.mrmak', 'briefing-x.md'), repo }, readDir: 'C:\\project' });
  const launch = launchOf(command);
  assert.ok(launch.includes('--append-system-prompt-file'), 'the briefing is a system prompt');
  assert.ok(launch.includes('briefing-x.md'), 'the briefing file is named');
  assert.ok(launch.includes(repo), 'the app repository is readable');
  // --add-dir takes every following argument, so it must come last.
  assert.ok(launch.indexOf('--add-dir') > launch.indexOf('--append-system-prompt-file'), 'the flag comes before --add-dir');
});

test('a Claude Code launch without a briefing is unchanged', () => {
  const command = terminalCommand('claude', { readDir: 'C:\\project' });
  assert.doesNotMatch(launchOf(command), /append-system-prompt/);
});

test('OpenCode carries the briefing as an instruction file and keeps the owner\'s own', async () => {
  const directory = await folder('briefing-opencode-');
  const env = opencodeEnvironment({ OPENCODE_CONFIG_CONTENT: JSON.stringify({ instructions: ['C:\\mine.md'] }) }, {
    stateDir: directory, session: { id: 'chat', nativeId: 'ses_1' }, major: 2, briefing: { file: 'C:\\briefing.md' },
  });
  const config = JSON.parse(env.OPENCODE_CONFIG_CONTENT);
  assert.deepEqual(config.instructions, ['C:\\mine.md', 'C:\\briefing.md']);
  assert.ok(config.plugins?.length, 'the observer plugin is still there');
});

test('the DeepSeek bridge is told about the briefing and the overlay', () => {
  const command = terminalCommand('dsh', { briefing: { file: 'C:\\briefing.md', overlay: 'C:\\briefing.patch.yml' }, dshLog: 'C:\\chat.jsonl' });
  assert.ok(command.args.includes('--briefing'));
  assert.ok(command.args.includes('C:\\briefing.md'));
  assert.ok(command.args.includes('--overlay'));
});

test('the DeepSeek overlay fills the persona suffix and keeps the persona prefix', () => {
  const overlay = dshOverlay('# Project KO\n\nThe app is here.');
  assert.match(overlay, /- id: system-prompt/);
  assert.match(overlay, /personaPrefix: "You are a coding agent powered by the \{\{model\}\} model\."/);
  assert.match(overlay, /personaSuffix: \|-/);
  assert.ok(overlay.includes('# Project KO'));
});

test('a complete variable group in the briefing is made literal', () => {
  const overlay = dshOverlay('Read {{secret}} now');
  assert.ok(!/\{\{[^}]*\}\}/.test(overlay.split('personaSuffix: |-')[1]), 'no variable group survives in the suffix');
  assert.ok(overlay.includes('{ {secret} }'));
});

test('the persona prefix is read from the harness dump', () => {
  const dump = ['- id: something', '  name: x', '- id: system-prompt', "  name: '@deepseek-ai/dsh-system-prompt'", '  config:', '    personaPrefix: You are a coding agent powered by the {{model}} model.', '- id: next', '  name: y'].join('\n');
  assert.equal(personaFromDump(dump), 'You are a coding agent powered by the {{model}} model.');
  assert.equal(personaFromDump('- id: other\n  name: x'), null);
});

test('a chat that starts carries the briefing on its command line', async () => {
  const { repo } = await fixture();
  // A stand-in for the CLI: it writes the arguments it was given and stops.
  const bin = await folder('briefing-bin-');
  const argsFile = path.join(bin, 'args.txt');
  await writeFile(path.join(bin, process.platform === 'win32' ? 'claude.cmd' : 'claude'), `@echo off\r\necho %* > "${argsFile}"\r\n`, { mode: 0o755 });
  const previous = process.env.PATH;
  process.env.PATH = bin + path.delimiter + (previous || '');
  const service = await createService({ repo, uiDir: path.join(repo, 'ui') });
  try {
    await service.sessions.create({ agent: 'claude', name: 'Briefing check', cwd: repo });
    await new Promise(resolve => setTimeout(resolve, 2000));
    const written = await readFile(argsFile, 'utf8').catch(() => '');
    assert.ok(written.includes('--append-system-prompt-file'), `the launch carries the briefing: ${written}`);
    assert.ok(written.includes('briefing-'), 'the briefing file is named');
  } finally {
    await service.close();
    if (previous === undefined) delete process.env.PATH; else process.env.PATH = previous;
  }
});

test('the setting is on by default and can be turned off', async () => {
  const repo = await folder('briefing-settings-');
  await mkdir(path.join(repo, 'ui'), { recursive: true });
  await writeFile(path.join(repo, 'ui', 'index.html'), '<html>Fixture</html>');
  const service = await createService({ repo, uiDir: path.join(repo, 'ui') });
  const headers = { Authorization: `Bearer ${service.token}`, 'Content-Type': 'application/json', Origin: service.origin };
  try {
    const bootstrap = await (await fetch(`${service.origin}/api/bootstrap`, { headers })).json();
    assert.equal(bootstrap.settings.workerBriefing, true);
    const changed = await (await fetch(`${service.origin}/api/settings`, { method: 'POST', headers, body: JSON.stringify({ workerBriefing: false }) })).json();
    assert.equal(changed.workerBriefing, false);
    const saved = JSON.parse(await readFile(path.join(repo, '.mrmak', 'settings.json'), 'utf8'));
    assert.equal(saved.workerBriefing, false);
  } finally { await service.close(); }
});
