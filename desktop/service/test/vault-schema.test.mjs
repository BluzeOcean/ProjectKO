import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VAULT_FORMAT, VAULT_VERSION, TAB_FORMAT, TAB_VERSION, TAB_MAX_BLOCKS,
  boardTags, pageTags, tabLayouts, cardStatuses, documentLayouts, isDocumentLayout,
  localDay, slugify, folderFor, localPath, sourceUrl,
  validateRegistry, validateTabDocument, validateTabDraft, isLegacyRegistry, tabText, emptyDocument,
} from '../vault-schema.mjs';

const board = (over = {}) => ({
  id: 'ironpath', title: 'IronPath', description: 'An RTS.', tags: ['game-project'],
  created: '2026-11-26', updated: '2026-11-26', folder: '2026-11-26_ironpath',
  status: 'active', pinned: false, pages: [], ...over,
});
const page = (over = {}) => ({
  id: 'mechanics', title: 'Game Mechanics', tags: ['game-mechanics'],
  created: '2026-11-26', updated: '2026-11-26', tabs: [], ...over,
});
const tab = (over = {}) => ({ id: 'overview', name: 'Overview', path: 'overview.tab.json', ...over });
const registry = (boards = [board()]) => ({ format: VAULT_FORMAT, version: VAULT_VERSION, boards });
const doc = (nodes = []) => ({ format: TAB_FORMAT, version: TAB_VERSION, layout: 'gallery', summary: '', nodes });
const section = (over = {}) => ({ kind: 'section', id: 'silhouette', title: 'Silhouette', note: 'Read the shape first.', ...over });
const card = (over = {}) => ({ kind: 'card', id: 'explorer', title: 'The explorer', body: 'Keep the hat.', image: 'media/explorer.webp', status: 'review', ...over });

test('the vocabularies are the ones the panels offer', () => {
  assert.deepEqual(boardTags, ['research', 'game-project', 'gallery', 'app-project']);
  assert.deepEqual(pageTags, ['game-mechanics', 'game-idea', 'ui', 'sound', '3d', '2d', 'animation']);
  assert.deepEqual(tabLayouts, ['gallery', 'workbench', 'pinboard', 'codex', 'margin', 'ppt', 'folio']);
  assert.deepEqual(documentLayouts, ['codex', 'margin', 'ppt', 'folio']);
  assert.deepEqual(tabLayouts.filter(value => documentLayouts.includes(value)), documentLayouts);
  assert.deepEqual(cardStatuses, ['idea', 'in-progress', 'review', 'done']);
});

test('a board with pages and tabs validates', () => {
  const value = registry([board({ pages: [page({ tabs: [tab(), tab({ id: 'board', name: 'Board', path: 'board.html', viewer: 'report' })] })] })]);
  assert.equal(validateRegistry(value), value);
});

test('a board id, a page id and a tab id are all required and slug-shaped', () => {
  assert.throws(() => validateRegistry(registry([board({ id: 'Iron Path' })])), /letters, numbers/);
  assert.throws(() => validateRegistry(registry([board({ pages: [page({ id: 'Game Mechanics' })] })])), /letters, numbers/);
  assert.throws(() => validateRegistry(registry([board({ pages: [page({ tabs: [tab({ id: '' })] })] })])), /letters, numbers/);
});

test('board and page tags are closed lists, and they are not interchangeable', () => {
  assert.throws(() => validateRegistry(registry([board({ tags: ['project'] })])), /Choose board tags from the list/);
  assert.throws(() => validateRegistry(registry([board({ tags: ['ui'] })])), /Choose board tags from the list/);
  assert.throws(() => validateRegistry(registry([board({ pages: [page({ tags: ['game-project'] })] })])), /Choose page tags from the list/);
  assert.throws(() => validateRegistry(registry([board({ tags: ['gallery', 'gallery'] })])), /must not repeat/);
});

test('a board folder stays a plain folder name', () => {
  assert.throws(() => validateRegistry(registry([board({ folder: 'a/b' })])), /plain folder name/);
  assert.throws(() => validateRegistry(registry([board({ folder: '..' })])), /plain folder name/);
});

test('duplicate ids are refused at every level', () => {
  assert.throws(() => validateRegistry(registry([board(), board({ folder: 'other' })])), /own id/);
  assert.throws(() => validateRegistry(registry([board({ pages: [page(), page()] })])), /own id/);
  assert.throws(() => validateRegistry(registry([board({ pages: [page({ tabs: [tab(), tab()] })] })])), /own id/);
});

test('a tab path cannot leave its page folder', () => {
  for (const path of ['../secret.html', '/etc/passwd', 'C:/x.html', 'a\\b.html', '.hidden/x', 'http://x/y']) {
    assert.throws(() => validateRegistry(registry([board({ pages: [page({ tabs: [tab({ path })] })] })])), /stay inside its page folder/, path);
  }
});

test('a registry from before the page layer is recognised, not read', () => {
  assert.equal(isLegacyRegistry({ entities: [{ id: 'old' }] }), true);
  assert.equal(isLegacyRegistry(registry()), false);
  assert.throws(() => validateRegistry({ entities: [] }), /before the page layer/);
});

