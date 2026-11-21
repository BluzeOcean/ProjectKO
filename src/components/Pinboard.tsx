import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { api, onServiceEvent, uploadCardImage } from '../desktop/client'
import type { CardDocument, CardItem } from '../../desktop/service/card-schema.mjs'

/**
 * The Pinboard: the third view.
 *
 * A wall of the board's entries as thumbnails. Choosing one opens the
 * picture large, with a pen over it, the feedback beside it, and the
 * hand-off at the bottom right.
 *
 * The choice is one explicit click and it is stored by the service, so an
 * agent can pull it later. Nothing here watches the user: no hover, no
 * pointer position, no polling of the screen.
 */

interface Stroke { color: string; width: number; points: [number, number][] }

/** The pen's colours. One of them is ink, for the pale half of a picture. */
const PEN_COLORS = [
  { id: 'pink', label: 'Pink', token: '--pink', fallback: '#efa2b4' },
  { id: 'amber', label: 'Amber', token: '--amber', fallback: '#d6b573' },
  { id: 'blue', label: 'Blue', token: '--blue', fallback: '#91b7df' },
  { id: 'ink', label: 'Ink', token: '--bg', fallback: '#101115' },
]

const colorValue = (token: string, fallback: string) => {
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim()
  return value || fallback
}

const fileName = (item: CardItem) => (item.image ? item.image.split('/').pop() || item.image : '')

