// Distribution checks: starter content, media closure, local skills and safe defaults.
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRegistry, validateTabDocument } from '../desktop/service/vault-schema.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => readFile(path.join(root, relative), 'utf8');
const { boards } = validateRegistry(JSON.parse(await read('workspace/workspace.json')));
const samples = boards.filter(board => board.sample === true);
// The onboarding board that taught the workspace was removed in 11adecd, so the
// starter carries three sample boards. The count follows the template, not the
// other way round.
assert.deepEqual(samples.map(board => board.id).sort(), ['arachne-character', 'creative-mcp', 'my-dream-game'], 'The template must retain its three sample boards.');
assert.deepEqual(samples.filter(board => board.pinned).map(board => board.title), ['My Dream Game']);
assert.ok(samples.every(board => board.status === 'active'));
assert.deepEqual(samples.map(board => board.tags[0]).sort(), ['gallery', 'research', 'research']);
const images = new Set(), videos = new Set(), arachneImages = new Set();
for (const board of boards) {
  assert.ok(board.pages.length > 0, board.id + ' must carry at least one page.');
  for (const page of board.pages) {
    assert.ok(page.tabs.length > 0, board.id + '/' + page.id + ' must carry at least one tab.');
    for (const tab of page.tabs) {
      const file = path.join('workspace', board.folder, tab.path);
      const content = await read(file);
      assert.ok(content.trim(), file + ' is empty');
      assert.doesNotMatch(content, /[\u0400-\u04ff]/u, file + ': authored sample content must be English');
      if (tab.path.endsWith('.tab.json')) {
        const document = validateTabDocument(JSON.parse(content));
        for (const node of document.nodes) {
          if (node.kind !== 'card' || !node.image) continue;
          const target = path.resolve(root, path.dirname(file), node.image);
          assert.ok(target.startsWith(path.resolve(root, path.dirname(file)) + path.sep));
          assert.ok((await stat(target)).isFile(), file + ': missing ' + node.image);
          images.add(target);
        }
        continue;
      }
      if (!file.endsWith('.html')) continue;
      assert.match(content, /data-mak-report="document"/);
      assert.match(content, /_shared\/report\.js/);
      for (const match of content.matchAll(/\b(?:src|href)="([^"#]+)"/g)) {
        if (/^(?:https?:|data:)/.test(match[1])) continue;
        const target = path.resolve(root, path.dirname(file), decodeURIComponent(match[1].split(/[?#]/)[0]));
        assert.ok(target.startsWith(root + path.sep), 'Asset reference must stay inside the template');
        assert.ok((await stat(target)).isFile(), file + ': missing ' + match[1]);
        if (/\.(webp|png)$/.test(target)) images.add(target);
        if (board.id === 'arachne-character' && /\.webp$/.test(target)) arachneImages.add(target);
        if (/\.mp4$/.test(target)) videos.add(target);
      }
      if (board.id === 'arachne-character') {
        assert.doesNotMatch(content, /lychee|leech|youtube|Discord|\bpoll\b|publication/i);
        assert.match(content, /<summary>Prompts<\/summary>/, 'Keep the saved generation prompts accessible.');
      }
    }
  }
}
assert.equal(arachneImages.size, 158, 'All Arachne images must be reachable from the tabs.');
assert.equal(videos.size, 8, 'Keep all eight motion studies.');
const skillNames = (await readdir(path.join(root, '.agents/skills'), { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name);
assert.equal(skillNames.length, 20);
for (const name of ['game-vfx-workflow', 'game-ui-workflow', 'game-animation-integration', 'game-level-design', 'game-audio-workflow', 'gameplay-visual-review']) {
  assert.ok(skillNames.includes(name), 'Missing game production workflow: ' + name);
}
for (const name of skillNames) {
  const skill = await read('.agents/skills/' + name + '/SKILL.md');
  assert.match(skill, /^---\r?\nname:/);
  const entry = await read('.claude/skills/' + name + '/SKILL.md');
  assert.equal(entry, skill, 'Claude must receive the full maintained skill.');
  assert.doesNotMatch(skill, /[A-Z]:[\\/]Users[\\/]/i, 'Shared skills must not contain a local account path.');
}
assert.deepEqual(JSON.parse(await read('.mcp.json')), { mcpServers: {} });
assert.doesNotMatch(await read('.env.example'), /^\w+=(?!\s*$)\S+/m, 'The example env must contain no assigned values.');
assert.match(await read('src/desktop/client.ts'), /defaultBypass: false/);
assert.match(await read('desktop/service/server.mjs'), /defaultBypass: false/);
assert.match(await read('desktop/service/sessions.mjs'), /bypass: options\.bypass === true/);
assert.match(await read('desktop/service/sessions.mjs'), /pinned = false, bypass = false/);
const readme = await read('README.md');
assert.match(readme, /Project KO is small\.\s+<img src="docs\/assets\/mr-mak\.png"[^>]+>\s*$/);
await stat(path.join(root, 'docs/assets/mr-mak.png'));
console.log('Template passed: three boards, one pin, ' + images.size + ' images, ' + videos.size + ' videos, ' + skillNames.length + ' shared skills, empty connections and account placeholders.');
