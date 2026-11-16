// Sample pixels from a rendered icon, to pick the points a test asserts on.
//
//   node scripts/sample-icon.mjs src-tauri/icons/128x128.png 34,64 64,64
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const file = path.resolve(process.argv[2]);
const points = process.argv.slice(3).map(pair => pair.split(',').map(Number));

const browser = await chromium.launch({ channel: 'msedge' });
try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(file).href);
  const data = await page.evaluate(async (points) => {
    const img = document.querySelector('img');
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return {
      size: [img.naturalWidth, img.naturalHeight],
      points: points.map(([x, y]) => {
        const d = ctx.getImageData(x, y, 1, 1).data;
        return { x, y, alpha: d[3], luma: Math.round((299 * d[0] + 587 * d[1] + 114 * d[2]) / 1000) };
      }),
    };
  }, points);
  console.log(JSON.stringify(data, null, 1));
} finally {
  await browser.close();
}
