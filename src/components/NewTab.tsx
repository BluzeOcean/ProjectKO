import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { createTab } from '../lib/workspace'
import { tabHash } from '../lib/route'
import { layoutLabels, layoutNotes, tabLayouts } from '../../desktop/service/vault-schema.mjs'
import '../styles/editable-cards.css'

function Dialog({ boardId, pageId, onClose }: { boardId: string; pageId: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [name, setName] = useState('')
  const [layout, setLayout] = useState('gallery')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { const node = dialog.current; node?.showModal(); return () => node?.close() }, [])

  async function create() {
    if (busy || !name.trim()) return
    setBusy(true); setError('')
    try {
      const tab = await createTab(boardId, pageId, { name, layout })
      location.hash = tabHash(boardId, pageId, tab.id)
      onClose()
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); setBusy(false) }
  }

  return createPortal(<dialog ref={dialog} className="new-card-dialog" aria-label="New tab" onCancel={event => { event.preventDefault(); if (!busy) onClose() }} onKeyDown={event => event.stopPropagation()}><form onSubmit={event => { event.preventDefault(); void create() }}>
    <div className="new-card-heading">
      <div>
        <span>New tab</span>
        <h2>Another view of this page.</h2>
        <p className="new-card-sub">A tab is a document of headings and cards. A page with one tab hides the strip; two tabs put it back.</p>
      </div>
      <button type="button" aria-label="Close new tab" disabled={busy} onClick={onClose}>×</button>
    </div>

    <label className="new-card-field">
      <span className="new-card-label">Tab name</span>
      <input autoFocus required maxLength={120} placeholder="Concepts, Studio Board, Notes…" value={name} disabled={busy} onChange={event => setName(event.target.value)} />
    </label>

    <div className="new-card-legend">Layout <em>how its cards are drawn</em></div>
    <div className="new-card-chips" role="group" aria-label="Layout">
      {tabLayouts.map(value => <button key={value} type="button" aria-pressed={layout === value} className={layout === value ? 'on' : ''} disabled={busy} onClick={() => setLayout(value)} title={layoutNotes[value]}>{layoutLabels[value]}</button>)}
    </div>

    {error && <p className="card-error" role="alert">{error}</p>}
    <footer><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" className="card-primary" disabled={busy || !name.trim()}>{busy ? 'Creating…' : 'Create tab'}</button></footer>
  </form></dialog>, document.body)
}

export default function NewTab({ boardId, pageId, label = '+ Tab', className = '' }: { boardId: string; pageId: string; label?: string; className?: string }) {
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  return <><button ref={button} className={className || 'topbar-new-tab'} onClick={() => setOpen(true)}>{label}</button>{open && <Dialog boardId={boardId} pageId={pageId} onClose={() => { setOpen(false); button.current?.focus() }} />}</>
}
