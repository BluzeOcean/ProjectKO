import { useState, type ReactNode } from 'react'
import type { WorkspaceEntity } from '../types'
import { categoryIcon, categoryLabel } from '../lib/categories'
import { boardHue } from '../lib/boards'
import { entityHash } from '../lib/route'
import { updateWorkspaceEntity } from '../lib/workspace'
import { isDesktop } from '../desktop/client'
import { Icon } from '../desktop/Icons'
import { EntityStatusButton } from './EntityControls'
import DeleteBoardDialog from './DeleteBoardDialog'
import BrowserSettings from './BrowserSettings'
import NewCard from './NewCard'
import '../styles/workspace-deck.css'

/**
 * The Vaultspace overview: the boards as a gallery of thumbnails, with the
 * facts of the board you are pointing at in a thin column beside it.
 *
 * The board's own page is a different screen and is not built here.
 */

/** A board's tag is its category. It is what the filter groups by and
 *  what the tag block sets. */
const genre = (entity: WorkspaceEntity) => entity.category || 'other'

interface WorkspaceDeckProps {
  /** Every board the Vault holds right now, pinned first. */
  boards: WorkspaceEntity[]
  /** The genres those boards carry, in the order they first appear. */
  genres: string[]
  genre: string
  onGenre: (genre: string) => void
  searching: boolean
  query: string
  offline: boolean
  /** How many boards are put away right now. */
  archivedCount: number
  /** The boards that are put away, by id. A board can be in the archive
   *  because it says so or because it has been quiet for a week. */
  archivedIds: string[]
  /** Whether the deck is showing the archive instead of the working boards. */
  archiveOpen: boolean
  onToggleArchive: () => void
}

