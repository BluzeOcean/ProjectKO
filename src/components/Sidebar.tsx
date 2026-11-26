import type { RefObject } from 'react'
import type { Board } from '../types'
import { boardHash } from '../lib/route'
import { boardIcon } from '../lib/categories'
import { boardUrl } from '../desktop/client'
import PkoLogo from './PkoLogo'
import MakText from './MakText'
import { EntityStatusButton } from './EntityControls'

interface SidebarProps {
  pinned: Board[]
  grouped: Map<string, Board[]>
  activeId: string | null
  query: string
  onQuery: (q: string) => void
  searchRef: RefObject<HTMLInputElement | null>
  archivedCount: number
  showArchived: boolean
  onToggleArchived: () => void
  total: number
  offline: boolean
  lastSync: Date | null
  onCollapse: () => void
}

function Item({ board, active }: { board: Board; active: boolean }) {
  return (
    <div className="sidebar-item-row" data-card={board.id}>
      <a
        href={boardHash(board.id)}
        className={'sidebar-item' + (active ? ' active' : '') + (board.pinned ? ' pinned' : '')}
        aria-current={active ? 'page' : undefined}
      >
        <span className="item-icon" aria-hidden="true">
          {board.icon ? <img src={boardUrl(board.folder, board.icon)} width="24" height="24" alt="" decoding="async" /> : boardIcon(board.tags)}
        </span>
        <span className="item-text">{board.title}</span>
      </a>
      <EntityStatusButton entity={board} />
    </div>
  )
}

export default function Sidebar({
  pinned, grouped, activeId, query, onQuery, searchRef, archivedCount, showArchived, onToggleArchived, total, offline, lastSync, onCollapse,
}: SidebarProps) {
  const empty = pinned.length === 0 && grouped.size === 0

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <PkoLogo size={54} animated={activeId !== 'my-dream-game'} />
        <div className="brand-text">
          <MakText height={26} animated={activeId !== 'my-dream-game'} />
          <span className="brand-sub">vaultspace</span>
        </div>
        <button className="sidebar-collapse" onClick={onCollapse} title="Hide menu ( [ )" aria-label="Hide menu">‹</button>
      </div>

      <div className="sidebar-search">
        <span className="search-icon" aria-hidden="true">{'⌕'}</span>
        <input
          ref={searchRef}
          value={query}
          onChange={ev => onQuery(ev.target.value)}
          onKeyDown={ev => {
            if (ev.key === 'Escape') { onQuery(''); ev.currentTarget.blur() }
          }}
          placeholder="Search boards and pages"
          aria-label="Search boards and pages"
        />
        {query && <button type="button" className="search-clear" aria-label="Clear search" onClick={() => onQuery('')}>×</button>}
      </div>

      <nav className="sidebar-list" aria-label="Boards">
        {pinned.length > 0 && <div className="sidebar-group-label">Pinned</div>}
        {pinned.map(board => <Item key={board.id} board={board} active={board.id === activeId} />)}
        {[...grouped].map(([label, items]) => (
          <div key={label}>
            <div className="sidebar-group-label">{label}</div>
            {items.map(board => <Item key={board.id} board={board} active={board.id === activeId} />)}
          </div>
        ))}
        {empty && <p className="sidebar-empty">{query ? 'No board matches.' : 'No board yet.'}</p>}
      </nav>

      <div className="sidebar-foot">
        <button className={'sidebar-archive' + (showArchived ? ' on' : '')} onClick={onToggleArchived}>
          {showArchived ? 'Hide archive' : 'Show archive'}{archivedCount > 0 ? ' (' + archivedCount + ')' : ''}
        </button>
        <span className="sidebar-count">{total} board{total === 1 ? '' : 's'}</span>
        <span className={'sidebar-sync' + (offline ? ' offline' : '')}>
          {offline ? 'Offline' : lastSync ? 'Synced ' + lastSync.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Syncing…'}
        </span>
      </div>
    </aside>
  )
}
