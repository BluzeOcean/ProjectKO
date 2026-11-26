import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { boardTagLabel, boardTagLabels } from '../lib/categories'
import { createBoard } from '../lib/workspace'
import { boardHash } from '../lib/route'
import '../styles/editable-cards.css'

function Dialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { const node = dialog.current; node?.showModal(); return () => node?.close() }, [])

  const toggle = (tag: string) => setTags(value => value.includes(tag) ? value.filter(item => item !== tag) : [...value, tag])

  async function create() {
    if (busy || !title.trim()) return
    setBusy(true); setError('')
    try {
      const board = await createBoard({ title, description, tags })
      location.hash = boardHash(board.id)
      onClose()
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); setBusy(false) }
  }

  return createPortal(<dialog ref={dialog} className="new-card-dialog" aria-label="New board" onCancel={event => { event.preventDefault(); if (!busy) onClose() }} onKeyDown={event => event.stopPropagation()}><form onSubmit={event => { event.preventDefault(); void create() }}>
    <div className="new-card-heading">
      <div>
        <span>New board</span>
        <h2>A place for your next project.</h2>
        <p className="new-card-sub">A board is born empty. Its pages are the topics inside it - make the first one on the board's own screen.</p>
      </div>
      <button type="button" aria-label="Close new board" disabled={busy} onClick={onClose}>×</button>
    </div>

    <label className="new-card-field">
      <span className="new-card-label">Board title</span>
      <input autoFocus required maxLength={200} placeholder="IronPath, Arachne, a tool survey…" value={title} disabled={busy} onChange={event => setTitle(event.target.value)} />
    </label>

    <label className="new-card-field">
      <span className="new-card-label">What is this board for?<em>becomes the board's description</em></span>
      <textarea rows={2} maxLength={240} placeholder="One line the deck shows under the title." value={description} disabled={busy} onChange={event => setDescription(event.target.value)} />
    </label>

    <div className="new-card-legend">Tags <em>the words the deck filters by</em></div>
    <div className="new-card-chips" role="group" aria-label="Tags">
      {Object.keys(boardTagLabels).map(value => <button key={value} type="button" aria-pressed={tags.includes(value)} className={tags.includes(value) ? 'on' : ''} disabled={busy} onClick={() => toggle(value)}>{boardTagLabel(value)}</button>)}
    </div>

    {error && <p className="card-error" role="alert">{error}</p>}
    <footer><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" className="card-primary" disabled={busy || !title.trim()}>{busy ? 'Creating…' : 'Create board'}</button></footer>
  </form></dialog>, document.body)
}

export default function NewBoard({ label = '+ New board', className = '' }: { label?: string; className?: string }) {
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  return <><button ref={button} className={'new-card-button ' + className} onClick={() => setOpen(true)}>{label}</button>{open && <Dialog onClose={() => { setOpen(false); button.current?.focus() }} />}</>
}
