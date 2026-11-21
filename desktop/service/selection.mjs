import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { validateCard } from './card-schema.mjs';

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };

/**
 * What the user has chosen in a board.
 *
 * The signal is one explicit click on one entry. Nothing here watches the
 * user: no hover, no pointer position, no polling of what is on screen. The
 * service stores the choice, and an agent pulls it when it wants it.
 *
 * The choice is live state, not a document. It is not written to the card
 * and it does not survive a restart — it points at something the user is
 * looking at right now.
 */
export class Selection {
  constructor({ cards, changed = () => {} }) {
    this.cards = cards;
    this.changed = changed;
    this.current = null;
  }

  /** The stored choice, without reading the card. */
  state() { return this.current; }

  /**
   * The compact pointer the coordinator is given with every operation, so
   * the model knows which entry the user means before it asks for details.
   */
  brief() {
    if (!this.current) return null;
    const { boardId, boardTitle, step, entryId, title, fileName } = this.current;
    return { boardId, boardTitle, step, entryId, title, fileName };
  }

  /**
   * The user chose an entry. The card is read to make sure the entry is
   * really there, so the pointer never names something that is not.
   */
  async choose(entityId, step, entryId) {
    if (typeof entityId !== 'string' || !entityId || !Number.isInteger(step) || step < 0 || typeof entryId !== 'string' || !entryId) {
      fail('Choose an entry on a board.');
    }
    const target = await this.cards.resolve(entityId, step);
    const document = await this.read(target.file);
    const item = document.items.find(entry => entry.id === entryId);
    if (!item) fail('Choose an entry on this board.');
    this.current = {
      boardId: entityId,
      boardTitle: target.entity.title,
      step,
      entryId,
      title: item.title,
      fileName: item.image ? path.basename(item.image) : null,
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
   * The chosen entry as it stands now: the board it belongs to, the file on
   * disk, the feedback the user wrote and the marked-up picture. Read when
   * an agent asks for it, not when the user clicks.
   */
  async resolve() {
    if (!this.current) return null;
    const { boardId, step, entryId } = this.current;
    const target = await this.cards.resolve(boardId, step);
    const document = await this.read(target.file);
    const item = document.items.find(entry => entry.id === entryId);
    if (!item) { this.clear(); return null; }
    return {
      boardId,
      step,
      boardTitle: target.entity.title,
      boardFolder: target.entity.folder,
      cardTitle: document.title,
      entryId,
      title: item.title,
      status: item.status || null,
      fileName: item.image ? path.basename(item.image) : null,
      picture: item.image ? path.join(target.root, item.image) : null,
      annotation: item.annotation ? path.join(target.root, item.annotation) : null,
      feedback: item.feedback || '',
      notes: item.body || '',
      at: this.current.at,
    };
  }

  async read(file) {
    let document;
    try { document = JSON.parse(await readFile(file, 'utf8')); }
    catch { fail('This card contains invalid JSON. Its original file has been kept.'); }
    return validateCard(document);
  }
}
