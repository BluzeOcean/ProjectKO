import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { validateTabDocument } from './vault-schema.mjs';

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };

/**
 * What the user has chosen in a board.
 *
 * The signal is one explicit click on one card. Nothing here watches the user:
 * no hover, no pointer position, no polling of what is on screen. The service
 * stores the choice, and an agent pulls it when it wants it.
 *
 * The choice is live state, not a document. It is not written to the tab and it
 * does not survive a restart - it points at something the user is looking at now.
 */
export class Selection {
  constructor({ tabs, changed = () => {} }) {
    this.tabs = tabs;
    this.changed = changed;
    this.current = null;
  }

  /** The stored choice, without reading the tab. */
  state() { return this.current; }

  /**
   * The compact pointer the coordinator is given with every operation, so the
   * model knows which card the user means before it asks for details.
   */
  brief() {
    if (!this.current) return null;
    const { boardId, boardTitle, pageId, pageTitle, tab, tabName, cardId, title, fileName } = this.current;
    return { boardId, boardTitle, pageId, pageTitle, tab, tabName, cardId, title, fileName };
  }

  /**
   * The user chose a card. The tab is read to make sure the card is really
   * there, so the pointer never names something that is not.
   */
  async choose({ boardId, pageId, tabId, cardId }) {
    if (typeof boardId !== 'string' || !boardId || typeof pageId !== 'string' || !pageId || typeof tabId !== 'string' || !tabId || typeof cardId !== 'string' || !cardId) {
      fail('Choose a card on a board.');
    }
    const target = await this.tabs.resolve(boardId, pageId, tabId);
    const document = await this.read(target.file);
    const card = document.nodes.find(node => node.kind === 'card' && node.id === cardId);
    if (!card) fail('Choose a card on this board.');
    this.current = {
      boardId, boardTitle: target.board.title,
      pageId, pageTitle: target.page.title,
      tab: tabId, tabName: target.tab.name,
      cardId, title: card.title,
      fileName: card.image ? path.basename(card.image) : null,
      at: new Date().toISOString(),
    };
    this.changed(this.brief());
    return this.resolve();
  }

  clear() {
    if (!this.current) return null;
    this.current = null;
    this.changed(null);
    return null;
  }

  /**
   * The chosen card as it stands now: the board it belongs to, the file on
   * disk, the feedback the user wrote and the marked-up picture. Read when an
   * agent asks for it, not when the user clicks.
   */
  async resolve() {
    if (!this.current) return null;
    const { boardId, pageId, tab, cardId } = this.current;
    const target = await this.tabs.resolve(boardId, pageId, tab);
    const document = await this.read(target.file);
    const card = document.nodes.find(node => node.kind === 'card' && node.id === cardId);
    if (!card) { this.clear(); return null; }
    return {
      boardId,
      boardTitle: target.board.title,
      boardFolder: target.board.folder,
      pageId,
      pageTitle: target.page.title,
      tab,
      tabName: target.tab.name,
      tabTitle: document.summary || target.tab.name,
      cardId,
      title: card.title,
      status: card.status || null,
      fileName: card.image ? path.basename(card.image) : null,
      // A card's picture is relative to the document that names it, which is
      // the page's own folder - the same base the renderer uses.
      picture: card.image ? path.join(path.dirname(target.file), card.image) : null,
      annotation: card.annotation ? path.join(path.dirname(target.file), card.annotation) : null,
      feedback: card.feedback || '',
      notes: card.body || '',
      at: this.current.at,
    };
  }

  async read(file) {
    let document;
    try { document = JSON.parse(await readFile(file, 'utf8')); }
    catch { fail('This tab contains invalid JSON. Its original file has been kept.'); }
    return validateTabDocument(document);
  }
}
