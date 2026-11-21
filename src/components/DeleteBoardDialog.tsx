import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { WorkspaceEntity } from '../types'
import { deleteWorkspaceEntity } from '../lib/workspace'
import '../styles/workspace-deck.css'

/**
 * The last question before a board goes.
 *
 * The board itself cannot be brought back: it leaves the registry and its
 * folder goes to the system trash with it. The facts are the board's own, so
 * the confirmation names what is about to be lost.
 */
export default function DeleteBoardDialog({ entity, onClose, onDeleted }: {
  entity: WorkspaceEntity | null
  onClose: () => void
  onDeleted: (entity: WorkspaceEntity) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  useLayoutEffect(() => {
    const element = dialog.current
    if (!entity || !element) return
    element.showModal()
    return () => element.close()
  }, [entity])

  // A board that goes away under the dialog closes it: there is nothing left
  // to confirm.
  useEffect(() => {
    if (!entity) return
    const navigate = () => onClose()
    window.addEventListener('hashchange', navigate)
    return () => window.removeEventListener('hashchange', navigate)
  }, [entity, onClose])

  if (!entity) return null

  const steps = entity.steps.length === 0
    ? 'none yet'
    : entity.steps.length > 3
      ? 'every file on the board'
      : entity.steps.map(step => step.name).join(', ')

  async function remove() {
    if (deleting || !entity) return
    setDeleting(true)
    setError('')
    try {
      await deleteWorkspaceEntity(entity.id)
      onDeleted(entity)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The board could not be deleted. Try again.')
      setDeleting(false)
    }
  }

  return createPortal(
    <dialog
      ref={dialog}
      className="deck-delete"
      aria-label="Delete this board?"
      aria-busy={deleting}
      onCancel={event => { event.preventDefault(); if (!deleting) onClose() }}
      onClick={event => {
        if (event.target !== event.currentTarget || deleting) return
        const rect = event.currentTarget.getBoundingClientRect()
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose()
      }}
      onKeyDown={event => event.stopPropagation()}
    >
      <h2 className="deck-delete-title">Delete this board?</h2>
      <p className="deck-delete-body">
        <b>{entity.title}</b> and everything on it will be removed. This cannot be undone.
      </p>
      <div className="deck-delete-facts">
        <div className="deck-delete-fact">
          <b>Steps</b>
          <span>{entity.steps.length} — {steps}</span>
        </div>
        <div className="deck-delete-fact">
          <b>Folder</b>
          <span>{entity.folder}</span>
        </div>
      </div>
      <p className="deck-delete-warn">The files in this board's folder go with it.</p>
      {error && <p className="deck-delete-error" role="alert">{error}</p>}
      <div className="deck-delete-foot">
        <button type="button" className="deck-delete-cancel" disabled={deleting} onClick={onClose}>Cancel</button>
        <button type="button" className="deck-delete-go" disabled={deleting} onClick={() => void remove()}>
          {deleting ? 'Deleting…' : 'Delete board'}
        </button>
      </div>
    </dialog>,
    document.body,
  )
}
