import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Board } from '../types'
import { pageTagLabel, pageTagLabels } from '../lib/categories'
import { createPage, createTab } from '../lib/workspace'
import { pageHash } from '../lib/route'
import { layoutLabels, layoutNotes, tabLayouts } from '../../desktop/service/vault-schema.mjs'
import '../styles/editable-cards.css'

function Dialog({ board, onClose }: { board: Board; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [layout, setLayout] = useState('gallery')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { const node = dialog.current; node?.showModal(); return () => node?.close() }, [])

  const toggle = (tag: string) => setTags(value => value.includes(tag) ? value.filter(item => item !== tag) : [...value, tag])

  async function create() {
    if (busy || !title.trim()) return
    setBusy(true); setError('')
    try {
      const page = await createPage(board.id, { title, description, tags })
      // A page with no tab is a dead end, so the first one opens with it.
      await createTab(board.id, page.id, { name: 'Overview', layout })
      location.hash = pageHash(board.id, page.id)
      onClose()
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); setBusy(false) }
  }

  return createPortal(<dialog ref={dialog} className="new-card-dialog" aria-label="New page" onCancel={event => { event.preventDefault(); if (!busy) onClose() }} onKeyDown={event => event.stopPropagation()}><form onSubmit={event => { event.preventDefault(); void create() }}>
    <div className="new-card-heading">
      <div>
        <span>New page</span>
        <h2>One topic in "{board.title}".</h2>
        <p className="new-card-sub">A page gets its own folder, its own tags and a first tab. Everything on the page lives in that folder.</p>
      </div>
      <button type="button" aria-label="Close new page" disabled={busy} onClick={onClose}>×</button>
    </div>

    <label className="new-card-field">
      <span className="new-card-label">Page title</span>
      <input autoFocus required maxLength={200} placeholder="Game Mechanics, UI, Concept art…" value={title} disabled={busy} onChange={event => setTitle(event.target.value)} />
    </label>

    <label className="new-card-field">
      <span className="new-card-label">What is this page about?<em>becomes the page's description</em></span>
      <textarea rows={2} maxLength={240} placeholder="One line the page grid shows under the title." value={description} disabled={busy} onChange={event => setDescription(event.target.value)} />
    </label>

    <div className="new-card-legend">Tags <em>the words the page grid filters by</em></div>
    <div className="new-card-chips" role="group" aria-label="Page tags">
      {Object.keys(pageTagLabels).map(value => <button key={value} type="button" aria-pressed={tags.includes(value)} className={tags.includes(value) ? 'on' : ''} disabled={busy} onClick={() => toggle(value)}>{pageTagLabel(value)}</button>)}
    </div>

    <div className="new-card-legend">First tab <em>how its cards are laid out - changeable later</em></div>
    <div className="new-card-chips" role="group" aria-label="Starting layout">
      {tabLayouts.map(value => <button key={value} type="button" aria-pressed={layout === value} className={layout === value ? 'on' : ''} disabled={busy} onClick={() => setLayout(value)} title={layoutNotes[value]}>{layoutLabels[value]}</button>)}
    </div>

    {error && <p className="card-error" role="alert">{error}</p>}
    <footer><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" className="card-primary" disabled={busy || !title.trim()}>{busy ? 'Creating…' : 'Create page'}</button></footer>
  </form></dialog>, document.body)
}

export default function NewPage({ board, label = '+ New page', className = '' }: { board: Board; label?: string; className?: string }) {
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  return <><button ref={button} className={'new-card-button ' + className} onClick={() => setOpen(true)}>{label}</button>{open && <Dialog board={board} onClose={() => { setOpen(false); button.current?.focus() }} />}</>
}
