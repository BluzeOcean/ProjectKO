import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import type { WorkspaceEntity } from './types'
import { useWorkspace, archiveCutoff } from './lib/workspace'
import { parseHash, entityHash, resolveStep, type Route } from './lib/route'
import PkoLogo from './components/PkoLogo'
import Sidebar from './components/Sidebar'
import Topbar from './components/Topbar'
import WorkspaceDeck from './components/WorkspaceDeck'
import EntityControls from './components/EntityControls'
import ReportBoundary from './components/ReportBoundary'
import { boardUrl, isDesktop } from './desktop/client'

const Compare3D = lazy(() => import('./components/Compare3D'))
const ReportViewer = lazy(() => import('./components/ReportViewer'))
const EditableCard = lazy(() => import('./components/EditableCard'))

// Freshly-touched work always burns at the top: sort by `updated` (falls back
// to `created`), regardless of status — a report Mak just edited must not sink
// under long-lived "active" entities. Status only breaks ties.
const lastTouched = (e: WorkspaceEntity) => e.updated ?? e.created
const statusRank = (e: WorkspaceEntity) => (e.status === 'active' ? 0 : 1)
const byFreshness = (a: WorkspaceEntity, b: WorkspaceEntity) =>
  lastTouched(b).localeCompare(lastTouched(a)) || statusRank(a) - statusRank(b)
// A board is put away when it says so, or when it has been quiet for a week.
// A pinned board and a starter board are never put away by the date rule.
const isArchived = (e: WorkspaceEntity, cutoff: string) =>
  e.status === 'archived' || (!e.pinned && !e.sample && lastTouched(e) < cutoff)

