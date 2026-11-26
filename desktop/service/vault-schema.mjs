// The Vault's contract: the registry, a page's tab document, and the words the
// two grids filter by. Shared by the desktop editor and the service, so this
// file must stay browser-safe: no node imports, no filesystem.
//
// A tab document is a flat list of blocks. A section is a heading over the cards
// that follow it - it holds nothing. A card is the visual unit the layouts draw.

export const VAULT_FORMAT = 'pko-vault';
export const VAULT_VERSION = 2;
export const TAB_FORMAT = 'pko-tab';
export const TAB_VERSION = 1;
export const TAB_MAX_BYTES = 1024 * 1024;
export const TAB_MAX_BLOCKS = 200;
export const TAB_MAX_IMAGE_BYTES = 16 * 1024 * 1024;

// A board is filed under what kind of work it is; a page under what it covers.
// One closed list per level, so a filter row never grows a tag nobody can read.
export const boardTags = ['research', 'game-project', 'gallery', 'app-project'];
export const pageTags = ['game-mechanics', 'game-idea', 'ui', 'sound', '3d', '2d', 'animation'];
export const boardTagLabels = { research: 'Research', 'game-project': 'Game Project', gallery: 'Gallery', 'app-project': 'App Project' };
export const pageTagLabels = { 'game-mechanics': 'Game Mechanics', 'game-idea': 'Game Idea', ui: 'UI', sound: 'Sound', '3d': '3D', '2d': '2D', animation: 'Animation' };

export const tabLayouts = ['gallery', 'workbench', 'pinboard'];
export const layoutLabels = { gallery: 'Gallery', workbench: 'Workbench', pinboard: 'Pinboard' };
export const layoutNotes = { gallery: 'a grid of cards, the picture first', workbench: 'one card per row, the notes beside the picture', pinboard: 'a wall of thumbnails, one opened large' };

export const boardStatuses = ['active', 'done', 'archived'];
export const cardStatuses = ['idea', 'in-progress', 'review', 'done'];
export const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const IMAGE_PATH = /\.(png|jpe?g|gif|webp)$/i;

export const localDay = (date = new Date()) => date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
// A board's folder is its slug; a page's and a tab's id are theirs. The same
// rule at every level, so a name never has to be guessed from a title.
export const slugify = (value, fallback = 'untitled') => String(value === undefined || value === null ? '' : value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || fallback;
export const folderFor = (title, day) => day + '_' + slugify(title);

const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function keys(value, allowed, label) {
  if (!object(value) || Object.keys(value).some(key => !allowed.includes(key))) fail(label + ' has unsupported fields. Check the Vault format.');
}
function text(value, label, max, required = false) {
  if (value === undefined && !required) return;
  if (typeof value !== 'string' || value.length > max || (required && !value.trim()) || /\u0000/.test(value)) fail(label + ' must be ' + (required ? 'non-empty text of ' : 'text of ') + 'up to ' + max.toLocaleString('en-US') + ' characters.');
}
function flag(value, label) {
  if (value !== undefined && typeof value !== 'boolean') fail(label + ' must be true or false.');
}
function day(value, label) {
  if (value === undefined) return;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail(label + ' must be a date like 2026-11-26.');
}
function folderName(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 200 && !/[\\/:*?"<>|\u0000-\u001f]/.test(value) && value !== '.' && value !== '..';
}
function tagList(value, vocabulary, label) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 4) fail(label + ' carries up to four tags.');
  const seen = new Set();
  for (const tag of value) {
    if (typeof tag !== 'string' || !vocabulary.includes(tag)) fail('Choose ' + label + ' tags from the list.');
    if (seen.has(tag)) fail(label + ' tags must not repeat.');
    seen.add(tag);
  }
  return value;
}

