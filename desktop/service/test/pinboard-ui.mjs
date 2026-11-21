// Runs only against an isolated Workspace. The hand-off is stubbed here: the
// service already has its own test for the chat a board remembers, and this
// one is about the browser — the wall, the pen, the feedback and the save.
import { expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createService } from '../server.mjs';
import { localDay } from '../workspace.mjs';
import { launchBrowser, desktopAuth } from './browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const sampleAssets = process.env.MRMAK_CARDS_SAMPLE_DIR || path.join(root, 'workspace/2026-09-15_my-dream-game/assets');
await mkdir(path.join(root, '.cache'), { recursive: true });
const repo = await mkdtemp(path.join(root, '.cache', 'pinboard-ui-'));
await cp(path.join(root, 'dist'), path.join(repo, 'ui'), { recursive: true });
await cp(path.join(root, 'public/assets'), path.join(repo, 'ui/assets'), { recursive: true });
await mkdir(path.join(repo, 'workspace'), { recursive: true });
await writeFile(path.join(repo, 'workspace/workspace.json'), JSON.stringify({ entities: [] }));
const service = await createService({ repo, uiDir: path.join(repo, 'ui'), mcpOptions: { home: repo, env: {} } });
let browser;
try {
  browser = await launchBrowser();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await desktopAuth(context, service.urls.workspace);
  const page = await context.newPage(); page.setDefaultTimeout(12000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(service.urls.workspace);

  // A board born with the Pinboard view.
  await page.getByRole('button', { name: '+ New board', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New board' });
  await dialog.getByLabel('Board title').fill('Arachne Character Lab');
  await dialog.getByLabel('What is this board for?').fill('References for the cast.');
  await dialog.getByRole('button', { name: 'Image gen', exact: true }).click();
  await dialog.getByRole('button', { name: 'Pinboard', exact: true }).click();
  await expect(dialog.locator('.new-card-strip-line')).toContainText('Pinboard');
  await dialog.getByRole('button', { name: 'Create board', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Arachne Character Lab', exact: true })).toBeVisible();
  const id = new URL(page.url()).hash.slice(2).split('/')[0];
  const registry = JSON.parse(await readFile(path.join(repo, 'workspace/workspace.json'), 'utf8'));
  const entity = registry.entities.find(item => item.id === id), cardFile = path.join(repo, 'workspace', entity.folder, 'content.card.json');
  assert.equal(entity.steps[0].name, 'Pinboard');

  // One entry, with a picture.
  await page.getByRole('button', { name: 'Add first entry' }).click();
  const entry = index => page.locator('.card-entry-editor').nth(index);
  await entry(0).getByLabel('Entry title', { exact: true }).fill('The silk figure');
  await entry(0).getByLabel('Notes').fill('The dark one.');
  await entry(0).locator('input[type=file]').setInputFiles(path.join(sampleAssets, 'c1_gentleman_gpt.webp'));
  await expect(entry(0).locator('.card-edit-image img')).toBeVisible();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.card-save-status')).toHaveText('Saved');
  await page.getByRole('button', { name: 'Preview', exact: true }).click();

  // The wall: one thumbnail, with the file name on it.
  const wall = page.locator('.card-pinboard');
  await expect(wall).toBeVisible();
  await expect(page.locator('.card-pin-file')).toHaveText(/c1_gentleman_gpt.*\.webp/);
  await expect(page.locator('.card-kicker span').first()).toHaveText('Pinboard');

  // Choosing it opens the picture, large, with the pen over it.
  await page.locator('.card-pin-hit').click();
  const workspace = page.getByRole('dialog');
  await expect(workspace).toBeVisible();
  await expect(page.locator('.card-stage img')).toBeVisible();
  await expect(page.locator('.card-pinboard-file')).toHaveText(/c1_gentleman_gpt.*\.webp/);
  // The canvas sits on the picture's own box, not on the frame around it.
  // The picture is fitted whole, so the drawn area is smaller than the
  // element: the canvas has to follow the image, not the frame.
  await expect.poll(async () => (await page.locator('.card-stage-canvas').boundingBox())?.width || 0).toBeGreaterThan(0);
  const geometry = await page.evaluate(() => {
    const image = document.querySelector('.card-stage img'), sheet = document.querySelector('.card-stage-canvas');
    const box = image.getBoundingClientRect(), rect = sheet.getBoundingClientRect();
    const scale = Math.min(box.width / image.naturalWidth, box.height / image.naturalHeight);
    const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
    return {
      picture: { left: box.left + (box.width - width) / 2, top: box.top + (box.height - height) / 2, width, height },
      canvas: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
    };
  });
  assert.ok(geometry.canvas.width > 0 && geometry.canvas.height > 0, `canvas ${JSON.stringify(geometry.canvas)} picture ${JSON.stringify(geometry.picture)}`);
  assert.ok(Math.abs(geometry.canvas.width - geometry.picture.width) < 2, `canvas ${geometry.canvas.width} vs picture ${geometry.picture.width}`);
  assert.ok(Math.abs(geometry.canvas.height - geometry.picture.height) < 2, `canvas ${geometry.canvas.height} vs picture ${geometry.picture.height}`);
  assert.ok(Math.abs(geometry.canvas.left - geometry.picture.left) < 2, `canvas ${geometry.canvas.left} vs picture ${geometry.picture.left}`);
  assert.ok(Math.abs(geometry.canvas.top - geometry.picture.top) < 2, `canvas ${geometry.canvas.top} vs picture ${geometry.picture.top}`);

  // Four colours, and the one that is chosen is the one that is pressed.
  const swatches = page.locator('.card-pen-color');
  await expect(swatches).toHaveCount(4);
  await expect(swatches.nth(0)).toHaveAttribute('aria-pressed', 'true');
  await swatches.nth(2).click();
  await expect(swatches.nth(2)).toHaveAttribute('aria-pressed', 'true');
  await expect(swatches.nth(0)).toHaveAttribute('aria-pressed', 'false');

  // Draw on it, with the mouse, over the picture.
  const from = { x: geometry.picture.left + geometry.picture.width * 0.3, y: geometry.picture.top + geometry.picture.height * 0.4 };
  const to = { x: geometry.picture.left + geometry.picture.width * 0.65, y: geometry.picture.top + geometry.picture.height * 0.6 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
  const painted = await page.locator('.card-stage-canvas').evaluate(node => {
    const data = node.getContext('2d').getImageData(0, 0, node.width, node.height).data;
    let count = 0, blue = null;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 20) continue;
      count++;
      if (blue === null && data[i + 2] > data[i]) blue = [data[i], data[i + 1], data[i + 2]];
    }
    return { count, blue };
  });
  assert.ok(painted.count > 100, `only ${painted.count} pixels were painted`);
  // The stroke carries the colour it was drawn in.
  assert.ok(painted.blue, 'the blue stroke was not found on the canvas');

  // The feedback goes beside the picture, in its own field.
  await page.locator('.card-feedback-text').fill('Looser folds and a warmer light.');
  await expect(page.locator('.card-pinboard-status')).toHaveText('feedback saved');
  await page.screenshot({ path: path.join(repo, 'pinboard-marked-1280.png') });

  // The hand-off. The service side is stubbed; this is the browser's half.
  await page.route('**/api/workspace/hand-off', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessionId: 'chat-1', message: 'sent', chat: { id: 'chat-1', name: 'Arachne Character Lab', agent: 'codex' } }) }));
  await page.getByRole('button', { name: "Send to the board's agent" }).click();
  await expect(page.locator('.card-pinboard-status')).toHaveText('sent to Arachne Character Lab');

  // What the agent gets is on disk: the words and the marked-up picture.
  const saved = JSON.parse(await readFile(cardFile, 'utf8'));
  assert.equal(saved.items[0].feedback, 'Looser folds and a warmer light.');
  assert.match(saved.items[0].annotation, /^media\/[a-zA-Z0-9_-]+\.png$/);
  const marked = await readFile(path.join(repo, 'workspace', entity.folder, saved.items[0].annotation));
  assert.ok(marked.length > 1000, 'the marked picture was not written');

  // The choice is the service's, and it survives a reload.
  const choice = await (await fetch(`${service.origin}/api/workspace/selection`, { headers: { Authorization: `Bearer ${service.token}` } })).json();
  assert.equal(choice.selection.entryId, saved.items[0].id);
  assert.equal(choice.selection.boardId, id);
  await page.reload();
  await expect(page.locator('.card-pin.on')).toHaveCount(1);

  // The wall and the workspace both hold up on a narrow screen.
  await page.setViewportSize({ width: 390, height: 900 });
  await expect(wall).toBeVisible();
  assert.equal(await page.locator('.editable-card').evaluate(node => node.scrollWidth <= node.clientWidth + 1), true);
  await page.screenshot({ path: path.join(repo, 'pinboard-390.png') });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator('.card-pin-hit').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.screenshot({ path: path.join(repo, 'pinboard-workspace-1280.png') });

  assert.deepEqual(errors, []);
  console.log(`Pinboard passed: the wall, the pen and its colours, the feedback, the save and the hand-off. Screenshots: ${repo}`);
} finally {
  await browser?.close();
  await service.close();
}
