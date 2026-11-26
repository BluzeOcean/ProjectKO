import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { validateTabDocument } from './vault-schema.mjs';

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };

/**
 * The chat a board remembers.
 *
 * A page is a container, not an owner: the board keeps one chat, and the
 * hand-off names the page and the tab so the agent knows where to look without
 * being started there. The binding lives on the board's record in the Vault, so
 * it travels with the board and stays readable.
 */
export class BoardAgents {
  constructor({ repo, vault, tabs, sessions, settings, focus = () => {} }) {
    Object.assign(this, { tabs, sessions, settings, focus });
    this.vault = vault || { repo, root: path.join(repo, 'workspace'), file: path.join(repo, 'workspace', 'workspace.json') };
  }

  async entity(boardId) {
    const registry = await this.tabs.workspace.registry();
    return registry.boards.find(item => item.id === boardId) || null;
  }

  /** The chat this board remembers, if it has one yet. */
  async binding(boardId) {
    const board = await this.entity(boardId);
    return board?.agent || null;
  }

  /**
   * Hand a card to the board's agent: the picture, the marks drawn over it and
   * the feedback the user wrote, in one message.
   */
  async send({ boardId, pageId, tabId, cardId }) {
    const board = await this.entity(boardId);
    if (!board) fail('This board does not exist.', 404);
    const target = await this.tabs.resolve(boardId, pageId, tabId);
    let document;
    try { document = JSON.parse(await readFile(target.file, 'utf8')); }
    catch { fail('This tab contains invalid JSON. Its original file has been kept.'); }
    const card = validateTabDocument(document).nodes.find(node => node.kind === 'card' && node.id === cardId);
    if (!card) fail('Choose a card on this board.');
    const entry = {
      title: card.title,
      fileName: card.image ? path.basename(card.image) : null,
      picture: card.image ? path.join(path.dirname(target.file), card.image) : null,
      annotation: card.annotation ? path.join(path.dirname(target.file), card.annotation) : null,
      feedback: card.feedback || '',
      notes: card.body || '',
    };
    const chat = await this.chat(board);
    const message = this.message(board, target.page, target.tab, entry);
    this.sessions.input(chat.id, message, { coordinator: true, submit: true });
    this.focus(chat.id);
    return { sessionId: chat.id, message, chat: { id: chat.id, name: chat.name, agent: chat.agent } };
  }

  /** The board's chat: the one it remembers, or the first one it opens. */
  async chat(board) {
    const binding = board.agent;
    if (binding?.chatId) {
      try {
        const session = this.sessions.get(binding.chatId);
        if (session.open) return session;
        return await this.sessions.resume(binding.chatId);
      } catch { /* The chat is gone. The board opens a new one. */ }
    }
    const settings = this.settings();
    const session = await this.sessions.create({
      agent: settings.defaultAgent || 'codex',
      name: board.title,
      cwd: path.join(this.vault.root, board.folder),
      effort: settings.defaultEffort,
      bypass: settings.defaultBypass === true,
    });
    await this.bind(board.id, { chatId: session.id, agent: session.agent, name: session.name });
    return session;
  }

  async bind(boardId, value) {
    await this.tabs.workspace.change(registry => {
      const board = registry.boards.find(item => item.id === boardId);
      if (board) board.agent = value;
      return true;
    });
  }

  /** What the agent receives: the picture, the marks, and the words. */
  message(board, page, tab, entry) {
    const lines = ['[Board: ' + board.title + ' / ' + page.title + ' / ' + tab.name + ']', ''];
    lines.push('Chosen card: ' + (entry.fileName || 'no picture') + ' - ' + entry.title);
    if (entry.picture) lines.push('Picture: ' + entry.picture);
    if (entry.annotation) lines.push('Marked picture: ' + entry.annotation);
    if (entry.notes) lines.push('Notes on the card: ' + entry.notes);
    lines.push('', 'Feedback:', entry.feedback || '(none)');
    return lines.join('\n');
  }
}
