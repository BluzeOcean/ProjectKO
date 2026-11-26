import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import type { Board } from './types'
import { useWorkspace, archiveCutoff } from './lib/workspace'
import { parseHash, resolveTab, type Route } from './lib/route'
import { boardTagLabel } from './lib/categories'
import PkoLogo from './components/PkoLogo'
import Sidebar from './components/Sidebar'
import Topbar from './components/Topbar'
import Vaultspace from './components/Vaultspace'
import BoardPages from './components/BoardPages'
import EntityControls from './components/EntityControls'
import ReportBoundary from './components/ReportBoundary'
import NewTab from './components/NewTab'
import { boardUrl, isDesktop } from './desktop/client'

const Compare3D = lazy(() => import('./components/Compare3D'))
const ReportViewer = lazy(() => import('./components/ReportViewer'))
const TabEditor = lazy(() => import('./components/TabEditor'))

// Freshly-touched work always burns at the top: sort by 'updated' (falls back to
// 'created'), regardless of status - a board Mak just edited must not sink under
// long-lived 'active' ones. Status only breaks ties.
const lastTouched = (board: Board) => board.updated ?? board.created
const statusRank = (board: Board) => (board.status === 'active' ? 0 : 1)
const byFreshness = (a: Board, b: Board) => lastTouched(b).localeCompare(lastTouched(a)) || statusRank(a) - statusRank(b)
// A board is put away when it says so, or when it has been quiet for a week.
// A pinned board and a starter board are never put away by the date rule.
const isArchived = (board: Board, cutoff: string) =>
  board.status === 'archived' || (!board.pinned && !board.sample && lastTouched(board) < cutoff)

