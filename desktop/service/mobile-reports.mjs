import path from 'node:path';
import { readFile, realpath } from 'node:fs/promises';
import { readJson, realFile, secret, within } from './util.mjs';
import { serveReport } from './report-chrome.mjs';
import { serveFile } from './files.mjs';
import { validateTabDocument, TAB_MAX_BYTES } from './vault-schema.mjs';

const extensions = new Set(['.html', '.htm', '.md', '.txt', '.css', '.js', '.mjs', '.json', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.ico', '.mp4', '.webm', '.mp3', '.wav', '.ogg', '.pdf', '.woff', '.woff2', '.ttf', '.glb', '.gltf', '.bin', '.wasm']);
const safePath = value => typeof value === 'string' && value.length < 1200 && !value.split(/[\\/]/).some(part => !part || part.startsWith('.') || /^(node_modules|auth\.json|tokens?\.json)$/i.test(part)) && !path.isAbsolute(value) && !value.includes(':');
const fail = (message, status = 403) => { throw Object.assign(new Error(message), { status }); };

export class MobileReports {
  constructor(gateway) {
    this.gateway = gateway;
    // A caller that only knows the repository still means its own 'workspace/'.
    this.vault = gateway.vault || { repo: gateway.repo, root: path.join(gateway.repo, 'workspace'), file: path.join(gateway.repo, 'workspace', 'workspace.json') };
    this.grants = new Map();
  }
  async registry() { return (await readJson(this.vault.file, { boards: [] })).boards || []; }
  /** The phone's list stays a board with a flat set of leaves: one entry per
   *  tab, named "Page · Tab". The page level is a folder, not a screen here. */
  leaves(board) {
    return (board.pages || []).flatMap(page => (page.tabs || []).map(tab => ({ page, tab })));
  }
  async list() {
    return (await this.registry())
      .filter(board => board.status !== 'archived' && safePath(board.folder))
      .map(board => {
        // On a board with one page the page name is noise on a phone; with
        // several it is the only thing that tells two tabs apart.
        const single = (board.pages || []).length === 1;
        return {
          id: board.id, title: board.title, category: (board.tags || [])[0] || '', updated: board.updated || board.created,
          steps: this.leaves(board).map(({ page, tab }, index) => ({ name: single ? tab.name : page.title + ' · ' + tab.name, index })),
        };
      })
      .filter(board => board.steps.length)
      .sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
  }
  async open(device, { entityId, step = 0 }) {
    const board = (await this.registry()).find(item => item.id === entityId);
    const leaf = Number.isInteger(step) && step >= 0 ? this.leaves(board || {}).slice(step, step + 1)[0] : null;
    const page = leaf?.page, tab = leaf?.tab;
    if (!board || !page || !tab || !safePath(board.folder) || !safePath(page.id) || !safePath(tab.path)) fail('This report is unavailable on mobile.', 404);
    const root = await realpath(path.join(this.vault.root, board.folder));
    if (!within(this.vault.root, root)) fail('This report folder is outside the Vault.');
    const relative = tab.path, { file, info } = await realFile(root, relative);
    if (!info.isFile()) fail('Report not found', 404);
    const extension = path.extname(file).toLowerCase();
    const document_ = !tab.viewer && relative.endsWith('.tab.json');
    if (!document_ && !['.html', '.htm', '.md', '.txt'].includes(extension)) fail('Open this type of report on your computer.');
    if (document_ && info.size > TAB_MAX_BYTES) fail('This tab is too large to preview.', 400);
    const document = document_ ? validateTabDocument(JSON.parse(await readFile(file, 'utf8'))) : undefined;
    const prefix = 'workspace/' + board.folder.replaceAll('\\', '/') + '/';
    for (const [id, grant] of this.grants) if (grant.expires < Date.now() || !this.gateway.state.devices.some(item => item.id === grant.deviceId)) this.grants.delete(id);
    const existing = [...this.grants].find(([, grant]) => grant.deviceId === device.id && grant.root === root && grant.prefix === prefix);
    const token = existing?.[0] || secret();
    if (!existing && this.grants.size >= 100) this.grants.delete(this.grants.keys().next().value);
    this.grants.set(token, { root, prefix, deviceId: device.id, expires: Date.now() + 30 * 60 * 1000 });
    const url = '/mobile/view/' + token + '/' + prefix + relative.split(/[\\/]/).map(encodeURIComponent).join('/');
    const single = (board.pages || []).length === 1;
    const where = { title: board.title, step: single ? tab.name : page.title + ' · ' + tab.name };
    if (document_) return { statePersistence: false, ...where, kind: 'tab', url, document };
    return { statePersistence: true, ...where, kind: extension === '.md' || extension === '.txt' ? 'markdown' : 'html', url, ...(extension === '.md' || extension === '.txt' ? { text: (await readFile(file, 'utf8')).slice(0, 2 * 1024 * 1024) } : {}) };
  }
  async serve(request, response, url) {
    const gateway = this.gateway;
    if (!gateway.active || !['GET', 'HEAD'].includes(request.method) || request.headers.host !== new URL(gateway.origin).host) fail('Not allowed');
    const match = /^\/mobile\/view\/([a-zA-Z0-9_-]+)\/(.+)$/.exec(url.pathname), grant = match && this.grants.get(match[1]);
    if (!grant || grant.expires < Date.now() || !gateway.state.devices.some(device => device.id === grant.deviceId && gateway.validDevice(device))) fail('Reopen this report to refresh its preview.', 401);
    const relative = decodeURIComponent(match[2]);
    if (!safePath(relative)) fail('Invalid report path');
    let root, filePath;
    if (relative.startsWith(grant.prefix)) { root = grant.root; filePath = relative.slice(grant.prefix.length); }
    else if (/^(?:.*\/)?_shared\/(report\.(?:css|js)|examples\.css)$/.test(relative)) { root = path.join(gateway.repo, 'workspace/_shared'); filePath = relative.replace(/^.*_shared\//, ''); }
    else fail('This file is outside the selected report.');
    if (!extensions.has(path.extname(filePath).toLowerCase())) fail('This file type is unavailable in report previews.');
    const { file, info } = await realFile(root, filePath);
    if (!info.isFile()) fail('File not found', 404);
    const base = gateway.origin + '/mobile/view/' + match[1] + '/';
    // A report is an opaque sandbox with access only to this short-lived folder grant.
    // It has no same-origin privileges, desktop token, device cookie or mobile API access.
    const html = /\.html?$/i.test(file) && url.searchParams.get('download') !== '1';
    await (html ? serveReport : serveFile)(request, response, file, info, {
      'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'Access-Control-Allow-Origin': '*',
      ...(url.searchParams.get('download') === '1' ? { 'Content-Disposition': "attachment; filename*=UTF-8''" + encodeURIComponent(path.basename(file)) } : {}),
      'Content-Security-Policy': "sandbox allow-scripts allow-downloads allow-popups allow-popups-to-escape-sandbox; default-src 'none'; script-src 'unsafe-inline' " + base + "; style-src 'unsafe-inline' " + base + '; img-src data: blob: ' + base + '; media-src blob: ' + base + '; font-src data: ' + base + '; connect-src ' + base + "; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors " + gateway.origin,
    }, { parentOrigin: gateway.origin, mobileState: true });
  }
}
