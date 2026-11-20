import { useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import type { AgentId, AgentInfo } from './types'
import { AgentLogo, Icon } from './Icons'
import { agentAccount } from './agentMeta'
import { useFloating } from './floating'

/**
 * The agent picker for a new chat. The roster floats over the panel instead of
 * pushing it down, and it keeps one line per agent so it covers as little of
 * the form as possible. Every agent stays selectable: a CLI that is not
 * installed is tagged, not greyed out, because installing it is a step you
 * take, not a reason to hide the choice.
 */
export default function AgentDropdown({ agents, value, onChange, recent }: {
  agents: AgentInfo[]
  value: AgentId
  onChange: (id: AgentId) => void
  recent: Partial<Record<AgentId, string>>
}) {
  const [open, setOpen] = useState(false)
  const rows = useRef<(HTMLButtonElement | null)[]>([])
  const current = agents.find(item => item.id === value) || agents[0]
  const used = useMemo(() => Object.keys(recent) as AgentId[], [recent])
  const groups = useMemo(() => [
    { label: 'Recent', items: used.map(id => agents.find(item => item.id === id)).filter((item): item is AgentInfo => !!item) },
    { label: 'Available', items: agents.filter(item => item.available && !used.includes(item.id)) },
    { label: 'Not installed', items: agents.filter(item => !item.available && !used.includes(item.id)) },
  ].filter(group => group.items.length), [agents, used])
  const flat = useMemo(() => groups.flatMap(group => group.items), [groups])
  const rowIndex = useMemo(() => new Map(flat.map((item, index) => [item.id, index])), [flat])

  // The roster is placed against the control with fixed coordinates, so it
  // floats over the form and the panel underneath never changes size.
  const { wrap, control, list } = useFloating<HTMLButtonElement, HTMLDivElement>(open, () => setOpen(false))

  function keydown(event: KeyboardEvent<HTMLDivElement>) {
    // Escape closes the roster first; the panel keeps its own Escape handling.
    if (event.key === 'Escape') {
      if (!open) return
      event.stopPropagation()
      setOpen(false)
      control.current?.focus()
      return
    }
    if (!open || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) return
    event.preventDefault()
    const at = rows.current.findIndex(node => node === document.activeElement)
    const next = event.key === 'ArrowDown' ? at + 1 : at - 1
    rows.current[(next + flat.length) % flat.length]?.focus()
  }

  if (!current) return null
  return <div className="agent-wrap" ref={wrap} onKeyDown={keydown}>
    <button type="button" className="agent-select" ref={control} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(shut => !shut)} style={{ '--agent-color': current.color } as CSSProperties}>
      <span className="agent-mark"><AgentLogo agent={current.id} size={22} /></span>
      <span className="as-text"><span className="as-name">{current.label}</span><span className="as-note">{agentAccount(current)}</span></span>
      <span className="as-caret"><Icon name="down" size={13} /></span>
    </button>
    <div className="agent-menu" ref={list} role="listbox" aria-label="Agent" hidden={!open}>
      {groups.map(group => <div className="menu-group" role="group" aria-label={group.label} key={group.label}>
        <div className="group-label">{group.label}</div>
        {group.items.map(item => {
          const selected = item.id === value
          const when = recent[item.id]
          return <button key={item.id} type="button" role="option" aria-selected={selected} data-agent={item.id} className={`agent-option ${selected ? 'selected' : ''} ${item.available ? '' : 'missing'}`} style={{ '--agent-color': item.color } as CSSProperties} ref={node => { rows.current[rowIndex.get(item.id) ?? 0] = node }} onClick={() => { onChange(item.id); setOpen(false); control.current?.focus() }}>
            <span className="agent-mark"><AgentLogo agent={item.id} size={19} /></span>
            <span className="opt-text">
              <span className="opt-name">{item.label}</span>
              <span className="opt-inline">{agentAccount(item)}</span>
            </span>
            {when ? <span className="opt-when">{when}</span> : null}
            {item.available ? null : <span className="opt-tag">Install</span>}
            {selected ? <span className="opt-check">✓</span> : null}
          </button>
        })}
      </div>)}
    </div>
  </div>
}
