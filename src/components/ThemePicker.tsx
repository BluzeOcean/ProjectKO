import { useState } from 'react'
import { setWorkspaceTheme, useWorkspaceTheme, type WorkspaceTheme, type ThemeTarget } from '../lib/workspace-theme'
import { themes, themePalette } from '../../desktop/service/appearance.mjs'

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
