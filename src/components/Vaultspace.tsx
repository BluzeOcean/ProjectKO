import { useState, type ReactNode } from 'react'
import type { Board, BoardTag } from '../types'
import { boardHue } from '../lib/boards'
import { boardHash } from '../lib/route'
import { boardIcon, boardTagLabel, boardTagLabels } from '../lib/categories'
import { updateBoard, deleteBoard } from '../lib/workspace'
import { boardUrl, isDesktop } from '../desktop/client'
import { Icon } from '../desktop/Icons'
import TileDeck, { type Tile } from './TileDeck'
import DeleteDialog from './DeleteDialog'
import { EntityStatusButton } from './EntityControls'
import NewBoard from './NewBoard'
import BrowserSettings from './BrowserSettings'
import '../styles/workspace-deck.css'

/**
 * The Vaultspace overview: the boards as a wall of thumbnails, with the facts
 * of the board you are pointing at in a thin column beside it.
 *
 * A board's own screen is the same grid one level down, drawing its pages.
 */

interface VaultspaceProps {
  boards: Board[]
  genres: string[]
  genre: string
  onGenre: (genre: string) => void
  searching: boolean
  query: string
  offline: boolean
  archivedCount: number
  archivedIds: string[]
  archiveOpen: boolean
  onToggleArchive: () => void
}