export default function App() {
  const { workspace, offline, lastSync, reload } = useWorkspace()
  const [route, setRoute] = useState<Route>(parseHash)
  const [query, setQuery] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [archiveWanted, setArchiveWanted] = useState(false)
  const [genre, setGenre] = useState('all')
  const [collapsed, setCollapsed] = useState(() => isDesktop || localStorage.getItem('mak.sidebarCollapsed') === '1')
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => { localStorage.setItem('mak.sidebarCollapsed', collapsed ? '1' : '0') }, [collapsed])

  const boards = workspace?.boards ?? []
  const board = boards.find(item => item.id === route.boardId) ?? null
  const page = board?.pages.find(item => item.id === route.pageId) ?? null
  const tab = page ? resolveTab(page.tabs, route.tabId) : null
  // A tab's path is relative to the board's folder: a card lives under the
  // page's folder, a report keeps the path it was written with.
  const reportUrl = board && page && tab ? boardUrl(board.folder, tab.path) : null

  const cutoff = archiveCutoff()
  const archivedCount = boards.filter(item => isArchived(item, cutoff)).length
  const [lastArchiveCount, setLastArchiveCount] = useState(archivedCount)
  if (archivedCount !== lastArchiveCount) {
    setLastArchiveCount(archivedCount)
    if (archivedCount === 0) setArchiveWanted(false)
  }
  const archiveOpen = archiveWanted && archivedCount > 0

  // Hash -> state: board links navigate natively; this also covers back/forward.
  useEffect(() => {
    const onHash = () => { setRoute(parseHash()); if (isDesktop) setCollapsed(true) }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // "/" focuses search; "[" toggles the sidebar.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement | null
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
      if (typing) return
      if (ev.key === '/') { ev.preventDefault(); searchRef.current?.focus() }
      else if (ev.key === '[') { ev.preventDefault(); setCollapsed(v => !v) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => { document.title = board ? 'Project KO — ' + board.title : 'Project KO — Vaultspace' }, [board])

  const goHome = useCallback(() => {
    history.pushState(null, '', window.location.pathname + window.location.search)
    setRoute({ boardId: null, pageId: null, tabId: null })
  }, [])

  const selectTab = (tabId: string) => {
    if (!board || !page) return
    history.replaceState(null, '', '#/' + [board.id, page.id, tabId].map(encodeURIComponent).join('/'))
    setRoute({ boardId: board.id, pageId: page.id, tabId })
  }

  if (!workspace) return <div className="boot"><PkoLogo size={76} /></div>

  const q = query.trim().toLowerCase()
  const searching = q.length > 0
  const putAway = (item: Board) => isArchived(item, cutoff)
  const matchesQuery = (item: Board) =>
    !searching || [item.title, item.description || '', ...item.tags, item.id, ...item.pages.map(page => page.title)].some(value => value && value.toLowerCase().includes(q))

  const visible = boards.filter(item => matchesQuery(item) && (searching || showArchived || !putAway(item)))
  const pinned = visible.filter(item => item.pinned).sort(byFreshness)
  const rest = visible.filter(item => !item.pinned).sort(byFreshness)
  const deckBoards = [...pinned, ...rest]
  const archive = boards.filter(putAway).sort(byFreshness)
  const archivedIds = archive.map(item => item.id)
  const shown = archiveOpen ? archive.filter(item => matchesQuery(item)) : deckBoards
  const genres = [...new Set<string>(shown.flatMap(item => item.tags))]
  const activeGenre = genre === 'all' || genres.includes(genre) ? genre : 'all'

  // The sidebar groups by the first tag, and the deck owns its own tag filter.
  const flat = showArchived || searching
  const grouped = new Map<string, Board[]>()
  for (const item of rest) {
    const label = flat ? 'By date' : boardTagLabel(item.tags[0] || '')
    if (!grouped.has(label)) grouped.set(label, [])
    grouped.get(label)!.push(item)
  }

  const showingBoard = Boolean(board)

  return (
    <EntityControls entities={boards} onChanged={reload}>
      <div className={'app-layout' + (collapsed ? ' sidebar-collapsed' : '')} data-entity={route.boardId || undefined}>
        <Sidebar
          pinned={pinned}
          grouped={grouped}
          activeId={route.boardId}
          query={query}
          onQuery={setQuery}
          searchRef={searchRef}
          archivedCount={archivedCount}
          showArchived={showArchived}
          onToggleArchived={() => setShowArchived(v => !v)}
          total={boards.length}
          offline={offline}
          lastSync={lastSync}
          onCollapse={() => setCollapsed(true)}
        />

        <button className="sidebar-reopen" onClick={() => setCollapsed(false)} title="Show menu — press Project KO's nose ( [ )" aria-label="Show menu">
          <PkoLogo size={38} animated={route.boardId !== 'my-dream-game'} />
        </button>

        <main className="main">
          {showingBoard && (
            <Topbar
              board={board}
              page={page}
              tab={tab}
              onTab={selectTab}
              onHome={goHome}
              reportUrl={reportUrl}
            />
          )}

          <div className={'content' + (showingBoard ? '' : ' deck-content')}>
            <ReportBoundary key={reportUrl || (route.boardId ? 'board' : 'home')} onHome={goHome}>
              {!board ? (
                <Vaultspace
                  boards={shown}
                  genres={genres}
                  genre={activeGenre}
                  onGenre={setGenre}
                  searching={searching}
                  query={query}
                  offline={offline}
                  archivedCount={archivedCount}
                  archivedIds={archivedIds}
                  archiveOpen={archiveOpen}
                  onToggleArchive={() => setArchiveWanted(v => !v)}
                />
              ) : !page ? (
                <BoardPages board={board} />
              ) : !tab ? (
                <div className="tab-empty">
                  <p>This page has no tab yet.</p>
                  {isDesktop && <NewTab boardId={board.id} pageId={page.id} label="+ New tab" />}
                </div>
              ) : reportUrl && tab.viewer === 'compare3d' ? (
                <Suspense fallback={<div className="boot"><PkoLogo size={56} animated={false} /></div>}>
                  <Compare3D key={reportUrl} manifestUrl={reportUrl} baseUrl={reportUrl.slice(0, reportUrl.lastIndexOf('/'))} />
                </Suspense>
              ) : reportUrl && tab.viewer === 'report' ? (
                <Suspense fallback={<div className="boot"><PkoLogo size={56} animated={false} /></div>}>
                  <ReportViewer key={reportUrl} url={reportUrl} title={tab.name} relativePath={board.folder + '/' + tab.path} />
                </Suspense>
              ) : reportUrl ? (
                <Suspense fallback={<div className="report-loading">Opening tab…</div>}>
                  <TabEditor
                    key={board.id + '/' + page.id + '/' + tab.id}
                    where={{ boardId: board.id, pageId: page.id, tabId: tab.id }}
                    tab={tab}
                    baseUrl={reportUrl}
                  />
                </Suspense>
              ) : null}
            </ReportBoundary>
          </div>
        </main>
      </div>
    </EntityControls>
  )
}
