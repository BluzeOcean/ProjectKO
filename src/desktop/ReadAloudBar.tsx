import { useEffect, useState } from 'react'
import { api } from './client'
import { Icon } from './Icons'

/**
 * Read aloud, through Toxic.
 *
 * Project KO no longer installs or owns a speech model: Toxic runs Pocket TTS
 * and exposes it over MCP. The bar says which voice Toxic is using and offers a
 * retry when Toxic is not running; the voice itself is chosen in Toxic.
 */

interface Voice { id: string; label: string }
interface Status { engine: string; ready: boolean; voices?: Voice[]; voice?: string; label?: string | null }

export default function ReadAloudBar({ activeId, paused, loading, error, onRead, onStop }: {
  activeId: string | null; paused: boolean; loading: boolean; error: string
  onRead: () => void; onStop: () => void
}) {
  const [status, setStatus] = useState<Status | null>(null)
  const load = () => api<Status>('/read-aloud').then(setStatus).catch(() => setStatus(null))
  useEffect(() => { void load() }, [])

  if (status && !status.ready) {
    return <div className="conversation-read-aloud setup">
      <span className="ra-note">Read aloud needs <b>Toxic</b> running on this computer.</span>
      <button type="button" className="ra-setup" onClick={() => void load()}><Icon name="history" size={13} />Check again</button>
    </div>
  }

  const label = status?.label || status?.voices?.[0]?.label || 'Toxic · Pocket TTS'
  return <div className="conversation-read-aloud">
    <button type="button" className="ra-play" onClick={onRead} aria-label={activeId ? paused ? 'Resume reading' : 'Pause reading' : 'Read aloud'} title={activeId ? paused ? 'Resume reading' : 'Pause reading' : 'Read this reply aloud'}><Icon name={activeId ? paused ? 'play' : 'pause' : 'speaker'} size={15} /></button>
    {activeId && <button type="button" onClick={onStop} aria-label="Stop reading" title="Stop"><Icon name="stop" size={13} /></button>}
    <span className="ra-voice" title="The voice is chosen in Toxic">{label}</span>
    {loading && <span role="status">Preparing audio…</span>}
    {error && <span role="alert">{error}</span>}
  </div>
}
