import { lazy, Suspense, useEffect } from 'react'
import App from '../App'
import { dismissError, sendEvent, startDesktop, surface, useDesktop } from './client'
import { installDictationProbe, setDictationProbeBadge, uninstallDictationProbe } from './dictationProbe'
import FilesRail, { FilePreview } from './FilesRail'
import VoiceDock from './VoiceDock'
import { Icon, PkoMark } from './Icons'
import './desktop.css'

const Chats = lazy(() => import('./Chats'))

export default function DesktopApp() {
  const state = useDesktop()
  useEffect(() => { startDesktop() }, [])
  // The dictation probe records what this window receives from another process.
  // It is a diagnostic an agent switches on and off over the service, so it
  // follows the saved setting rather than living here.
  const probe = state.settings?.dictationProbe
  useEffect(() => {
    if (probe?.recording === false) { uninstallDictationProbe(); return }
    return installDictationProbe()
  }, [probe?.recording])
  useEffect(() => { setDictationProbeBadge(probe?.badge === true) }, [probe?.badge])
  useEffect(() => {
    if (surface !== 'workspace') return
    const route = () => sendEvent({ type: 'workspace-route', route: location.hash })
    window.addEventListener('hashchange', route)
    return () => window.removeEventListener('hashchange', route)
  }, [])
  if (!state.ready) return <div className="desktop-boot"><PkoMark size={70} /><h1>Project KO</h1><p>{state.error || 'Opening your vault…'}</p>{state.error && <button className="desk-secondary" onClick={() => startDesktop()}>Reconnect</button>}</div>
  return <div className={`desktop-root ${surface}-root`}>
    {surface === 'chats' ? <Suspense fallback={<div className="desktop-boot"><PkoMark size={50} /></div>}><Chats /></Suspense> : <><div className="workspace-surface"><App />{state.preview && <FilePreview file={state.preview} />}</div><FilesRail /></>}
    {state.error && <div className="desktop-error" role="alert"><span>{state.error}</span><button onClick={dismissError} aria-label="Dismiss error"><Icon name="close" size={16} /></button></div>}
    {!state.connected && <div className="desktop-offline">Reconnecting to the local service…</div>}
    <VoiceDock />
  </div>
}
