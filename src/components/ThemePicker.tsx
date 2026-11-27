import { useState } from 'react'
import { setWorkspaceTheme, useWorkspaceTheme, type WorkspaceTheme, type ThemeTarget } from '../lib/workspace-theme'
import { palettes, themes, themePalette } from '../../desktop/service/appearance.mjs'

/* The dotted optgroups are the picker's own order: three palettes that come
   from the tools Project KO talks to, then the rest, then the classic two. */
function ThemeOptions() {
  return <>
    <optgroup label="Inspired by your tools">{themes.slice(0, 3).map(theme => <option key={theme.id} value={theme.id}>{theme.name}</option>)}</optgroup>
    <optgroup label="More palettes">{themes.slice(3).map(theme => <option key={theme.id} value={theme.id}>{theme.name}</option>)}</optgroup>
    <optgroup label="Classic"><option value="dark">Dark</option><option value="light">Light</option><option value="system">System</option></optgroup>
  </>
}

/* The Appearance popover still draws the card. Settings draws the row: the
   select, and one line of the palette painting itself under it. */
export default function ThemePicker({ target = 'workspace' }: { target?: ThemeTarget }) {
  const { preference, resolved } = useWorkspaceTheme(target)
  const palette = themePalette(resolved)
  const label = target === 'chat' ? 'Chatspace theme' : 'Vaultspace theme'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const change = async (value: WorkspaceTheme) => {
    setBusy(true); setError('')
    try { await setWorkspaceTheme(value, target) }
    catch (error) { setError(error instanceof Error ? error.message : String(error)) }
    finally { setBusy(false) }
  }
  return <div className="workspace-theme-picker">
    <label>{label}<select aria-label={label} value={preference} disabled={busy} onChange={event => void change(event.target.value as WorkspaceTheme)}><ThemeOptions /></select></label>
    <div className="theme-preview" aria-hidden="true" style={{ background: palette.bg, color: palette.text, borderColor: palette.muted + '55' }}>
      <div className="theme-preview-bar" style={{ background: palette.panel }}><i style={{ background: palette.accent }} /><span>{palette.name}</span><i style={{ background: palette.secondary }} /></div>
      <div className="theme-preview-copy"><span style={{ color: palette.muted }}>A clear space for your work</span><strong>Ideas with room to grow.</strong><span style={{ color: palette.accent }}>Aa <span style={{ color: palette.secondary }}>Aa</span></span></div>
    </div>
    <p>{palette.description} {target === 'chat' ? 'Applies to all chats, including Conversation and Terminal.' : 'Applies to Vaultspace and standard reports.'} System follows your device.</p>
    {error && <p role="alert">{error}</p>}
  </div>
}

/* Settings · one row. The palette is the row's own feedback: choosing a
   theme repaints the line under it, so the panel never shows a picture of a
   theme that is not the one in force. */
export function ThemeRow({ target = 'workspace' }: { target?: ThemeTarget }) {
  const { preference, resolved } = useWorkspaceTheme(target)
  const palette = themePalette(resolved)
  const label = target === 'chat' ? 'Chatspace theme' : 'Vaultspace theme'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const change = async (value: WorkspaceTheme) => {
    setBusy(true); setError('')
    try { await setWorkspaceTheme(value, target) }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)) }
    finally { setBusy(false) }
  }
  return <>
    <label className="settings-row">
      <span className="settings-row-name">{label}</span>
      <span className="settings-row-value">
        <select className="settings-select" aria-label={label} value={preference} disabled={busy} onChange={event => void change(event.target.value as WorkspaceTheme)}><ThemeOptions /></select>
      </span>
    </label>
    <div className="settings-palette" aria-hidden="true" style={{ background: palette.bg, color: palette.text, borderColor: palette.muted + '55' }}>
      <span className="settings-palette-name">{palette.name}</span>
      <span className="settings-palette-line">Ideas with room to grow.</span>
      <span className="settings-palette-aa" style={{ color: palette.accent }}>Aa <span style={{ color: palette.secondary }}>Aa</span></span>
    </div>
    <p className="settings-row-help">{palette.description} {target === 'chat' ? 'Applies to all chats, including Conversation and Terminal.' : 'Applies to Vaultspace and standard reports.'} System follows your device.</p>
    {error && <p className="settings-row-help" role="alert">{error}</p>}
  </>
}

/* Settings · the Appearance page. One target, one preview and the whole
   catalogue as swatches — instead of two selects and two previews, one of
   each. The segmented control says which one is being changed, so the
   preview is always the theme you are about to change. */
export function ThemePage() {
  const [target, setTarget] = useState<ThemeTarget>('workspace')
  const { preference, resolved } = useWorkspaceTheme(target)
  const palette = themePalette(resolved)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const change = async (value: WorkspaceTheme) => {
    setBusy(true); setError('')
    try { await setWorkspaceTheme(value, target) }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)) }
    finally { setBusy(false) }
  }
  const swatches = [
    ...palettes.map(item => ({ id: item.id, name: item.name, paint: item.bg, accent: item.accent })),
    { id: 'system', name: 'System', paint: 'linear-gradient(90deg,#f7f8fa 0 50%,#0a0a0c 50% 100%)', accent: 'transparent' },
  ]
  return <div className="settings-theme-page">
    <div className="settings-theme-targets" role="group" aria-label="Where the theme applies">
      <button type="button" aria-pressed={target === 'workspace'} className={target === 'workspace' ? 'on' : ''} onClick={() => setTarget('workspace')}>Vaultspace</button>
      <button type="button" aria-pressed={target === 'chat'} className={target === 'chat' ? 'on' : ''} onClick={() => setTarget('chat')}>Chats</button>
    </div>
    <label className="settings-theme-select">
      <span className="settings-row-name">{target === 'chat' ? 'Chatspace theme' : 'Vaultspace theme'}</span>
      <select className="settings-select" aria-label={target === 'chat' ? 'Chatspace theme' : 'Vaultspace theme'} value={preference} disabled={busy} onChange={event => void change(event.target.value as WorkspaceTheme)}><ThemeOptions /></select>
    </label>
    <div className="settings-theme-preview" style={{ background: palette.bg, color: palette.text, borderColor: palette.muted + '55' }}>
      <span className="tp-name">{palette.name}</span>
      <span className="tp-line">A clear space for your work</span>
      <strong>Ideas with room to grow.</strong>
      <span className="tp-aa" style={{ color: palette.accent }}>Aa <span style={{ color: palette.secondary }}>Aa</span></span>
    </div>
    <div className="settings-theme-dots">
      {swatches.map(item => <button key={item.id} type="button" className="settings-theme-dot"
        style={{ background: item.paint }}
        aria-label={item.name} title={item.name}
        aria-pressed={preference === item.id}
        disabled={busy}
        onClick={() => void change(item.id as WorkspaceTheme)}>
        <i style={{ background: item.accent }} />
      </button>)}
    </div>
    <p className="settings-row-help">{palette.description} {target === 'chat' ? 'Applies to all chats, including Conversation and Terminal.' : 'Applies to Vaultspace and standard reports.'} System follows your device.</p>
    {error && <p className="settings-row-help" role="alert">{error}</p>}
  </div>
}