export default function App() {
  const { workspace, offline, lastSync, reload } = useWorkspace()
  const [route, setRoute] = useState<Route>(parseHash)
  const [query, setQuery] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [archiveWanted, setArchiveWanted] = useState(false)
  const [genre, setGenre] = useState('all')
  const [collapsed, setCollapsed] = useState(
    () => isDesktop || localStorage.getItem('mak.sidebarCollapsed') === '1',
  )
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    localStorage.setItem('mak.sidebarCollapsed', collapsed ? '1' : '0')
  }, [collapsed])

  const entities = workspace?.entities ?? []
  const entity = entities.find(e => e.id === route.id) ?? null

  // The archive: the boards that are put away. The view closes itself when
  // the archive is empty, so it is never a dead end. The state is adjusted
  // while rendering and not in an effect, so the deck never paints an empty
  // archive.
  const cutoff = archiveCutoff()
  const archivedCount = entities.filter(e => isArchived(e, cutoff)).length
  const [lastArchiveCount, setLastArchiveCount] = useState(archivedCount)
  if (archivedCount !== lastArchiveCount) {
    setLastArchiveCount(archivedCount)
    if (archivedCount === 0) setArchiveWanted(false)
  }
  const archiveOpen = archiveWanted && archivedCount > 0

  const stepIndex = entity
    ? resolveStep(entity.steps.length, route.step, entity.defaultStep)
    : -1
  const step = entity?.steps[stepIndex]
  const reportUrl = entity && step ? boardUrl(entity.folder, step.path) : null
  // A board is open only when it has something to show. Otherwise the
  // Workspace overview answers, and it brings its own banner.
  const showingBoard = Boolean(entity && reportUrl)

  // Hash → state: entity links navigate natively; this also covers back/forward.
  useEffect(() => {
    const onHash = () => { setRoute(parseHash()); if (isDesktop) setCollapsed(true) }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // "/" focuses search; "[" toggles the sidebar (handy for a clean screen recording).
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement | null
      const typing =
        t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
      if (typing) return
      if (ev.key === '/') {
        ev.preventDefault()
        searchRef.current?.focus()
      } else if (ev.key === '[') {
        ev.preventDefault()
        setCollapsed(v => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    document.title = entity ? `Project KO — ${entity.title}` : 'Project KO — Vaultspace'
  }, [entity])

  const goHome = useCallback(() => {
    history.pushState(null, '', window.location.pathname + window.location.search)
    setRoute({ id: null, step: -1 })
  }, [])

  const selectStep = useCallback((id: string, index: number) => {
    history.replaceState(null, '', entityHash(id, index))
    setRoute({ id, step: index })
  }, [])

  if (!workspace) {
    return (
      <div className="boot">
        <PkoLogo size={76} />
      </div>
    )
  }

  const q = query.trim().toLowerCase()
  const searching = q.length > 0
  // An explicit `archived` status always wins, so a card can be put away by hand
  // while it is still inside the 7-day window. Otherwise it is the date rule,
  // which `pinned` overrides in the other direction.
  const putAway = (e: WorkspaceEntity) => isArchived(e, cutoff)
  const matchesQuery = (e: WorkspaceEntity) =>
    !searching ||
    [e.title, e.description, e.category, e.id].some(s => s && s.toLowerCase().includes(q))

  // Search digs through everything, archive included; otherwise the
  // archive stays hidden behind the toggle.
  const visible = entities.filter(
    e => matchesQuery(e) && (searching || showArchived || !putAway(e)),
  )

  const pinned = visible.filter(e => e.pinned).sort(byFreshness)
  const rest = visible.filter(e => !e.pinned).sort(byFreshness)
  // The deck shows the boards themselves: the pinned ones first, then the
  // freshest. The genre filter groups them, it does not rearrange them.
  const boards = [...pinned, ...rest]
  // The archive is a list of its own: the boards that are put away, so they
  // can be found and brought back from the Vaultspace itself.
  const archive = entities.filter(putAway).sort(byFreshness)
  const archivedIds = archive.map(entity => entity.id)
  // The deck shows one list at a time: the working boards, or the archive.
  const deckBoards = archiveOpen ? archive.filter(e => matchesQuery(e)) : boards
  const genres = [...new Set(deckBoards.map(e => e.category || 'other'))]
  // A genre that no board carries any more falls back to the whole deck.
  const activeGenre = genre === 'all' || genres.includes(genre) ? genre : 'all'
  // Category grouping is for the short working set only. With the archive open or a
  // search running the list is long and the useful order is purely "what did I touch
  // last", so buckets are dropped and everything stays in one date-sorted run.
  const flat = showArchived || searching
  const grouped = new Map<string, WorkspaceEntity[]>()
  for (const e of rest) {
    const cat = flat ? 'by date' : e.category || 'other'
    if (!grouped.has(cat)) grouped.set(cat, [])
    grouped.get(cat)!.push(e)
  }

  return (
    <EntityControls entities={entities} onChanged={reload}>
    <div className={`app-layout${collapsed ? ' sidebar-collapsed' : ''}`} data-entity={route.id}>
      <Sidebar
        pinned={pinned}
        grouped={grouped}
        activeId={route.id}
        query={query}
        onQuery={setQuery}
        searchRef={searchRef}
        archivedCount={archivedCount}
        showArchived={showArchived}
        onToggleArchived={() => setShowArchived(v => !v)}
        total={entities.length}
        offline={offline}
        lastSync={lastSync}
        onCollapse={() => setCollapsed(true)}
      />

      <button
        className="sidebar-reopen"
        onClick={() => setCollapsed(false)}
        title="Show menu — press Project KO's nose ( [ )"
        aria-label="Show menu"
      >
        <PkoLogo size={38} animated={route.id !== 'my-dream-game'} />
      </button>

      <main className="main">
        {/* The overview carries its own banner, so the topbar belongs to the
            board that is open. */}
        {showingBoard && (
        <Topbar
          entity={entity}
          stepIndex={stepIndex}
          onStep={selectStep}
          onHome={goHome}
          // A compare3d step's "report" is a JSON manifest — opening it raw in a
          // tab helps nobody, so the external link is hidden for those.
          reportUrl={step?.viewer === 'compare3d' || step?.viewer === 'card' ? null : reportUrl}
        />
        )}

        <div className={`content${showingBoard ? '' : ' deck-content'}`}>
          <ReportBoundary key={reportUrl || 'home'} onHome={goHome}>
          {entity && reportUrl && step?.viewer === 'card' ? (
            <Suspense fallback={<div className="report-loading">Opening card…</div>}><EditableCard key={`${entity.id}:${stepIndex}`} url={reportUrl} entityId={entity.id} step={stepIndex} /></Suspense>
          ) : entity && reportUrl && step?.viewer === 'compare3d' ? (
            <Suspense fallback={<div className="boot"><PkoLogo size={56} animated={false} /></div>}><Compare3D
              key={reportUrl}
              manifestUrl={reportUrl}
              baseUrl={reportUrl.slice(0, reportUrl.lastIndexOf('/'))}
            /></Suspense>
          ) : entity && reportUrl ? (
            <Suspense fallback={<div className="boot"><PkoLogo size={56} animated={false} /></div>}><ReportViewer key={reportUrl} url={reportUrl} title={step?.name ?? entity.title} relativePath={`${entity.folder}/${step?.path}`} /></Suspense>
          ) : (
            <WorkspaceDeck
              boards={deckBoards}
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
          )}
          </ReportBoundary>
        </div>
      </main>
    </div>
    </EntityControls>
  )
}
