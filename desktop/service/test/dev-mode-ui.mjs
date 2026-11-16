// Check the development instance: Vite serves the interface from source, the
// API still answers on the same origin, and the hot reload client connects.
//
//   node desktop/service/test/dev-mode-ui.mjs
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from './browser.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');

const service = spawn('node', [path.join(root, 'desktop/service/main.mjs'), '--repo', root, '--ui', path.join(root, 'dist'), '--dev'], { cwd: root });
let ready = '';
service.stdout.on('data', chunk => { ready += chunk; });
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`service did not start: ${ready}`)), 60000);
  const check = setInterval(() => {
    if (ready.includes('"type":"ready"')) { clearInterval(check); clearTimeout(timer); resolve(); }
  }, 250);
});

const urls = JSON.parse(ready.slice(ready.indexOf('{')));
const chats = urls.chats;
console.log('chats url:', chats.replace(/token=[^&]+/, 'token=***'));

let browser;
try {
  browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', error => errors.push(String(error.message)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });

  await page.goto(chats, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);

  const state = await page.evaluate(() => ({
    title: document.title,
    hasRoot: Boolean(document.querySelector('#root')?.children.length),
    viteClient: Boolean(document.querySelector('script[src="/@vite/client"]')),
    hmrSocket: performance.getEntriesByType('resource').filter(entry => entry.name.includes('/@vite/client')).length,
    cards: document.querySelectorAll('.entity-card').length,
    body: document.body.innerText.slice(0, 160).replace(/\n+/g, ' | '),
  }));
  console.log('page:', JSON.stringify(state, null, 1));

  const api = await page.evaluate(async () => {
    const response = await fetch('/api/workspace', { headers: { Authorization: `Bearer ${new URLSearchParams(location.search).get('token')}` } });
    return { status: response.status, entities: (await response.json()).entities?.length ?? -1 };
  });
  console.log('api:', JSON.stringify(api));
  console.log('console errors:', JSON.stringify(errors.slice(0, 5)));
  await page.screenshot({ path: path.join(root, 'dev-mode.png') });
  console.log('screenshot:', path.join(root, 'dev-mode.png'));
} finally {
  await browser?.close();
  service.kill();
}
