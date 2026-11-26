// Hash routing: #/<boardId>/<pageId>/<tabId>. Anything missing falls back to
// the level above: no page opens the page grid, no tab opens the page's first.
// Plain <a href> hash links do the navigation; App listens to hashchange.

export interface Route {
  boardId: string | null
  pageId: string | null
  tabId: string | null
}

const decode = (value?: string) => (value ? decodeURIComponent(value) : null)

export function parseHash(): Route {
  const raw = window.location.hash.replace(/^#\/?/, '')
  if (!raw) return { boardId: null, pageId: null, tabId: null }
  const [boardId, pageId, tabId] = raw.split('/')
  return { boardId: decode(boardId), pageId: decode(pageId), tabId: decode(tabId) }
}

export function hashFor(boardId: string | null, pageId?: string | null, tabId?: string | null): string {
  const parts = [boardId, pageId, tabId].filter((value): value is string => !!value).map(encodeURIComponent)
  return parts.length ? '#/' + parts.join('/') : '#/'
}

export const boardHash = (id: string) => hashFor(id)
export const pageHash = (boardId: string, pageId: string) => hashFor(boardId, pageId)
export const tabHash = (boardId: string, pageId: string, tabId: string) => hashFor(boardId, pageId, tabId)

/** The tab a page opens on: the one asked for, else its first. */
export function resolveTab<T extends { id: string }>(tabs: T[], requested: string | null): T | null {
  return (requested ? tabs.find(tab => tab.id === requested) : undefined) ?? tabs[0] ?? null
}
