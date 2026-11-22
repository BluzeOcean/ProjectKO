/**
 * The word being spoken, painted without touching the reply.
 *
 * Adding a span around every word would re-render Markdown, fight React on the
 * next poll and break text selection. The CSS Custom Highlight API paints a
 * Range instead: one registry, one range at a time, no elements added, no layout
 * work beyond the paint. Nothing runs except while the voice speaks.
 */

const name = 'read-aloud'
type Registry = { set(name: string, range: unknown): void; delete(name: string): void }

// Both are missing in older browsers, and then there is simply no highlight.
const registry = (typeof CSS === 'undefined' ? undefined : (CSS as unknown as { highlights?: Registry }).highlights)
const Highlighter = (globalThis as unknown as { Highlight?: new (range: Range) => unknown }).Highlight
export const highlightSupported = !!registry && !!Highlighter && typeof document !== 'undefined'

export function clearWord() {
  registry?.delete(name)
}

export function showWord(ranges: Range[], index: number) {
  const range = ranges[index]
  if (!registry || !Highlighter || !range) return
  registry.set(name, new Highlighter(range))
}

// One range per word, in reading order, skipping what is not read out: a code
// block and a table are silent, so their words are not part of the count.
export function wordRanges(root: HTMLElement | null | undefined): Range[] {
  const ranges: Range[] = []
  if (!root) return ranges
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.parentElement?.closest('pre, table')) continue
    const text = node.textContent || ''
    for (const match of text.matchAll(/\S+/g)) {
      const at = match.index ?? 0
      const range = document.createRange()
      range.setStart(node, at)
      range.setEnd(node, at + match[0].length)
      ranges.push(range)
    }
  }
  return ranges
}
