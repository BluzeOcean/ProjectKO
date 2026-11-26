import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Board } from '../types'
import { updateBoard, type BoardPatch } from '../lib/workspace'
import { isDesktop } from '../desktop/client'
import './entity-controls.css'

const labels = { active: 'Active', done: 'Done', archived: 'Archived' } as const
const Controls = createContext<{ open: (board: Board, button: HTMLButtonElement) => void; editing: string | null } | null>(null)
type Target = { id: string; button: HTMLButtonElement; anchor: DOMRect }

export function EntityStatusButton({ entity }: { entity: Board }) {
  const controls = useContext(Controls)
  return (
    <button
      type="button"
      className="entity-status-button"
      aria-label={'Edit ' + entity.title + ': ' + labels[entity.status]}
      aria-haspopup="dialog"
      aria-expanded={controls?.editing === entity.id}
      title={labels[entity.status] + ' · ' + (isDesktop ? 'Change status or pin' : 'Open the desktop app to edit this board')}
      disabled={!isDesktop}
      onClick={event => controls?.open(entity, event.currentTarget)}
    >
      <span className={'status-dot ' + entity.status} aria-hidden="true" />
    </button>
  )
}

function EntityMenu({ board, target, onClose, onChanged }: {
  board: Board
  target: Target
  onClose: () => void
  onChanged: () => Promise<void>
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useLayoutEffect(() => {
    const element = dialog.current!
    element.showModal()
    const position = () => {
      const rect = target.button.isConnected ? target.button.getBoundingClientRect() : target.anchor
      const width = element.offsetWidth, height = element.offsetHeight
      element.style.left = Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12)) + 'px'
      element.style.top = Math.max(12, Math.min(rect.bottom + 6, window.innerHeight - height - 12)) + 'px'
    }
    position()
    const observer = new ResizeObserver(position)
    observer.observe(element)
    window.addEventListener('resize', position)
    return () => { observer.disconnect(); window.removeEventListener('resize', position); element.close() }
  }, [target])

  useEffect(() => {
    const navigate = () => onClose()
    window.addEventListener('hashchange', navigate)
    return () => window.removeEventListener('hashchange', navigate)
  }, [onClose])

  async function save(patch: BoardPatch) {
    if (saving) return
    setSaving(true); setError('')
    try {
      await updateBoard(board.id, patch)
      await onChanged()
      onClose()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The board could not be updated. Try again.')
    } finally { setSaving(false) }
  }

  return createPortal(
    <dialog
      ref={dialog}
      className="entity-menu"
      aria-label={'Board settings: ' + board.title}
      aria-busy={saving}
      onCancel={event => { event.preventDefault(); if (!saving) onClose() }}
      onClick={event => {
        if (event.target !== event.currentTarget || saving) return
        const rect = event.currentTarget.getBoundingClientRect()
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose()
      }}
      onKeyDown={event => event.stopPropagation()}
    >
      <div className="entity-menu-heading">
        <div><span>Board settings</span><h2>{board.title}</h2></div>
        <button type="button" className="entity-menu-close" aria-label="Close board settings" disabled={saving} onClick={onClose}>×</button>
      </div>
      <fieldset disabled={saving}>
        <legend>Status</legend>
        <div className="entity-status-options">
          {(Object.keys(labels) as Array<Board['status']>).map(status => (
            <button type="button" key={status} aria-pressed={board.status === status} onClick={() => void save({ status })}>
              <span className={'status-dot ' + status} aria-hidden="true" />
              <span>{labels[status]}</span>
              <span className="entity-status-check" aria-hidden="true">{board.status === status ? '✓' : ''}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <button type="button" className="entity-pin-toggle" disabled={saving} onClick={() => void save({ pinned: !board.pinned })}>
        {board.pinned ? 'Unpin board' : 'Pin board'}
      </button>
      <p className="entity-menu-hint">Tags are set in the board's own inspector. Archived boards keep their files and pages.</p>
      {saving && <p className="entity-menu-feedback" role="status">Saving…</p>}
      {error && <p className="entity-menu-error" role="alert">{error}</p>}
    </dialog>, document.body,
  )
}

export default function EntityControls({ entities, onChanged, children }: {
  entities: Board[]
  onChanged: () => Promise<void>
  children: ReactNode
}) {
  const [target, setTarget] = useState<Target | null>(null)
  const entity = entities.find(item => item.id === target?.id)
  function close() {
    setTarget(null)
    if (target?.button.isConnected) target.button.focus({ preventScroll: true })
  }
  return (
    <Controls.Provider value={{ editing: target?.id ?? null, open: (item, button) => setTarget({ id: item.id, button, anchor: button.getBoundingClientRect() }) }}>
      {children}
      {entity && target && <EntityMenu key={entity.id} board={entity} target={target} onClose={close} onChanged={onChanged} />}
    </Controls.Provider>
  )
}
