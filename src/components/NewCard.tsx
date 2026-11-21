import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../desktop/client'
import { entityHash } from '../lib/route'
import { categoryLabel } from '../lib/categories'
import type { WorkspaceEntity } from '../types'
import type { BoardCategory, CardTemplate } from '../../desktop/service/card-schema.mjs'
import { boardCategories, cardTemplateLabels, cardTemplates, folderSlug, localDay } from '../../desktop/service/card-schema.mjs'
import '../styles/editable-cards.css'

function NewCardDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [title, setTitle] = useState('')
  const [purpose, setPurpose] = useState('')
  const [category, setCategory] = useState<BoardCategory>('project')
  const [template, setTemplate] = useState<CardTemplate>('gallery')
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  useEffect(() => { const node = dialog.current; node?.showModal(); return () => node?.close() }, [])

  /* What this board will be, before it is. The folder is the one the service
     will write: the day, the slug of the title, and the short id it adds to
     keep the name unique. Before there is a title there is no slug to show. */
  const name = title.trim() || 'Untitled board'
  const folder = `${localDay()}_${title.trim() ? `${folderSlug(title, template)}-` : ''}…`
  const view = cardTemplateLabels[template]

  async function create() {
    if (busy || !title.trim()) return
    setBusy(true); setError('')
    try {
      const { entity } = await api<{ entity: WorkspaceEntity }>('/workspace/cards', { title, description: purpose, category, template })
      window.dispatchEvent(new Event('mrmak-workspace-changed')); location.hash = entityHash(entity.id)
      onClose()
    } catch (error) { setError(error instanceof Error ? error.message : String(error)); setBusy(false) }
  }

  return createPortal(<dialog ref={dialog} className="new-card-dialog" aria-label="New board" onCancel={event => { event.preventDefault(); if (!busy) onClose() }} onKeyDown={event => event.stopPropagation()}><form onSubmit={event => { event.preventDefault(); void create() }}>
    <div className="new-card-heading">
      <div>
        <span>New board</span>
        <h2>A place for your next idea.</h2>
        <p className="new-card-sub">Tags are how the deck finds a board. Pick one now and the board shows up under that filter straight away.</p>
      </div>
      <button type="button" aria-label="Close new board" disabled={busy} onClick={onClose}>×</button>
    </div>

    <label className="new-card-field">
      <span className="new-card-label">Board title</span>
      <input autoFocus required maxLength={200} placeholder="Character references, tool research…" value={title} disabled={busy} onChange={event => setTitle(event.target.value)} />
    </label>

    <label className="new-card-field">
      <span className="new-card-label">What is this board for?<em>becomes the board’s description</em></span>
      <textarea rows={2} maxLength={240} placeholder="What this board is for." value={purpose} disabled={busy} onChange={event => setPurpose(event.target.value)} />
    </label>

    <div className="new-card-legend">Tags <em>the same words the deck filters by</em></div>
    <div className="new-card-seg" role="group" aria-label="Tags">
      {boardCategories.map(value => <button key={value} type="button" aria-pressed={category === value} className={category === value ? 'on' : ''} disabled={busy} onClick={() => setCategory(value)}>{categoryLabel(value)}</button>)}
    </div>

    <div className="new-card-legend">Starting view <em>how the card’s entries are laid out</em></div>
    <div className="new-card-chips" role="group" aria-label="Starting view">
      {cardTemplates.map(value => <button key={value} type="button" aria-pressed={template === value} className={template === value ? 'on' : ''} disabled={busy} onClick={() => setTemplate(value)}>{cardTemplateLabels[value]}</button>)}
    </div>

    <section className="new-card-strip">
      <div className="new-card-strip-label">What this board brings</div>
      <div className="new-card-strip-line">
        <b>{name}</b><i>·</i>{categoryLabel(category)}<i>·</i>{view}<i>·</i><code>{folder}</code>
      </div>
    </section>

    {error && <p className="card-error" role="alert">{error}</p>}
    <footer><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" className="card-primary" disabled={busy || !title.trim()}>{busy ? 'Creating…' : 'Create board'}</button></footer>
  </form></dialog>, document.body)
}

export default function NewCard({ label = '+ New board', className = '' }: { label?: string; className?: string }) {
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  return <><button ref={button} className={`new-card-button ${className}`.trim()} onClick={() => setOpen(true)}>{label}</button>{open && <NewCardDialog onClose={() => { setOpen(false); button.current?.focus() }} />}</>
}