export default function Pinboard({ card, baseUrl, board, onFeedback, onSave }: {
  card: CardDocument
  baseUrl: string
  board?: { entityId: string; step: number }
  onFeedback?: (entryId: string, text: string) => void
  onSave?: (document: CardDocument) => Promise<boolean>
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const frame = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const strokes = useRef<Stroke[]>([])
  const drawing = useRef(false)
  const [chosen, setChosen] = useState<string | null>(null)
  const [marked, setMarked] = useState(false)
  const [tool, setTool] = useState<'pen' | 'erase'>('pen')
  const [color, setColor] = useState(PEN_COLORS[0].id)
  const [feedback, setFeedback] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  const entry = card.items.find(item => item.id === chosen) || null
  const index = card.items.findIndex(item => item.id === chosen)
  const picture = entry?.image ? new URL(entry.image, baseUrl).href : ''

  /* The choice lives in the service, so the wall shows what the service
     holds, not what this window remembers. */
  const boardId = board?.entityId, boardStep = board?.step
  useEffect(() => {
    if (!boardId) return
    let current = true
    api<{ selection: { boardId: string; step: number; entryId: string } | null }>('/workspace/selection')
      .then(value => { if (current && value.selection && value.selection.boardId === boardId && value.selection.step === boardStep) setChosen(value.selection.entryId) })
      .catch(() => { /* The service is not answering; the wall still works. */ })
    const off = onServiceEvent(event => {
      if (event.type !== 'board-selection' || !current) return
      const value = event.selection
      if (value && value.boardId === boardId && value.step === boardStep) setChosen(value.entryId)
      else if (!value) setChosen(null)
    })
    return () => { current = false; off() }
  }, [boardId, boardStep])

  /* The canvas sits over the picture itself, so a stroke never lands
     beside it. */
  const fit = useCallback(function fit() {
    const element = canvas.current, box = frame.current
    if (!element || !box) return
    const image = box.querySelector('img')
    // A picture that is still arriving will say when it is ready.
    if (image && !image.complete) { image.addEventListener('load', () => fit(), { once: true }); return }
    const frameRect = box.getBoundingClientRect()
    if (!frameRect.width || !frameRect.height) return
    // The canvas is placed from the frame's inner edge, so the border is
    // not part of the picture's own box.
    const style = getComputedStyle(box)
    const originLeft = frameRect.left + parseFloat(style.borderLeftWidth || '0')
    const originTop = frameRect.top + parseFloat(style.borderTopWidth || '0')
    let area = { left: 0, top: 0, width: frameRect.width, height: frameRect.height }
    if (image && image.naturalWidth && image.naturalHeight) {
      const rect = image.getBoundingClientRect()
      const scale = Math.min(rect.width / image.naturalWidth, rect.height / image.naturalHeight)
      const width = image.naturalWidth * scale, height = image.naturalHeight * scale
      area = {
        left: (rect.left - originLeft) + (rect.width - width) / 2,
        top: (rect.top - originTop) + (rect.height - height) / 2,
        width, height,
      }
    }
    const ratio = window.devicePixelRatio || 1
    element.style.left = `${area.left}px`
    element.style.top = `${area.top}px`
    element.style.width = `${area.width}px`
    element.style.height = `${area.height}px`
    element.width = Math.max(1, Math.round(area.width * ratio))
    element.height = Math.max(1, Math.round(area.height * ratio))
    const context = element.getContext('2d')
    if (!context) return
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.clearRect(0, 0, element.width, element.height)
    strokes.current.forEach(stroke => {
      context.lineCap = 'round'
      context.lineJoin = 'round'
      context.lineWidth = stroke.width
      context.strokeStyle = stroke.color
      context.beginPath()
      stroke.points.forEach(([x, y], point) => point ? context.lineTo(x, y) : context.moveTo(x, y))
      if (stroke.points.length === 1) context.lineTo(stroke.points[0][0] + 0.1, stroke.points[0][1])
      context.stroke()
    })
  }, [])

  useEffect(() => {
    const element = frame.current
    if (!element) return
    const observer = new ResizeObserver(() => fit())
    observer.observe(element)
    window.addEventListener('resize', fit)
    return () => { observer.disconnect(); window.removeEventListener('resize', fit) }
  }, [fit])

  const point = (event: PointerEvent<HTMLCanvasElement>) => {
    const rect = canvas.current!.getBoundingClientRect()
    return [event.clientX - rect.left, event.clientY - rect.top] as [number, number]
  }

  function erase(at: [number, number]) {
    const next = strokes.current.filter(stroke => !stroke.points.some(([x, y]) => Math.hypot(x - at[0], y - at[1]) < 16))
    if (next.length === strokes.current.length) return
    strokes.current = next
    setMarked(next.length > 0)
    fit()
  }

  function down(event: PointerEvent<HTMLCanvasElement>) {
    if (!entry) return
    event.preventDefault()
    const at = point(event)
    if (tool === 'erase') { erase(at); return }
    drawing.current = true
    try { canvas.current?.setPointerCapture(event.pointerId) } catch { /* The pen is already lifted. */ }
    const chosenColor = PEN_COLORS.find(item => item.id === color) || PEN_COLORS[0]
    strokes.current = [...strokes.current, { color: colorValue(chosenColor.token, chosenColor.fallback), width: 3, points: [at] }]
    fit()
  }

  function move(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return
    const at = point(event)
    const next = strokes.current.slice()
    next[next.length - 1] = { ...next[next.length - 1], points: [...next[next.length - 1].points, at] }
    strokes.current = next
    fit()
  }

  function up() {
    if (!drawing.current) return
    drawing.current = false
    setMarked(true)
  }

  function choose(item: CardItem) {
    setChosen(item.id)
    setFeedback(item.feedback || '')
    setStatus('')
    strokes.current = []
    setMarked(false)
    setTool('pen')
    setColor(PEN_COLORS[0].id)
    if (board) api('/workspace/selection', { entityId: board.entityId, step: board.step, entryId: item.id }).catch(() => { /* The choice is still shown here. */ })
    if (!dialog.current) return
    if (!dialog.current.open) dialog.current.showModal()
    requestAnimationFrame(() => fit())
  }

  /** The picture as it is drawn, at its own size, for the agent. */
  async function compose(): Promise<Blob | null> {
    const element = canvas.current
    if (!element || !entry?.image) return null
    const response = await fetch(picture)
    if (!response.ok) return null
    const bitmap = await createImageBitmap(await response.blob())
    const composed = document.createElement('canvas')
    composed.width = bitmap.width
    composed.height = bitmap.height
    const context = composed.getContext('2d')
    if (!context) return null
    context.drawImage(bitmap, 0, 0)
    const box = element.getBoundingClientRect()
    const scaleX = bitmap.width / box.width, scaleY = bitmap.height / box.height
    strokes.current.forEach(stroke => {
      context.lineCap = 'round'
      context.lineJoin = 'round'
      context.lineWidth = stroke.width * scaleX
      context.strokeStyle = stroke.color
      context.beginPath()
      stroke.points.forEach(([x, y], point) => point ? context.lineTo(x * scaleX, y * scaleY) : context.moveTo(x * scaleX, y * scaleY))
      context.stroke()
    })
    return new Promise(resolve => composed.toBlob(resolve, 'image/png'))
  }

  /**
   * The hand-off. The marked picture and the feedback are written into the
   * card first, so what the agent reads is what the user sees.
   */
  async function send() {
    if (!entry || !board || busy) return
    setBusy(true)
    setStatus('')
    try {
      let marked = entry.annotation || ''
      if (strokes.current.length && entry.image) {
        const blob = await compose()
        if (!blob) throw new Error('The marked picture could not be made.')
        const uploaded = await uploadCardImage(board.entityId, board.step, new File([blob], `${entry.id}-marked.png`, { type: 'image/png' }))
        marked = uploaded.image
      }
      const next: CardDocument = { ...card, items: card.items.map(item => item.id === entry.id ? { ...item, feedback, ...(marked ? { annotation: marked } : {}) } : item) }
      if (onFeedback) onFeedback(entry.id, feedback)
      if (onSave) {
        const saved = await onSave(next)
        if (!saved) { setStatus('The card could not be saved. Save it, then send.'); setBusy(false); return }
      }
      const result = await api<{ chat: { name: string } }>('/workspace/hand-off', { entityId: board.entityId, step: board.step, entryId: entry.id })
      setStatus(`sent to ${result.chat.name}`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  return <>
    <div className="card-pinboard">
      {card.items.map((item, at) => <figure key={item.id} className={`card-pin${item.feedback ? ' has-note' : ''}${item.id === chosen ? ' on' : ''}`}>
        <button className="card-pin-hit" onClick={() => choose(item)} aria-label={`Open ${item.title}`}>
          <span className="card-pin-image">{item.image ? <img src={new URL(item.image, baseUrl).href} alt={item.alt || item.title} loading="lazy" /> : null}</span>
          <span className="card-pin-caption">
            <span className="card-pin-number">{String(at + 1).padStart(2, '0')}</span>
            <span className="card-pin-file">{fileName(item) || item.title}</span>
            {item.feedback ? <span className="card-pin-dot" title="Has feedback" /> : null}
          </span>
        </button>
      </figure>)}
    </div>

    <dialog ref={dialog} className="card-pinboard-dialog" onCancel={event => { event.preventDefault(); dialog.current?.close() }}>
      <header className="card-pinboard-head">
        <span className="card-pinboard-number">{String(index + 1).padStart(2, '0')}</span>
        <span className="card-pinboard-file">{entry ? fileName(entry) : ''}</span>
        <span className="card-pinboard-title">{entry?.title}</span>
        <button className="card-pinboard-close" aria-label="Close" onClick={() => dialog.current?.close()}>×</button>
      </header>
      <div className="card-pinboard-body">
        <div className="card-stage" ref={frame}>
          {picture ? <img src={picture} alt={entry?.alt || entry?.title || ''} onLoad={fit} /> : <p className="card-stage-empty">This entry has no picture.</p>}
          <canvas
            ref={canvas}
            className="card-stage-canvas"
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
          />
        </div>
        <aside className="card-side">
          {onSave ? <>
            <div className="card-pen">
              <button className={`card-pen-tool${tool === 'pen' ? ' on' : ''}`} onClick={() => setTool('pen')}>Pen</button>
              <button className={`card-pen-tool${tool === 'erase' ? ' on' : ''}`} onClick={() => setTool('erase')}>Eraser</button>
              <button className="card-pen-tool" onClick={() => { strokes.current = strokes.current.slice(0, -1); setMarked(strokes.current.length > 0); fit() }}>Undo</button>
              <button className="card-pen-tool" onClick={() => { strokes.current = []; setMarked(false); fit() }}>Clear</button>
            </div>
            <div className="card-pen-colors" role="group" aria-label="Pen colour">
              {PEN_COLORS.map(item => <button key={item.id} className={`card-pen-color${item.id === color ? ' on' : ''}`} style={{ '--swatch': `var(${item.token})` } as CSSProperties} aria-pressed={item.id === color} title={item.label} onClick={() => setColor(item.id)}><span /></button>)}
            </div>
            <label className="card-feedback-field">
              <span>Feedback <em>the agent reads this word for word</em></span>
              <textarea className="card-feedback-text" value={feedback} placeholder="What to change, and why." onChange={event => { setFeedback(event.target.value); onFeedback?.(entry?.id || '', event.target.value); setStatus(event.target.value.trim() ? 'feedback saved' : '') }} />
            </label>
            <details className="card-gets">
              <summary>What the agent gets</summary>
              <ul className="card-gets-list">
                <li><b>{entry ? fileName(entry) : '—'}</b><span>the picture{marked ? ', as you drew it' : ''}</span></li>
                <li><b>Feedback</b><span>your note, word for word</span></li>
              </ul>
            </details>
          </> : <details className="card-gets">
            <summary>What the agent gets</summary>
            <ul className="card-gets-list">
              <li><b>{entry ? fileName(entry) : '—'}</b><span>the picture</span></li>
              <li><b>Feedback</b><span>{entry?.feedback || 'none yet'}</span></li>
            </ul>
          </details>}
        </aside>
      </div>
      {onSave && <footer className="card-pinboard-foot">
        <span className="card-pinboard-status">{status}</span>
        <button className="card-send" disabled={busy || !entry} onClick={() => void send()}>{busy ? 'Sending…' : "Send to the board's agent"}</button>
      </footer>}
    </dialog>
  </>
}