/** A path inside the page's own folder: no drive, no scheme, no dot segments. */
export function localPath(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 500 && !/[\\:%?#\u0000-\u001f]/.test(value) && value.split('/').every(part => part && !part.startsWith('.'));
}

export function sourceUrl(value) {
  if (typeof value !== 'string' || value.length > 2000) return undefined;
  try {
    const url = new URL(value);
    if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) return url.href;
  } catch { /* Incomplete source URLs are normal in a live draft. */ }
  return undefined;
}

function board(value) {
  if (!object(value)) fail('This board is not a record.');
  if (typeof value.id !== 'string' || !ID_PATTERN.test(value.id)) fail('Every board needs an id of lowercase letters, numbers and hyphens.');
  text(value.title, 'Board title', 200, true);
  text(value.description, 'Board description', 240);
  tagList(value.tags, boardTags, 'board');
  if (!folderName(value.folder)) fail('A board folder must be a plain folder name inside the Vault.');
  day(value.created, 'Created');
  day(value.updated, 'Updated');
  if (!boardStatuses.includes(value.status)) fail('Use active, done or archived status.');
  flag(value.pinned, 'Pinned');
  flag(value.sample, 'Sample');
  if (value.icon !== undefined && value.icon !== '' && !localPath(value.icon)) fail('A board icon must be a path inside the board folder.');
  if (value.agent !== undefined) {
    text(value.agent.chatId, 'Chat id', 200);
    text(value.agent.name, 'Chat name', 200);
  }
  if (!Array.isArray(value.pages)) fail('A board holds a list of pages.');
  const ids = new Set();
  for (const item of value.pages) {
    page_(item);
    if (ids.has(item.id)) fail('Every page in a board needs its own id.');
    ids.add(item.id);
  }
  return value;
}

function page_(value) {
  if (!object(value)) fail('This page is not a record.');
  if (typeof value.id !== 'string' || !ID_PATTERN.test(value.id)) fail('Every page needs an id of lowercase letters, numbers and hyphens.');
  text(value.title, 'Page title', 200, true);
  text(value.description, 'Page description', 240);
  tagList(value.tags, pageTags, 'page');
  day(value.created, 'Created');
  day(value.updated, 'Updated');
  if (value.icon !== undefined && value.icon !== '' && !localPath(value.icon)) fail('A page icon must be a path inside the page folder.');
  if (!Array.isArray(value.tabs)) fail('A page holds a list of tabs.');
  const ids = new Set();
  for (const tab of value.tabs) {
    tab_(tab);
    if (ids.has(tab.id)) fail('Every tab in a page needs its own id.');
    ids.add(tab.id);
  }
  return value;
}

function tab_(value) {
  keys(value, ['id', 'name', 'path', 'viewer'], 'This tab');
  if (typeof value.id !== 'string' || !ID_PATTERN.test(value.id)) fail('Every tab needs an id of lowercase letters, numbers and hyphens.');
  text(value.name, 'Tab name', 120, true);
  if (!localPath(value.path)) fail('A tab path must stay inside its page folder.');
  if (value.viewer !== undefined && !['report', 'compare3d'].includes(value.viewer)) fail('Choose how this tab opens.');
  return value;
}

/** The whole registry. Throws on anything it cannot read, rather than guessing. */
export function validateRegistry(value) {
  // An old Vault is named as such, not as a pile of unsupported fields: the
  // message is the whole difference between "convert this" and "this is broken".
  if (isLegacyRegistry(value)) fail('This Vault was written before the page layer, so this build cannot read it. Convert the boards first.');
  if (!object(value)) fail('This Vault registry is not a Project KO registry.');
  if (value.format !== VAULT_FORMAT) fail('This Vault registry is not a Project KO registry.');
  if (value.version !== VAULT_VERSION) fail('This Vault registry version is not supported. Update Project KO before opening it.');
  if (!Array.isArray(value.boards)) fail('The Vault registry has no board list.');
  const ids = new Set();
  for (const item of value.boards) {
    board(item);
    if (ids.has(item.id)) fail('Every board in the Vault needs its own id.');
    ids.add(item.id);
  }
  return value;
}

