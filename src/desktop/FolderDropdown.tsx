import { useEffect, useMemo, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { api, reportError } from './client'
import type { RecentProject } from './types'
import { Icon } from './Icons'
import { projectName } from './chatOrder'
import { isWindows } from './platform'
import { useFloating } from './floating'

const sameFolder = (a: string, b: string) => {
  const clean = (value: string) => value.trim().replace(/[\\/]+$/, '').replace(/\//g, isWindows ? '\\' : '/')
  return isWindows ? clean(a).toLowerCase() === clean(b).toLowerCase() : clean(a) === clean(b)
}
const sourceLabel = (project: RecentProject) => project.sources.includes('workspace') ? 'Project KO' : project.sources.includes('claude') ? 'Claude Code' : project.sources.includes('codex') ? 'Codex' : 'Project KO'

/**
 * The folder a new chat works in. The chip opens a floating popover instead
 * of a panel inside the form: the dialog keeps its size, and the list of
 * folders can be as long as it needs to be. Pinned folders come first, then
 * the recent ones, each on a single line. A free-text path at the foot takes
 * any folder that is not listed.
 */
export default function FolderDropdown({ cwd, onChange }: { cwd: string; onChange: (path: string) => void }) {
  const [open, setOpen] = useState(false)
  const [projects, setProjects] = useState<RecentProject[] | null>(null)
  const [query, setQuery] = useState('')
  const { wrap, control, list } = useFloating<HTMLButtonElement, HTMLDivElement>(open, () => setOpen(false))
  useEffect(() => { let alive = true; api<RecentProject[]>('/recent-projects').then(value => { if (alive) setProjects(value) }).catch(() => { if (alive) setProjects([]) }); return () => { alive = false } }, [])
  const pin = (project: RecentProject) => api<RecentProject[]>('/recent-projects/pin', { path: project.path, pinned: !project.pinned }).then(setProjects).catch(reportError)
  const needle = query.trim().toLowerCase()
  const groups = useMemo(() => {
    const shown = (projects || []).filter(item => !needle || `${item.name} ${item.path}`.toLowerCase().includes(needle))
    return [
      { label: 'Pinned', items: shown.filter(item => item.pinned) },
      { label: 'Recent', items: shown.filter(item => !item.pinned) },
    ].filter(group => group.items.length)
  }, [projects, needle])
  const choose = (path: string) => { onChange(path); setQuery(''); setOpen(false); control.current?.focus() }
  function keydown(event: KeyboardEvent<HTMLDivElement>) {
    // Escape closes the popover first; the panel keeps its own Escape handling.
    if (event.key !== 'Escape' || !open) return
    event.stopPropagation()
    setOpen(false)
    control.current?.focus()
  }
  return <div className="where-wrap" ref={wrap} onKeyDown={keydown}>
    <button type="button" className="where" ref={control} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(shut => !shut)}>
      <Icon name="folder" size={15} />
      <span className="where-text"><strong>{projectName(cwd)}</strong><small>{cwd}</small></span>
      <span className="as-caret"><Icon name="down" size={13} /></span>
    </button>
    <div className="folder-menu" ref={list} hidden={!open}>
      {(projects?.length || 0) > 6 && <div className="folder-search"><Icon name="search" size={13} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Find a project…" aria-label="Find a project" /></div>}
      <div className="folder-list" role="listbox" aria-label="Working folder">
        {groups.map(group => <div className="menu-group" role="group" aria-label={group.label} key={group.label}>
          <div className="group-label">{group.label}</div>
          {group.items.map(item => { const selected = sameFolder(item.path, cwd); return <div role="presentation" key={item.path} className={`folder-row ${selected ? 'selected' : ''}`}>
            <button type="button" role="option" aria-selected={selected} className="folder-choice" title={item.path} onClick={() => choose(item.path)}>
              <span className="folder-mark"><Icon name="folder" size={16} /></span>
              <span className="opt-text"><span className="opt-name">{item.name}</span><span className="opt-inline">{item.path}</span></span>
              <span className="opt-tag">{sourceLabel(item)}</span>
              {selected ? <span className="opt-check">✓</span> : null}
            </button>
            {!item.sources.includes('workspace') && <button type="button" className={`desk-icon folder-pin ${item.pinned ? 'active' : ''}`} aria-pressed={item.pinned} aria-label={`${item.pinned ? 'Unpin' : 'Pin'} ${item.name}`} title={item.pinned ? 'Unpin project' : 'Pin to the top'} onClick={() => void pin(item)}><Icon name="pin" size={13} /></button>}
          </div> })}
        </div>)}
        {!projects && <p className="desk-muted">Loading projects…</p>}
        {projects && !groups.length && <p className="desk-muted">{needle ? 'No matching projects.' : 'Folders you open in Claude Code or here will be listed.'}</p>}
      </div>
      <div className="folder-foot">
        <span>Working folder</span>
        <input value={cwd} onChange={event => onChange(event.target.value)} spellCheck={false} aria-label="Working folder path" />
      </div>
    </div>
  </div>
}
