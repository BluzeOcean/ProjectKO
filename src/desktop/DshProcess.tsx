import { useState } from 'react'
import { Icon } from './Icons'
import type { DshProcessRow, DshProcessTurn } from './types'

// The work behind a harness chat: what it is thinking, and what it is calling.
//
// It is a hamburger: a bar on top, a bar at the foot, and the work between
// them. Clicking either bar folds the whole thing into one row. Both bars
// carry the status, so the fold is never a blank - the reader can always see
// whether the turn is running or done, and what it has spent.

const tokens = (value: number) => value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}M` : value >= 1000 ? `${(value / 1000).toFixed(1)}K` : String(value)

const duration = (ms: number) => {
  if (ms <= 0) return ''
  if (ms >= 60000) return `${Math.floor(ms / 60000)}m ${String(Math.round((ms % 60000) / 1000)).padStart(2, '0')}s`
  return `${Math.max(1, Math.round(ms / 1000))}s`
}

// The tool's state, in the icons the chat already uses for a tool's state.
const toolIcon = (status?: string) => status === 'running' ? 'terminal' : status === 'failed' ? 'bell' : 'history'

function Tool({ row }: { row: DshProcessRow }) {
  return <div className={`dsh-process-tool ${row.status || ''}`}>
    <Icon name={toolIcon(row.status)} size={13} />
    <span className="dsh-process-tool-name">{row.name}</span>
    {row.detail && <span className="dsh-process-tool-detail" title={row.detail}>{row.detail}</span>}
    <small>{row.status}</small>
  </div>
}

function Body({ block }: { block: DshProcessTurn }) {
  return <div className="dsh-process-body">{block.rows.map(row => row.kind === 'reasoning'
    ? <div key={row.id} className="dsh-process-thinking">
        <span className="dsh-process-thinking-label">Step {row.step}</span>
        <p>{row.text}</p>
      </div>
    : <Tool key={row.id} row={row} />)}</div>
}

export default function DshProcess({ block }: { block: DshProcessTurn }) {
  // A turn that is working opens itself: that is the one the reader is
  // watching. A finished turn folds away, and the reader opens it if they
  // want the work behind the answer.
  const [open, setOpen] = useState(block.status === 'working')
  const toggle = () => setOpen(value => !value)
  const live = block.status === 'working'
  const spent = tokens(block.tokens)
  const took = duration(block.duration)
  return <div className={`dsh-process ${live ? 'is-live' : ''}`}>
    <button type="button" className="dsh-process-bar top" onClick={toggle} aria-expanded={open}>
      <Icon name="chevron" size={12} />
      <span className="dsh-process-label">Process</span>
      {!!block.counts.length && <span className="dsh-process-counts">{block.counts.map(item => `${item.category} ${item.count}`).join(' · ')}</span>}
      <span className={`dsh-process-state ${live ? 'running' : 'done'}`}>{live ? <i /> : <b>✓</b>} {live ? 'running' : 'done'}{block.tokens > 0 && ` · ${spent} tok`}</span>
    </button>
    {open && <>
      <Body block={block} />
      <button type="button" className="dsh-process-bar bottom" onClick={toggle} aria-expanded={open}>
        <span className="dsh-process-state-text">
          {live ? 'running' : 'done'}{block.tokens > 0 && ` · ${spent} tok`}{took && ` · ${took}`}{block.steps > 0 && ` · ${block.steps} step${block.steps === 1 ? '' : 's'}`}
        </span>
        {block.now && <span className="dsh-process-now">{block.now}</span>}
      </button>
    </>}
  </div>
}
