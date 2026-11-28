import { Icon } from './Icons'
import type { DshProcess as DshProcessValue, DshProcessRow, DshProcessTurn } from './types'

// The work behind a harness chat: what it is thinking, and what it is calling.
//
// The harness's own chat puts the live detail on the last line and folds the
// work away above it. This does the same: the rows sit in the box, the thinking
// folds down to one line that says what the step was thinking about, and the
// last line always says whether the turn is running or done.

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

// The thinking of one step. It folds to a single line that says what the step
// was thinking about; opened, it is the whole of it, unabridged.
function Thinking({ row }: { row: DshProcessRow }) {
  return <details className="dsh-process-thinking">
    <summary><Icon name="chevron" size={11} /><span className="dsh-process-thinking-label">Thinking</span>{row.preview && <span className="dsh-process-preview">{row.preview}</span>}</summary>
    <p>{row.text}</p>
  </details>
}

function Rows({ turn }: { turn: DshProcessTurn }) {
  return <div className="dsh-process-rows">{turn.rows.map(row => row.kind === 'reasoning'
    ? <Thinking key={row.id} row={row} />
    : <Tool key={row.id} row={row} />)}</div>
}

// The last line of the box: what is happening now, and whether it is running
// or done. It stays in sight while the work above it is read.
function Status({ turn }: { turn: DshProcessTurn }) {
  if (turn.status === 'done') return <p className="dsh-process-status done"><b>✓</b> Done</p>
  return <p className="dsh-process-status working"><i />{turn.now || 'thinking'}</p>
}

function Counts({ turn }: { turn: DshProcessTurn }) {
  if (!turn.counts.length) return null
  return <span className="dsh-process-counts">{turn.counts.map(item => `${item.category} ${item.count}`).join(' · ')}</span>
}

function Head({ turn, chevron }: { turn: DshProcessTurn; chevron?: boolean }) {
  return <span className="dsh-process-head">
    {chevron && <Icon name="chevron" size={12} />}
    <span className="dsh-process-label">Process</span>
    <Counts turn={turn} />
  </span>
}

export default function DshProcess({ process, working }: { process: DshProcessValue; working: boolean }) {
  const turns = process?.turns || []
  if (!turns.length) return null
  return <div className="dsh-process">
    {turns.map((turn, index) => {
      const live = index === 0 && turn.status === 'working' && working
      if (live) return <div key={turn.turn} className="dsh-process-turn is-live">
        <Head turn={turn} />
        <Rows turn={turn} />
        <Status turn={turn} />
      </div>
      return <details key={turn.turn} className="dsh-process-turn">
        <summary><Head turn={turn} chevron /></summary>
        <Rows turn={turn} />
        <Status turn={turn} />
      </details>
    })}
  </div>
}