test('the registry format and version are refused when they are not ours', () => {
  assert.throws(() => validateRegistry({ format: 'mrmak-vault', version: 2, boards: [] }), /not a Project KO registry/);
  assert.throws(() => validateRegistry({ format: VAULT_FORMAT, version: 1, boards: [] }), /version is not supported/);
});

test('a tab document holds sections and cards in one flat list', () => {
  const value = doc([section(), card(), section({ id: 'colour', title: 'Colour' }), card({ id: 'palette', title: 'Palette' })]);
  assert.equal(validateTabDocument(value), value);
});

test('a block must be a section or a card', () => {
  assert.throws(() => validateTabDocument(doc([{ kind: 'block', id: 'x', title: 'X' }])), /section or a card/);
  assert.throws(() => validateTabDocument(doc([{ id: 'x', title: 'X' }])), /section or a card/);
});

test('a section is a heading: it cannot carry a card list', () => {
  assert.throws(() => validateTabDocument(doc([section({ cards: [card()] })])), /unsupported fields/);
});

test('block ids are unique inside the document', () => {
  assert.throws(() => validateTabDocument(doc([section(), card({ id: 'silhouette' })])), /own id/);
});

test('a card carries what the hand-off needs and rejects what it does not know', () => {
  assert.throws(() => validateTabDocument(doc([card({ feedback: undefined, annotation: undefined, extra: 1 })])), /unsupported fields/);
  assert.equal(validateTabDocument(doc([card({ feedback: 'Tighten the belt.', annotation: 'media/marked.png' })])).nodes[0].feedback, 'Tighten the belt.');
});

test('images stay inside the page folder and are real image types', () => {
  for (const image of ['../x.png', '/x.png', 'media/x.svg', 'media/x.png.exe']) {
    assert.throws(() => validateTabDocument(doc([card({ image })])), /PNG, JPEG, WebP or GIF/, image);
  }
});

test('a source URL must be complete, unless it is still a draft', () => {
  assert.throws(() => validateTabDocument(doc([card({ url: 'example.com' })])), /complete http/);
  assert.equal(validateTabDraft(doc([card({ url: 'example.com' })])).nodes[0].url, 'example.com');
  assert.equal(sourceUrl('https://example.com/a'), 'https://example.com/a');
  assert.equal(sourceUrl('https://user:pass@example.com/a'), undefined);
});

test('a draft keeps an unfinished title, a saved document does not', () => {
  assert.throws(() => validateTabDocument(doc([card({ title: '' })])), /Card title/);
  assert.equal(validateTabDraft(doc([card({ title: '' })])).nodes[0].title, '');
  assert.throws(() => validateTabDocument(doc([section({ title: '  ' })])), /Section title/);
});

test('the layout must be one of the seven', () => {
  assert.throws(() => validateTabDocument({ ...doc(), layout: 'grid' }), /Gallery, Workbench, Pinboard, Codex, Margin, PPT or Folio/);
  assert.equal(validateTabDraft({ ...doc(), layout: 'pinboard' }).layout, 'pinboard');
  for (const layout of documentLayouts) {
    assert.equal(validateTabDraft({ ...doc(), layout }).layout, layout);
    assert.equal(isDocumentLayout(layout), true);
  }
  assert.equal(isDocumentLayout('gallery'), false);
  assert.equal(isDocumentLayout('pinboard'), false);
});

test('a tab is capped at the block limit', () => {
  const nodes = Array.from({ length: TAB_MAX_BLOCKS + 1 }, (_, index) => card({ id: 'c' + index }));
  assert.throws(() => validateTabDocument(doc(nodes)), /up to 200 blocks/);
});

test('the tab text the agent reads carries the headings and the notes', () => {
  const text = tabText(doc([section(), card({ body: 'Keep the hat.', feedback: 'Tighten the belt.' })]));
  assert.match(text, /Silhouette/);
  assert.match(text, /Read the shape first/);
  assert.match(text, /Keep the hat/);
  assert.match(text, /Tighten the belt/);
});

test('a new tab starts empty and gallery-shaped', () => {
  assert.deepEqual(emptyDocument(), { format: 'pko-tab', version: 1, layout: 'gallery', summary: '', nodes: [] });
  assert.equal(emptyDocument('pinboard').layout, 'pinboard');
});

test('the day and the folder are the ones the board will use', () => {
  assert.equal(localDay(new Date(2026, 10, 5)), '2026-11-05');
  assert.equal(slugify('MECH TACTIC CUT'), 'mech-tactic-cut');
  assert.equal(slugify('   ', 'untitled'), 'untitled');
  assert.equal(folderFor('Iron Path', '2026-11-26'), '2026-11-26_iron-path');
});

test('a page-relative path is a plain forward-slash path', () => {
  assert.equal(localPath('media/a.webp'), true);
  assert.equal(localPath('a/b/c.json'), true);
  for (const value of ['', '/a', 'a/../b', '.a/b', 'C:/a', 'a\\b', 'a?b', 'a#b']) assert.equal(localPath(value), false, value);
});
