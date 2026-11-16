// Generate the application icons from the mark.
//
//   node scripts/make-icons.mjs
//
// The mark is drawn once, in public/assets/. Everything the shell needs - the
// window icons, the tray icon and the mobile icons - is rendered from it, so
// a change to the mark reaches every place the app appears.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = path.join(root, 'public/assets');
const icons = path.join(root, 'src-tauri/icons');

// The mark keeps its own proportions inside a square canvas: it is scaled to
// the full width, with a margin, and centred, so a wide wordmark is neither
// squashed nor cut against the edge of the icon.
const render = async (browser, svg, size) => {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  const width = Number(svg.match(/width="(\d+)"/)?.[1] || size);
  const height = Number(svg.match(/height="(\d+)"/)?.[1] || size);
  const scale = (size * 0.86) / width;
  await page.setContent(
    `<style>html,body{margin:0;padding:0;background:transparent}svg{position:absolute;left:${(size - width * scale) / 2}px;top:${(size - height * scale) / 2}px}</style>` +
    svg.replace(/width="\d+"/, `width="${width * scale}"`).replace(/height="\d+"/, `height="${height * scale}"`),
  );
  const buffer = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  await page.close();
  return buffer;
};

// An ICO file may carry PNG images directly. One directory entry per size.
const ico = (images) => {
  const count = images.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(count, 4);
  const directory = Buffer.alloc(16 * count);
  let offset = header.length + directory.length;
  images.forEach((image, index) => {
    const entry = index * 16;
    directory.writeUInt8(image.size >= 256 ? 0 : image.size, entry);
    directory.writeUInt8(image.size >= 256 ? 0 : image.size, entry + 1);
    directory.writeUInt8(0, entry + 2); directory.writeUInt8(0, entry + 3);
    directory.writeUInt16LE(1, entry + 4); directory.writeUInt16LE(32, entry + 6);
    directory.writeUInt32LE(image.data.length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += image.data.length;
  });
  return Buffer.concat([header, directory, ...images.map(image => image.data)]);
};

// An ICNS file is a list of typed PNG entries.
const icns = (entries) => {
  const parts = entries.map(entry => {
    const head = Buffer.alloc(8);
    head.write(entry.type, 0, 4, 'ascii');
    head.writeUInt32BE(entry.data.length + 8, 4);
    return Buffer.concat([head, entry.data]);
  });
  const body = Buffer.concat(parts);
  const head = Buffer.alloc(8);
  head.write('icns', 0, 4, 'ascii');
  head.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([head, body]);
};

const mark = await readFile(path.join(assets, 'pko-mark.svg'), 'utf8');
const ink = await readFile(path.join(assets, 'pko-mark-chats.svg'), 'utf8');

const browser = await chromium.launch({ channel: 'msedge' });
try {
  const png = async (svg, size) => render(browser, svg, size);

  await writeFile(path.join(icons, '32x32.png'), await png(mark, 32));
  await writeFile(path.join(icons, '128x128.png'), await png(mark, 128));
  await writeFile(path.join(icons, 'chats-128x128.png'), await png(ink, 128));
  await writeFile(path.join(assets, 'mak-mobile-192.png'), await png(mark, 192));
  await writeFile(path.join(assets, 'mak-mobile-512.png'), await png(mark, 512));

  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const windowIcons = [];
  const chatIcons = [];
  for (const size of sizes) {
    windowIcons.push({ size, data: await png(mark, size) });
    chatIcons.push({ size, data: await png(ink, size) });
  }
  await writeFile(path.join(icons, 'icon.ico'), ico(windowIcons));
  await writeFile(path.join(icons, 'chats.ico'), ico(chatIcons));
  await writeFile(path.join(icons, 'icon.icns'), icns([
    { type: 'ic11', data: await png(mark, 32) },
    { type: 'ic12', data: await png(mark, 64) },
    { type: 'ic07', data: await png(mark, 128) },
    { type: 'ic08', data: await png(mark, 256) },
    { type: 'ic09', data: await png(mark, 512) },
  ]));
  console.log('icons written to src-tauri/icons and public/assets');
} finally {
  await browser.close();
}