/** A registry written before the page layer: boards with steps, no format. */
export const isLegacyRegistry = value => object(value) && Array.isArray(value.entities) && !Array.isArray(value.boards);

function block(value, draft) {
  if (!object(value)) fail('Every block is an object.');
  if (value.kind === 'section') {
    keys(value, ['kind', 'id', 'title', 'note'], 'A section');
    if (typeof value.id !== 'string' || !ID_PATTERN.test(value.id)) fail('Every section needs an id of lowercase letters, numbers and hyphens.');
    text(value.title, 'Section title', 200, !draft);
    text(value.note, 'Section note', 20000);
    return value;
  }
  if (value.kind === 'card') {
    keys(value, ['kind', 'id', 'title', 'body', 'image', 'alt', 'prompt', 'url', 'linkLabel', 'status', 'feedback', 'annotation', 'wide'], 'A card');
    if (typeof value.id !== 'string' || !ID_PATTERN.test(value.id)) fail('Every card needs an id of lowercase letters, numbers and hyphens.');
    text(value.title, 'Card title', 200, !draft);
    text(value.body, 'Card notes', 40000);
    text(value.prompt, 'Prompt', 40000);
    text(value.alt, 'Image description', 500);
    text(value.linkLabel, 'Link label', 120);
    text(value.feedback, 'Feedback for the agent', 4000);
    for (const field of ['image', 'annotation']) {
      const path = value[field];
      if (path !== undefined && path !== '' && (!localPath(path) || !IMAGE_PATH.test(path))) fail(field === 'image' ? 'Images must be PNG, JPEG, WebP or GIF files inside this page folder.' : 'The marked-up picture must be a PNG, JPEG, WebP or GIF file inside this page folder.');
    }
    if (value.url !== undefined && value.url !== '') {
      text(value.url, 'Source URL', 2000);
      if (!draft && !sourceUrl(value.url)) fail('Use a complete http:// or https:// source URL without embedded credentials.');
    }
    if (value.status !== undefined && !cardStatuses.includes(value.status)) fail('Choose a valid card status.');
    flag(value.wide, 'Wide');
    return value;
  }
  fail('Every block is a section or a card.');
}

function document_(value, draft) {
  keys(value, ['format', 'version', 'layout', 'summary', 'nodes'], 'This tab');
  if (value.format !== TAB_FORMAT || value.version !== TAB_VERSION) fail('This tab document version is not supported. Update Project KO before editing it.');
  if (!tabLayouts.includes(value.layout)) fail('Choose the Gallery, Workbench or Pinboard layout.');
  text(value.summary, 'Tab introduction', 20000);
  if (!Array.isArray(value.nodes) || value.nodes.length > TAB_MAX_BLOCKS) fail('A tab holds up to ' + TAB_MAX_BLOCKS + ' blocks.');
  const ids = new Set();
  for (const node of value.nodes) {
    block(node, draft);
    if (ids.has(node.id)) fail('Every block in a tab needs its own id.');
    ids.add(node.id);
  }
  return value;
}

export const validateTabDocument = value => document_(value, false);
// Keep an unfinished draft recoverable. Only validateTabDocument may authorize a save.
export const validateTabDraft = value => document_(value, true);

/** Everything a tab says, for search and for the agent that reads the board. */
export const tabText = value => [value.summary].concat(value.nodes.map(node => node.kind === 'section' ? [node.title, node.note] : [node.title, node.body, node.prompt, node.url, node.linkLabel, node.status, node.feedback])).flat().filter(Boolean).join('\n\n');

/** An empty tab document, which is what a new tab starts as. */
export const emptyDocument = (layout = 'gallery') => ({ format: TAB_FORMAT, version: TAB_VERSION, layout, summary: '', nodes: [] });
