import { Icon } from './Icons'
import type { DshProcess as DshProcessValue, DshProcessRow, DshProcessTurn } from './types'

// The work behind a harness chat: what it is thinking, and what it is calling.
// While the agent works the newest thinking is open and the tools arrive one by
// one; when the turn ends the whole thing folds away, and the older turns keep
// their own folds.

const toolIcon = (status?: string) => status === 'running' ? 'terminal' : status === 'failed' ? 'bell' : 'history'

function Tool({ row }: { row: DshProcessRow }) {
  return <div className={`dsh-process-tool ${row.status || ''}`}>
    <Icon name={toolIcon(row.status)} size={13} />
    <span className="dsh-process-tool-name">{row.name}</span>
    {row.detail && <span className="dsh-process-tool-detail" title={row.detail}>{row.detail}</span>}
    <small>{row.status}</small>
  </div>
}

// The thinking of one step. The newest one is open: it is the thinking that is
// happening now, and it is the reason this panel exists.
function Thinking({ row, open }: { row: DshProcessRow; open: boolean }) {
  if (open) return <div className="dsh-process-thinking is-open">
    <span className="dsh-process-thinking-label">Thinking</span>
    <p>{row.text}</p>
  </div>
  return <details className="dsh-process-thinking">
    <summary>Thinking</summary>
    <p>{row.text}</p>
  </details>
}

function Rows({ turn }: { turn: DshProcessTurn }) {
  const lastThinking = turn.rows.reduce((found, row, index) => row.kind === 'reasoning' ? index : found, -1)
  return <>
    <div className="dsh-process-rows">{turn.rows.map((row, index) => row.kind === 'reasoning'
      ? <Thinking key={row.id} row={row} open={index === lastThinking} />
      : <Tool key={row.id} row={row} />)}</div>
    {turn.now && <p className="dsh-process-now"><i />{turn.now}</p>}
  </>
}

function Counts({ turn }: { turn: DshProcessTurn }) {
  if (!turn.counts.length) return null
  return <span className="dsh-process-counts">{turn.counts.map(item => `${item.category} ${item.count}`).join(' · ')}</span>
}

export default function DshProcess({ process, working }: { process: DshProcessValue; working: boolean }) {
  const turns = process?.turns || []
  if (!turns.length) return null
  return <div className="dsh-process">
    {turns.map((turn, index) => {
      const live = index === 0 && turn.status === 'working' && working
      if (live) return <div key={turn.turn} className="dsh-process-turn is-live">
        <header><span className="dsh-process-label">Working</span><span className="dsh-process-live"><i />working</span><Counts turn={turn} /></header>
        <Rows turn={turn} />
      </div>
      return <details key={turn.turn} className="dsh-process-turn">
        <summary><span className="dsh-process-label">Process</span><Counts turn={turn} /></summary>
        <Rows turn={turn} />
      </details>
    })}
  </div>
}
