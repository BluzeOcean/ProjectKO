import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { validateCard } from './card-schema.mjs';

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };

/**
 * The chat a board remembers.
 *
 * The first hand-off opens a chat named after the board, working in the
 * board's own folder, and the board remembers it. Later hand-offs go to that
 * same chat, so a board keeps one conversation with its agent instead of
 * opening a new one every time.
 *
 * The binding lives on the board's own record in the workspace registry, so
 * it travels with the board and stays readable.
 */
export class BoardAgents {
  constructor({ repo, cards, sessions, settings, focus = () => {} }) {
    Object.assign(this, { repo, cards, sessions, settings, focus });
  }

  async entity(entityId) {
    const registry = await this.cards.workspace.registry();
    return registry.entities.find(item => item.id === entityId) || null;
  }

  /** The chat this board remembers, if it has one yet. */
  async binding(entityId) {
    const entity = await this.entity(entityId);
    return entity?.agent || null;
  }

  /**
   * Hand an entry to the board's agent: the picture, the marks drawn over
   * it and the feedback the user wrote, in one message.
   */
  async send({ entityId, step, entryId }) {
    const entity = await this.entity(entityId);
    if (!entity) fail('This board does not exist.', 404);
    const entry = await this.entry(entity, step, entryId);
    const chat = await this.chat(entity);
    const message = this.message(entity, entry);
    this.sessions.input(chat.id, message, { coordinator: true, submit: true });
    this.focus(chat.id);
    return { sessionId: chat.id, message, chat: { id: chat.id, name: chat.name, agent: chat.agent } };
  }

  async entry(entity, step, entryId) {
    const target = await this.cards.resolve(entity.id, step);
    let document;
    try { document = JSON.parse(await readFile(target.file, 'utf8')); }
    catch { fail('This card contains invalid JSON. Its original file has been kept.'); }
    const item = validateCard(document).items.find(entry => entry.id === entryId);
    if (!item) fail('Choose an entry on this board.');
    return {
      title: item.title,
      fileName: item.image ? path.basename(item.image) : null,
      picture: item.image ? path.join(target.root, item.image) : null,
      annotation: item.annotation ? path.join(target.root, item.annotation) : null,
      feedback: item.feedback || '',
      notes: item.body || '',
    };
  }

  /** The board's chat: the one it remembers, or the first one it opens. */
  async chat(entity) {
    const binding = entity.agent;
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
      name: entity.title,
      cwd: path.join(this.repo, 'workspace', entity.folder),
      effort: settings.defaultEffort,
      bypass: settings.defaultBypass === true,
    });
    await this.bind(entity.id, { chatId: session.id, agent: session.agent, name: session.name, folder: entity.folder });
    return session;
  }

  async bind(entityId, value) {
    await this.cards.registryChange(registry => {
      const entity = registry.entities.find(item => item.id === entityId);
      if (entity) entity.agent = value;
    });
  }

  /** What the agent receives: the picture, the marks, and the words. */
  message(entity, entry) {
    const lines = [`[Pinboard · ${entity.title}]`, ''];
    lines.push(`Chosen entry: ${entry.fileName || 'no picture'} — ${entry.title}`);
    if (entry.picture) lines.push(`Picture: ${entry.picture}`);
    if (entry.annotation) lines.push(`Marked picture: ${entry.annotation}`);
    if (entry.notes) lines.push(`Notes on the entry: ${entry.notes}`);
    lines.push('', 'Feedback:', entry.feedback || '(none)');
    return lines.join('\n');
  }
}