export default function WorkspaceDeck({
  boards,
  genres,
  genre: activeGenre,
  onGenre,
  searching,
  query,
  offline,
  archivedCount,
  archivedIds,
  archiveOpen,
  onToggleArchive,
}: WorkspaceDeckProps) {
  const [focusId, setFocusId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<WorkspaceEntity | null>(null)
  const [note, setNote] = useState<ReactNode>('')

  const shown = activeGenre === 'all' ? boards : boards.filter(entity => genre(entity) === activeGenre)
  // The board being described. A board the filter put away hands the column
  // to the first one that is still there.
  const focus = shown.find(entity => entity.id === focusId) ?? shown[0] ?? null
  // Whether the board is in the archive, not whether its status says so: a
  // board that has been quiet for a week is in the archive too.
  const focusArchived = focus ? archivedIds.includes(focus.id) : false
  const steps = boards.reduce((total, entity) => total + entity.steps.length, 0)
  const lastChange = boards
    .map(entity => entity.updated ?? entity.created)
    .filter(Boolean)
    .sort()
    .reverse()[0]

  async function assign(category: string) {
    if (!focus || saving || category === genre(focus)) return
    setSaving(true)
    setError('')
    try {
      await updateWorkspaceEntity(focus.id, { category })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The board could not be tagged. Try again.')
    } finally {
      setSaving(false)
    }
  }

  /** Puts a board away, or brings it back. The board keeps its files and its
   *  tabs either way: only the deck and the sidebar stop showing it. */
  async function setArchived(archived: boolean) {
    if (!focus || saving) return
    setSaving(true)
    setError('')
    try {
      await updateWorkspaceEntity(focus.id, { status: archived ? 'archived' : 'active' })
      setNote(<><b>{focus.title}</b> {archived ? 'archived.' : 'brought back.'}</>)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The board could not be archived. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="deck">
      <header className="deck-banner">
        <div className="deck-banner-text">
          <h1 className="deck-banner-title">Vaultspace</h1>
        </div>
        <div className="deck-banner-right">
          {isDesktop ? <NewCard label="+ New board" className="deck-new-board" /> : <BrowserSettings />}
        </div>
        <div className="deck-banner-bottom">
          <div className="deck-genres" role="group" aria-label="Filter boards by tag">
            <button
              type="button"
              className={`deck-genre${activeGenre === 'all' ? ' active' : ''}`}
              aria-pressed={activeGenre === 'all'}
              onClick={() => onGenre('all')}
            >
              All
            </button>
            {genres.map(value => (
              <button
                key={value}
                type="button"
                className={`deck-genre${activeGenre === value ? ' active' : ''}`}
                aria-pressed={activeGenre === value}
                onClick={() => onGenre(value)}
              >
                {categoryLabel(value)}
              </button>
            ))}
          </div>
          {/* The boards that are put away. The toggle only appears once there
              is something in it, so the deck stays quiet until it is used. */}
          {archivedCount > 0 && (
            <button
              type="button"
              className={`deck-archive-toggle${archiveOpen ? ' active' : ''}`}
              aria-pressed={archiveOpen}
              onClick={onToggleArchive}
            >
              {archiveOpen ? '▼ Archive' : `▶ Archived (${archivedCount})`}
            </button>
          )}
        </div>
      </header>

      <div className="deck-page">
        <section className="deck-stage">
          <div className="deck-stage-head">
            <span className="deck-label">{archiveOpen ? 'Archive' : 'Boards'}</span>
            <span className="deck-stage-count">{shown.length}</span>
            {searching && <span className="deck-stage-note">matching “{query.trim()}”</span>}
            {offline && <span className="deck-offline">workspace.json unreachable</span>}
          </div>

          <div className="deck-tiles">
            {shown.map(entity => {
              const hue = boardHue(entity.id)
              return (
                <a
                  key={entity.id}
                  href={entityHash(entity.id)}
                  data-card={entity.id}
                  className={`deck-tile${focus?.id === entity.id ? ' active' : ''}`}
                  onMouseEnter={() => setFocusId(entity.id)}
                  onFocus={() => setFocusId(entity.id)}
                >
                  <span className="deck-mark" style={{ background: hue.bg, color: hue.ink }} aria-hidden="true">
                    {categoryIcon(genre(entity))}
                  </span>
                  <span className="deck-tile-name">{entity.title}</span>
                  <span className="deck-tile-count">
                    {entity.steps.length} step{entity.steps.length === 1 ? '' : 's'}
                    <span className="deck-tile-open" aria-hidden="true">→</span>
                  </span>
                </a>
              )
            })}
          </div>

          {!shown.length && (
            <p className="deck-empty">
              {boards.length ? 'No board carries this tag.' : 'Nothing here yet. New work will appear as boards, sir.'}
            </p>
          )}

          {note && <p className="deck-note">{note}</p>}

          <div className="deck-status">
            <b>{boards.length}</b> board{boards.length === 1 ? '' : 's'} · <b>{steps}</b> step{steps === 1 ? '' : 's'}
            {lastChange && <> · last change <b>{lastChange}</b></>}
          </div>
        </section>

        <aside className="deck-inspector" aria-label="Board details" data-card={focus?.id}>
          {focus ? (
            <>
              <header className="deck-insp-head">
                <h2 className="deck-insp-title">{focus.title}</h2>
                <span className="deck-insp-meta">{focus.updated ?? focus.created}</span>
              </header>
              {focus.description && <p className="deck-insp-desc">{focus.description}</p>}

              <div className="deck-tags">
                <div className="deck-tag-label">Tag · assign another</div>
                <span className="deck-tag-current">
                  <span aria-hidden="true">{categoryIcon(genre(focus))}</span>
                  {categoryLabel(genre(focus))}
                </span>
                <div className="deck-tag-options">
                  {genres
                    .filter(value => value !== genre(focus))
                    .map(value => (
                      <button
                        key={value}
                        type="button"
                        className="deck-tag-option"
                        disabled={!isDesktop || saving}
                        title={isDesktop ? `Tag this board ${categoryLabel(value)}` : 'Open the desktop app to change the tag'}
                        onClick={() => void assign(value)}
                      >
                        {categoryLabel(value)}
                      </button>
                    ))}
                </div>
                {error && <p className="deck-tag-error" role="alert">{error}</p>}
              </div>

              <footer className="deck-insp-foot">
                <div className="deck-facts">
                  <div className="deck-fact">
                    <b>Status</b>
                    <span className="deck-fact-status">
                      <EntityStatusButton entity={focus} />
                      {focus.status}
                    </span>
                  </div>
                  <div className="deck-fact">
                    <b>Updated</b>
                    <span>{focus.updated ?? '—'}</span>
                  </div>
                  <div className="deck-fact">
                    <b>Created</b>
                    <span>{focus.created}</span>
                  </div>
                  <div className="deck-fact">
                    <b>Folder</b>
                    <span>{focus.folder}</span>
                  </div>
                </div>
                <div className="deck-insp-actions">
                  <a className="deck-insp-action" href={entityHash(focus.id)}>Open board</a>
                  {/* Putting a board away is a plain thing to do, so it is a
                      button of its own and not a corner of a dialog. */}
                  <button
                    type="button"
                    className="deck-insp-archive"
                    aria-label={focusArchived ? `Bring ${focus.title} back` : `Archive ${focus.title}`}
                    title={isDesktop
                      ? (focusArchived ? `Bring ${focus.title} back` : `Archive ${focus.title}`)
                      : 'Open the desktop app to archive a board'}
                    disabled={!isDesktop || saving}
                    onClick={() => void setArchived(!focusArchived)}
                  >
                    {focusArchived ? 'Restore' : 'Archive'}
                  </button>
                  <button
                    type="button"
                    className="deck-insp-delete"
                    aria-label={`Delete ${focus.title}`}
                    aria-haspopup="dialog"
                    title={isDesktop ? `Delete ${focus.title}` : 'Open the desktop app to delete a board'}
                    disabled={!isDesktop}
                    onClick={() => setDeleting(focus)}
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              </footer>
            </>
          ) : (
            <p className="deck-empty">No board to describe.</p>
          )}
        </aside>
      </div>

      <DeleteBoardDialog
        entity={deleting}
        onClose={() => setDeleting(null)}
        onDeleted={entity => {
          setDeleting(null)
          setNote(<><b>{entity.title}</b> deleted. Its files went with it.</>)
        }}
      />
    </div>
  )
}
