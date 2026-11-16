// Render the candidate mark at the sizes the app uses it, for a look before
// it is placed.
//
//   node desktop/service/test/mark-preview.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from './browser.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');

const sizes = [16, 24, 25, 32, 38, 50, 64, 84, 128];
const cells = src => sizes.map(size =>
  '<div class="cell"><img src="' + src + '" width="' + size + '" height="' + size + '"><span>' + size + '</span></div>'
).join('');

const sheet = [
  '<!doctype html><meta charset="utf-8"/>',
  '<style>',
  'body { margin: 0; background: #0e1013; color: #d7d3cb; font: 13px/1.5 "Segoe UI", sans-serif; padding: 24px; }',
  '.row { display: flex; align-items: flex-end; gap: 28px; margin-bottom: 28px; }',
  '.cell { text-align: center; }',
  '.cell span { display: block; margin-top: 8px; color: #8b8791; font-size: 11px; }',
  '.light { background: #ffffff; padding: 12px; border-radius: 10px; }',
  'h2 { font-weight: 600; font-size: 13px; color: #e4bd68; margin: 0 0 12px; }',
  '</style>',
  '<h2>Project KO mark</h2><div class="row" id="gradient">' + cells('/assets/pko-mark.svg') + '</div>',
  '<h2>Ink variant (Chats header)</h2><div class="row" id="ink">' + cells('/assets/pko-mark-chats.svg') + '</div>',
  '<h2>On light</h2><div class="row light" id="light">' + cells('/assets/pko-mark.svg') + '</div>',
].join('\n');

let browser;
try {
  browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 900, height: 620 }, deviceScaleFactor: 2 });
  await page.route('**/mark-preview.html', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: sheet }));
  await page.route('**/assets/pko-mark*.svg', route => {
    const file = route.request().url().includes('chats') ? 'pko-mark-chats.svg' : 'pko-mark.svg';
    return route.fulfill({ path: path.join(root, 'public/assets', file), contentType: 'image/svg+xml' });
  });
  await page.goto('http://127.0.0.1:0/mark-preview.html');
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(root, 'mark-preview.png') });
  console.log('preview:', path.join(root, 'mark-preview.png'));
} finally {
  await browser?.close();
}
