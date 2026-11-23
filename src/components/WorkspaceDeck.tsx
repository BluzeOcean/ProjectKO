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
}

export default function WorkspaceDeck({
  boards,
  genres,
  genre: activeGenre,
  onGenre,
  searching,
  query,
  offline,
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
        </div>
      </header>

      <div className="deck-page">
        <section className="deck-stage">
          <div className="deck-stage-head">
            <span className="deck-label">Boards</span>
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
