import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * One confirmation for one destructive act. The facts are the object's own,
 * so the dialog can name what is about to be lost instead of asking "are you
 * sure". Cancel changes nothing; the service decides what happens to the files.
 */
export default function DeleteDialog({ label, name, facts, warning, onDelete, onClose }: {
  label: string
  name: string
  facts: { label: string; value: string }[]
  warning: string
  onDelete: () => Promise<void>
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  useLayoutEffect(() => {
    const element = dialog.current
    if (!element) return
    element.showModal()
    return () => element.close()
  }, [])

  // A target that goes away under the dialog closes it: there is nothing left
  // to confirm.
  useEffect(() => {
    const navigate = () => onClose()
    window.addEventListener('hashchange', navigate)
    return () => window.removeEventListener('hashchange', navigate)
  }, [onClose])

  async function remove() {
    if (deleting) return
    setDeleting(true)
    setError('')
    try {
      await onDelete()
      onClose()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'It could not be deleted. Try again.')
      setDeleting(false)
    }
  }

  return createPortal(
    <dialog
      ref={dialog}
      className="deck-delete"
      aria-label={label}
      aria-busy={deleting}
      onCancel={event => { event.preventDefault(); if (!deleting) onClose() }}
      onClick={event => {
        if (event.target !== event.currentTarget || deleting) return
        const rect = event.currentTarget.getBoundingClientRect()
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose()
      }}
      onKeyDown={event => event.stopPropagation()}
    >
      <h2 className="deck-delete-title">{label}</h2>
      <p className="deck-delete-body"><b>{name}</b> and everything on it will be removed. This cannot be undone.</p>
      <div className="deck-delete-facts">
        {facts.map(fact => <div className="deck-delete-fact" key={fact.label}><b>{fact.label}</b><span>{fact.value}</span></div>)}
      </div>
      <p className="deck-delete-warn">{warning}</p>
      {error && <p className="deck-delete-error" role="alert">{error}</p>}
      <div className="deck-delete-foot">
        <button type="button" disabled={deleting} onClick={onClose}>Cancel</button>
        <button type="button" className="deck-delete-confirm" disabled={deleting} onClick={() => void remove()}>{deleting ? 'Deleting…' : 'Delete'}</button>
      </div>
    </dialog>, document.body,
  )
}
