import { useEffect, useState, type ReactNode } from 'react'
import { api, onServiceEvent, useDesktop } from './client'
import type { AgentId, Effort, Settings } from './types'
import { defaultEffort, efforts } from './effort'
import { Icon } from './Icons'
import { DictationRows } from '../components/DictationSettings'
import { useDictation } from './useDictation'
import { ThemeRow } from '../components/ThemePicker'
import { fileManager, isMac, shellName } from './platform'
import { quotaIntervalLabel, quotaIntervalNote, quotaIntervals } from '../lib/quota'
import { themes } from '../../desktop/service/appearance.mjs'

type NativeSettings = { available: boolean; winKey: boolean; label?: string; error?: string }
type ReadAloud = { ready: boolean; label?: string | null }

/* One line of the panel: a name and the thing that changes it. The
   sentence that explains it is a sibling, so the section can choose to show
   it on hover instead of always — which is the whole difference this panel
   makes against the one it replaces. */
type SettingsRow = { key: string; name: string; search?: string; node: ReactNode }

const agents: [AgentId, string][] = [['codex', 'Codex'], ['claude', 'Claude'], ['antigravity', 'Antigravity'], ['opencode', 'OpenCode'], ['kimi', 'Kimi'], ['shell', shellName]]
const themeName = (preference?: string) => preference === 'system' ? 'System' : themes.find(theme => theme.id === preference)?.name || 'Dark'
/* The last segments of a path, joined the way the path was: a fold's summary
   cannot carry the whole of V:\06_App\ProjectKO\workspace and a path cut at
   its end says nothing. */
const pathTail = (path: string, segments: number) => {
  const separator = path.includes('\\') ? '\\' : '/'
  return path.split(/[\\/]/).filter(Boolean).slice(-segments).join(separator)
}
const effortName = (effort?: string) => efforts.find(([value]) => value === effort)?.[1] || 'Extra high'
const agentName = (agent: string) => agents.find(([value]) => value === agent)?.[1] || 'Claude'

/* A fold: the header states what the section holds, and opening it puts the
   controls where the header was, in the panel's one row grammar. Searching
   the panel opens every section that still has a matching row. */
function Section({ id, label, summary, rows, foot, open, query, onToggle }: {
  id: string; label: string; summary: string; rows: SettingsRow[]; foot?: ReactNode
  open: boolean; query: string; onToggle: (id: string) => void
}) {
  const needle = query.trim().toLowerCase()
  const shown = needle ? rows.filter(row => (row.name + ' ' + (row.search || '')).toLowerCase().includes(needle)) : rows
  if (needle && !shown.length) return null
  const expanded = needle.length > 0 || open
  return <section className={'settings-fold' + (expanded ? ' open' : '')} data-settings-section={id}>
    <button type="button" className="settings-fold-head" aria-expanded={expanded} onClick={() => onToggle(id)}>
      <span className="settings-fold-label">{label}</span>
      <span className="settings-fold-end">
        <span className="settings-fold-summary">{summary}</span>
        <span className="settings-fold-chev"><Icon name="down" size={15} /></span>
      </span>
    </button>
    <div className="settings-fold-body">
      {shown.map(row => <div className="settings-item" key={row.key}>{row.node}</div>)}
      {foot && !needle ? foot : null}
    </div>
  </section>
}

