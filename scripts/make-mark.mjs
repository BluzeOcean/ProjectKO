// Turn the drawn mark into the app's assets.
//
//   node scripts/make-mark.mjs <pink.png> <blue.png>
//
// Each drawing is cropped to what was actually drawn and centred on a square
// canvas, so the mark keeps its proportions and the icons built from it are
// never squashed. The result is committed: public/assets/pko-mark.png (the
// brand colour) and pko-mark-chats.png (the theme blue).
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = path.join(root, 'public/assets');
const pink = process.argv[2];
const blue = process.argv[3];
if (!pink || !blue) { console.error('usage: node scripts/make-mark.mjs <pink.png> <blue.png>'); process.exit(1); }

const square = async (browser, file, size) => {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  const dataUrl = 'data:image/png;base64,' + (await readFile(file)).toString('base64');
  await page.setContent(`<canvas id="c" width="${size}" height="${size}"></canvas>`);
  const out = await page.evaluate(async ({ dataUrl, size }) => {
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    const probe = document.createElement('canvas');
    probe.width = image.naturalWidth; probe.height = image.naturalHeight;
    const probeContext = probe.getContext('2d');
    probeContext.drawImage(image, 0, 0);
    const frame = probeContext.getImageData(0, 0, probe.width, probe.height);
    const pixels = frame.data;

    // The drawing arrives on a flat near-black sheet. Take that sheet off by
    // flooding inwards from the edges through the near-black pixels, so the
    // shadows inside the mark keep their colour.
    const width = probe.width, height = probe.height;
    const isSheet = index => {
      const alpha = pixels[index * 4 + 3];
      if (alpha < 8) return true;
      return Math.max(pixels[index * 4], pixels[index * 4 + 1], pixels[index * 4 + 2]) < 70;
    };
    const outside = new Uint8Array(width * height);
    const queue = [];
    const push = (x, y) => {
      if (x < 0 || y < 0 || x >= width || y >= height) return;
      const index = y * width + x;
      if (outside[index] || !isSheet(index)) return;
      outside[index] = 1;
      queue.push(index);
    };
    for (let x = 0; x < width; x += 1) { push(x, 0); push(x, height - 1); }
    for (let y = 0; y < height; y += 1) { push(0, y); push(width - 1, y); }
    while (queue.length) {
      const index = queue.pop();
      const x = index % width, y = (index - x) / width;
      push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
    }

    // Cut the sheet away and find what was drawn.
    let left = width, top = height, right = 0, bottom = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        if (outside[index]) { pixels[index * 4 + 3] = 0; continue; }
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
    probeContext.putImageData(frame, 0, 0);

    const drawnWidth = right - left + 1, drawnHeight = bottom - top + 1;
    const canvas = document.getElementById('c');
    const context = canvas.getContext('2d');
    context.imageSmoothingQuality = 'high';
    const scale = (size * 0.94) / Math.max(drawnWidth, drawnHeight);
    const drawWidth = drawnWidth * scale, drawHeight = drawnHeight * scale;
    context.drawImage(probe, left, top, drawnWidth, drawnHeight, (size - drawWidth) / 2, (size - drawHeight) / 2, drawWidth, drawHeight);
    return canvas.toDataURL('image/png');
  }, { dataUrl, size });
  await page.close();
  return Buffer.from(out.split(',')[1], 'base64');
};

const browser = await chromium.launch({ channel: 'msedge' });
try {
  await writeFile(path.join(assets, 'pko-mark.png'), await square(browser, pink, 512));
  await writeFile(path.join(assets, 'pko-mark-chats.png'), await square(browser, blue, 512));
  console.log('mark written to public/assets/pko-mark.png and pko-mark-chats.png');
} finally {
  await browser.close();
}