function BoardInspector({ board, archived, onDeleted, onNote }: {
  board: Board
  archived: boolean
  onDeleted: (board: Board) => void
  onNote: (node: ReactNode) => void
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)

  async function save(patch: Parameters<typeof updateBoard>[1]) {
    if (saving) return
    setSaving(true); setError('')
    try { await updateBoard(board.id, patch) } catch (reason) { setError(reason instanceof Error ? reason.message : 'The board could not be updated. Try again.') } finally { setSaving(false) }
  }

  async function setArchived(next: boolean) {
    if (saving) return
    setSaving(true); setError('')
    try {
      await updateBoard(board.id, { status: next ? 'active' : 'archived' })
      onNote(<><b>{board.title}</b> {next ? 'brought back.' : 'archived.'}</>)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The board could not be archived. Try again.') } finally { setSaving(false) }
  }

  const toggleTag = (tag: BoardTag) => {
    const next = board.tags.includes(tag) ? board.tags.filter(value => value !== tag) : [...board.tags, tag]
    void save({ tags: next })
  }

  return <>
    <header className="deck-insp-head">
      <h2 className="deck-insp-title">{board.title}</h2>
      <span className="deck-insp-meta">{board.updated ?? board.created}</span>
    </header>
    {board.description && <p className="deck-insp-desc">{board.description}</p>}

    <div className="deck-tags">
      <div className="deck-tag-label">Tags</div>
      <div className="deck-tag-options">
        {(Object.keys(boardTagLabels) as BoardTag[]).map(value => (
          <button
            key={value}
            type="button"
            className={'deck-tag-option' + (board.tags.includes(value) ? ' on' : '')}
            aria-pressed={board.tags.includes(value)}
            disabled={!isDesktop || saving}
            title={isDesktop ? 'Tag this board ' + boardTagLabel(value) : 'Open the desktop app to change the tag'}
            onClick={() => toggleTag(value)}
          >
            {boardTagLabel(value)}
          </button>
        ))}
      </div>
      {error && <p className="deck-tag-error" role="alert">{error}</p>}
    </div>

    <footer className="deck-insp-foot">
      <div className="deck-facts">
        <div className="deck-fact"><b>Status</b><span className="deck-fact-status"><EntityStatusButton entity={board} />{board.status}</span></div>
        <div className="deck-fact"><b>Pages</b><span>{board.pages.length}</span></div>
        <div className="deck-fact"><b>Created</b><span>{board.created}</span></div>
        <div className="deck-fact"><b>Folder</b><span>{board.folder}</span></div>
      </div>
      <div className="deck-insp-actions">
        <a className="deck-insp-action" href={boardHash(board.id)}>Open board</a>
        <button
          type="button"
          className="deck-insp-archive"
          aria-label={archived ? 'Bring ' + board.title + ' back' : 'Archive ' + board.title}
          title={isDesktop ? (archived ? 'Bring ' + board.title + ' back' : 'Archive ' + board.title) : 'Open the desktop app to archive a board'}
          disabled={!isDesktop || saving}
          onClick={() => void setArchived(archived)}
        >
          {archived ? 'Restore' : 'Archive'}
        </button>
        <button
          type="button"
          className="deck-insp-delete"
          aria-label={'Delete ' + board.title}
          aria-haspopup="dialog"
          title={isDesktop ? 'Delete ' + board.title : 'Open the desktop app to delete a board'}
          disabled={!isDesktop}
          onClick={() => setConfirming(true)}
        >
          <Icon name="trash" size={14} />
        </button>
      </div>
    </footer>
    {confirming && <DeleteDialog
      label="Delete this board?"
      name={board.title}
      facts={[
        { label: 'Pages', value: board.pages.length ? board.pages.map(item => item.title).join(', ') : 'none yet' },
        { label: 'Folder', value: board.folder },
      ]}
      warning="The files in this board's folder go with it."
      onDelete={async () => { await deleteBoard(board.id); onDeleted(board) }}
      onClose={() => setConfirming(false)}
    />}
  </>
}

export default function Vaultspace({
  boards, genres, genre: activeGenre, onGenre, searching, query, offline,
  archivedCount, archivedIds, archiveOpen, onToggleArchive,
}: VaultspaceProps) {
  const [note, setNote] = useState<ReactNode>('')
  const shown = activeGenre === 'all' ? boards : boards.filter(board => board.tags.some(tag => tag === activeGenre))
  const tiles: Tile[] = shown.map(board => {
    const hue = boardHue(board.id)
    return {
      id: board.id,
      href: boardHash(board.id),
      title: board.title,
      subtitle: board.pages.length + (board.pages.length === 1 ? ' page' : ' pages'),
      glyph: boardIcon(board.tags),
      hue,
      image: board.icon ? boardUrl(board.folder, board.icon) : undefined,
      tags: board.tags,
    }
  })

  const pages = boards.reduce((total, board) => total + board.pages.length, 0)

  return <TileDeck
    bannerTitle="Vaultspace"
    bannerRight={isDesktop ? <NewBoard label="+ New board" className="deck-new-board" /> : <BrowserSettings />}
    tags={genres}
    labels={boardTagLabels as Record<string, string>}
    activeTag={activeGenre}
    onTag={onGenre}
    bannerBottomExtra={archivedCount > 0 ? (
      <button
        type="button"
        className={'deck-archive-toggle' + (archiveOpen ? ' active' : '')}
        aria-pressed={archiveOpen}
        onClick={onToggleArchive}
      >
        {archiveOpen ? '▼ Archive' : '▶ Archived (' + archivedCount + ')'}
      </button>
    ) : undefined}
    stageLabel={archiveOpen ? 'Archive' : 'Boards'}
    tiles={tiles}
    emptyText={boards.length ? 'No board carries this tag.' : 'Nothing here yet. New work will appear as boards, sir.'}
    searching={searching}
    query={query}
    offline={offline}
    note={note}
    inspector={tile => {
      const board = tile ? boards.find(item => item.id === tile.id) : undefined
      if (!board) return <p className="deck-empty">No board to describe.</p>
      return <BoardInspector
        key={board.id}
        board={board}
        archived={archivedIds.includes(board.id)}
        onDeleted={value => setNote(<><b>{value.title}</b> deleted. Its files went with it.</>)}
        onNote={setNote}
      />
    }}
    status={<><b>{boards.length}</b> board{boards.length === 1 ? '' : 's'} · <b>{pages}</b> page{pages === 1 ? '' : 's'}</>}
  />
}