export default function WorkspaceSettings({ onClose }: { onClose: () => void }) {
  const dictation = useDictation()
  const { settings, repo } = useDesktop()
  const [native, setNative] = useState<NativeSettings>({ available: false, winKey: false })
  const [speech, setSpeech] = useState<ReadAloud | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  /* Appearance is open because it is the one section whose labels do not say
     what it holds. Everything else states its value in the header. */
  const [open, setOpen] = useState<string[]>(['workspace-directory', 'appearance'])
  const toggle = (id: string) => setOpen(current => current.includes(id) ? current.filter(name => name !== id) : [...current, id])
  useEffect(() => {
    void api<ReadAloud>('/read-aloud').then(setSpeech).catch(() => setSpeech(null))
    const refresh = () => api<NativeSettings>('/native/settings').then(setNative).catch(failure => setError(String(failure.message || failure)))
    void refresh()
    return onServiceEvent(event => { if (event.type === 'native-settings') void refresh() })
  }, [])
  const change = async (patch: Partial<Settings>) => {
    setBusy(true); setError('')
    try { await api('/settings', patch) } catch (error) { setError(String(error instanceof Error ? error.message : error)) }
    finally { setBusy(false) }
  }
  // The boards are the Vault: one folder each, created here. It can sit on
  // another drive, so the path comes from settings rather than the repository.
  const separator = repo.includes('\\') ? '\\' : '/'
  const workspaceDir = settings.vaultPath || repo.replace(/[\\/]+$/, '') + separator + 'workspace'
  const showWorkspaceDir = async () => {
    setError('')
    try { await api('/reveal', { path: workspaceDir }) }
    catch (failure) { setError(String(failure instanceof Error ? failure.message : failure)) }
  }
  // The Vault can be pointed at another folder, on another drive. The service
  // only changes the setting: existing boards stay where they are.
  // The draft is only what has been typed: the panel still reads the folder in
  // force, so a rejected path does not pretend the Vault moved.
  const [vaultDraft, setVaultDraft] = useState<string | null>(null)
  const [vaultError, setVaultError] = useState('')
  const vaultValue = vaultDraft ?? workspaceDir
  // The action only appears once the path differs: the field itself is the value.
  const vaultDirty = vaultValue.trim() !== workspaceDir
  const pickVaultFolder = async () => {
    setBusy(true); setVaultError('')
    try { await api<Settings>('/settings', { vaultPath: vaultValue.trim() }); setVaultDraft(null) }
    catch (failure) { setVaultError(String(failure instanceof Error ? failure.message : failure)) }
    finally { setBusy(false) }
  }
  const winKey = async (enabled: boolean) => {
    setBusy(true); setError('')
    try { setNative(await api<NativeSettings>('/native/settings', { winKey: enabled })) }
    catch (failure) { setError(String(failure instanceof Error ? failure.message : failure)) }
    finally { setBusy(false) }
  }

  const row = (name: string, control: ReactNode, help?: ReactNode, search?: string): SettingsRow => ({
    key: name, name, search,
    node: <>
      <label className="settings-row"><span className="settings-row-name">{name}</span><span className="settings-row-value">{control}</span></label>
      {help ? <p className="settings-row-help">{help}</p> : null}
    </>,
  })
  const pick = (aria: string, value: string, options: [string, string][], onPick: (value: string) => void, disabled = busy) =>
    <select className="settings-select" aria-label={aria} value={value} disabled={disabled} onChange={event => onPick(event.target.value)}>{options.map(([option, label]) => <option key={option} value={option}>{label}</option>)}</select>
  const toggleSwitch = (checked: boolean, onPick: (value: boolean) => void, disabled = busy) =>
    <><input type="checkbox" checked={checked} disabled={disabled} onChange={event => onPick(event.target.checked)} /><span className="settings-switch" /></>

  const sections: { id: string; label: string; summary: string; rows: SettingsRow[]; foot?: ReactNode }[] = [
    {
      id: 'workspace-directory', label: 'Vault', summary: pathTail(workspaceDir, 2),
      rows: [{
        key: 'workspace-directory', name: 'Vault folder', search: 'folder path boards home',
        node: <>
          <div className="settings-field">
            <input className="settings-field-input" aria-label="Vault folder" title={workspaceDir} value={vaultValue} spellCheck={false} onChange={event => setVaultDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void pickVaultFolder() } }} />
            {vaultDirty && <button type="button" className="settings-field-use" disabled={busy || !vaultValue.trim()} onClick={() => void pickVaultFolder()}>Use folder</button>}
            <button type="button" className="settings-field-open" title={'Open in ' + fileManager} aria-label={'Open the vault folder in ' + fileManager} onClick={() => void showWorkspaceDir()}><Icon name="external" size={13} /></button>
          </div>
          {vaultError && <p className="settings-field-error" role="alert">{vaultError}</p>}
          <p className="settings-row-help">Where the boards live: one folder each, and a new board is created here. It can be any folder on any drive; changing it does not move the boards already here.</p>
        </>,
      }],
    },
    {
      id: 'appearance', label: 'Appearance', summary: themeName(settings.workspaceTheme) + ' · ' + themeName(settings.chatTheme),
      rows: [
        { key: 'workspace-theme', name: 'Vaultspace theme', search: 'palette colour color', node: <ThemeRow target="workspace" /> },
        { key: 'chat-theme', name: 'Chatspace theme', search: 'palette colour color', node: <ThemeRow target="chat" /> },
      ],
    },
    {
      id: 'window', label: isMac ? 'Shortcut' : 'Windows', summary: native.winKey ? 'On' : 'Off',
      rows: [row(native.label || (isMac ? '⌃⌥⌘Space' : 'Win key') + ' shows Project KO',
        toggleSwitch(native.winKey, enabled => void winKey(enabled), busy || !native.available),
        <>{isMac ? 'Bring back open windows from any app.' : 'Bring back open windows. Win shortcuts keep working; Ctrl+Esc opens Start.'}{!native.available && <><br />{native.error || 'Available in the Windows and macOS desktop app.'}</>}</>,
        'shortcut hotkey')],
    },
    {
      id: 'chats', label: 'Chats', summary: agentName(settings.defaultAgent) + ' · ' + effortName(settings.defaultEffort || defaultEffort),
      rows: [
        row('Default agent', pick('Default agent', settings.defaultAgent, agents, value => void change({ defaultAgent: value as Settings['defaultAgent'] }))),
        row('Reasoning effort', pick('Reasoning effort', settings.defaultEffort || defaultEffort, efforts.map(([value, label]) => [value, label]), value => void change({ defaultEffort: value as Effort })),
          'Applies to new Codex, Claude and Antigravity chats. Project KO still chooses effort for the chats it opens.'),
        row('Terminal text size', pick('Terminal text size', String(settings.terminalFontSize || 13), Array.from({ length: 15 }, (_, i) => [String(i + 10), i + 10 + ' px'] as [string, string]), value => void change({ terminalFontSize: Number(value) }))),
        row('Terminal appearance', pick('Terminal appearance', settings.terminalAppearance || 'original', [['original', 'Original CLI colors'], ['focus', 'Project KO Focus']], value => void change({ terminalAppearance: value as Settings['terminalAppearance'] })),
          'Original preserves CLI colors, including added and removed lines. Focus uses muted colors. Your choice is saved for all chats and applies immediately without restarting them.'),
        ...(isMac
          ? [row('Use Option as Meta key', toggleSwitch(!!settings.terminalOptionMeta, enabled => void change({ terminalOptionMeta: enabled })),
              'Sends Meta shortcuts to the CLI. When off, Option types your keyboard layout\'s characters, such as @ or #.')]
          : []),
        row('Bypass CLI permissions', toggleSwitch(settings.defaultBypass, enabled => void change({ defaultBypass: enabled })), 'Default for new chats.'),
      ],
    },
    {
      id: 'read-aloud', label: 'Read aloud', summary: (speech?.ready ? 'Toxic · Pocket TTS' : 'Toxic is not running') + ' · ' + (settings.readAloudSpeed || 1) + '×',
      rows: [
        row('Engine', <span className="settings-path">{speech?.ready ? 'Toxic · Pocket TTS' : 'Toxic is not running'}</span>,
          'Read aloud uses the voice and language configured in Toxic. Start Toxic to enable it.', 'speech tts toxic'),
        row('Speaking speed', pick('Speaking speed', String(settings.readAloudSpeed || 1), [1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5].map(rate => [String(rate), rate + '×'] as [string, string]), value => void change({ readAloudSpeed: Number(value) }))),
      ],
      foot: !speech?.ready ? <p className="settings-status">Open Toxic, then reopen this panel.</p> : undefined,
    },
    {
      id: 'quota', label: 'Agent quota', summary: quotaIntervalLabel(settings.quotaRefreshMinutes || 5),
      rows: [row('Check the quota every', pick('Check the quota every', String(settings.quotaRefreshMinutes || 5), quotaIntervals.map(minutes => [String(minutes), quotaIntervalLabel(minutes)] as [string, string]), value => void change({ quotaRefreshMinutes: Number(value) })), quotaIntervalNote, 'minimax limit')],
    },
    {
      id: 'speech', label: 'Speech-to-text', summary: dictation.info?.providers?.find(provider => provider.id === dictation.info?.provider)?.label || 'Dictation',
      rows: [{ key: 'dictation', name: 'Dictation provider', search: 'speech to text toxic whisper openai openrouter', node: <DictationRows info={dictation.info} onChange={dictation.choose} /> }],
    },
    {
      id: 'project-ko', label: 'Project KO', summary: (settings.voiceName === 'marin' ? 'Marin' : 'Cedar') + ' · ' + (settings.coordinatorEffort === 'high' ? 'High' : 'Medium'),
      rows: [
        row('Voice', pick('Voice', settings.voiceName || 'cedar', [['cedar', 'Cedar'], ['marin', 'Marin']], value => void change({ voiceName: value }))),
        row('Coordinator reasoning', pick('Coordinator reasoning', settings.coordinatorEffort || 'medium', [['medium', 'Medium'], ['high', 'High']], value => void change({ coordinatorEffort: value as Settings['coordinatorEffort'] })), 'Voice changes apply to your next conversation.'),
      ],
    },
    {
      id: 'project', label: 'Project', summary: repo.split(/[\\/]/).pop() || repo,
      rows: [{
        key: 'repo', name: 'Repository', search: 'folder path git',
        node: <>
          <div className="settings-row"><span className="settings-row-name">Repository</span><span className="settings-row-value"><span className="settings-path" title={repo}>{repo}</span></span></div>
          <p className="settings-row-help">Skills, knowledge and processes belong to this repository.</p>
        </>,
      }],
    },
  ]

  return <div className="files-panel workspace-settings"><header><h2>Settings</h2><button className="desk-icon" onClick={onClose} aria-label="Close settings"><Icon name="close" size={17} /></button></header>
    <div className="settings-search"><Icon name="search" size={13} /><input type="search" value={query} placeholder="Search settings" aria-label="Search settings" onChange={event => setQuery(event.target.value)} /></div>
    <div className="settings-scroll">
      {sections.map(section => <Section key={section.id} {...section} open={open.includes(section.id)} query={query} onToggle={toggle} />)}
      {query.trim() && !sections.some(section => section.rows.some(item => (item.name + ' ' + (item.search || '')).toLowerCase().includes(query.trim().toLowerCase())))
        ? <p className="settings-empty">No setting matches that.</p>
        : null}
      {error && <p className="settings-status" role="alert">{error}</p>}
    </div>
  </div>
}
