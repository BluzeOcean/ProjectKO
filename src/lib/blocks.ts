import type { CardBlock, SectionBlock, TabDocument } from '../../desktop/service/vault-schema.mjs'

/** Where a tab lives: the address every card action carries. */
export interface Where { boardId: string; pageId: string; tabId: string }

/** A heading and the cards under it. A tab's flat list, cut into runs. */
export interface Run { section: SectionBlock | null; cards: CardBlock[] }

export function runsOf(document: TabDocument): Run[] {
  const runs: Run[] = []
  let current: Run = { section: null, cards: [] }
  for (const node of document.nodes) {
    if (node.kind === 'section') {
      if (current.section || current.cards.length) runs.push(current)
      current = { section: node, cards: [] }
    } else current.cards.push(node)
  }
  runs.push(current)
  return runs
}

/** The 1-based card number each run starts at, so numbering crosses headings. */
export const cardStarts = (runs: Run[]): number[] =>
  runs.map((_, index) => runs.slice(0, index).reduce((total, run) => total + run.cards.length, 0))
