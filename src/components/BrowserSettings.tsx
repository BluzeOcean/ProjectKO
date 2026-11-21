import ThemePicker from './ThemePicker'
import type { ThemeTarget } from '../lib/workspace-theme'
import { api, reportError, useDesktop } from '../desktop/client'
import { quotaIntervalLabel, quotaIntervalNote, quotaIntervals } from '../lib/quota'

export default function BrowserSettings({ target = 'workspace' }: { target?: ThemeTarget }) {
  const { settings } = useDesktop()
  const chat = target === 'chat'
  return <details className="browser-settings" onKeyDown={event => { if (event.key === 'Escape') { event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus() } }}>
    <summary role="button" aria-label={target === 'chat' ? 'Chat appearance' : 'Workspace settings'} title={target === 'chat' ? 'Appearance' : 'Settings'}>{target === 'chat' ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6" /></svg> : 'Settings'}</summary>
    <div className="browser-settings-panel"><h2>Appearance</h2><ThemePicker target={target} />{chat && <><h2>Agent quota</h2><div className="workspace-theme-picker"><label>Check the quota every<select aria-label="Check the quota every" value={settings.quotaRefreshMinutes || 5} onChange={event => api('/settings', { quotaRefreshMinutes: Number(event.target.value) }).catch(reportError)}>{quotaIntervals.map(minutes => <option key={minutes} value={minutes}>{quotaIntervalLabel(minutes)}</option>)}</select></label><p>{quotaIntervalNote}</p></div></>}</div>
  </details>
}
