import { useEffect, useState } from 'react'
import { api, pickFiles, reportError } from './client'
import { Icon } from './Icons'
import { readingVoices } from '../mobile/readingVoices'

/**
 * Read aloud, and the offer to build it.
 *
 * The engine is not in the app: it is a folder with an interpreter, the
 * Chatterbox package and its weights, about five gigabytes, installed once when
 * the owner asks. Until then the row says so and offers the button; while it
 * builds, the same row reports the step.
 */

interface Progress { phase: string; percent: number; message: string }
interface Status { engine: string; ready: boolean; installing: boolean; progress: Progress; voices: { id: string; label: string }[]; custom?: string | null }

const idle: Progress = { phase: 'idle', percent: 0, message: '' }

export default function ReadAloudBar({ activeId, paused, loading, error, onRead, onStop, voice, onVoice, disabled }: {
  activeId: string | null; paused: boolean; loading: boolean; error: string
  onRead: () => void; onStop: () => void
  voice: string; onVoice: (value: string) => void; disabled?: boolean
}) {
  const [status, setStatus] = useState<Status | null>(null)
  const [starting, setStarting] = useState(false)

  const load = () => api<Status>('/read-aloud').then(setStatus).catch(() => setStatus(null))
  useEffect(() => { void load() }, [])

  // The install runs in the service and can take minutes: ask it where it is.
  const working = starting || !!status?.installing || status?.progress?.phase === 'install' || status?.progress?.phase === 'model'
  useEffect(() => {
    if (!working) return
    const timer = window.setInterval(() => { void load() }, 1500)
    return () => window.clearInterval(timer)
  }, [working])

  async function chooseClip() {
    try {
      const [file] = await pickFiles();
      if (!file) return
      await api('/read-aloud/voice', { path: file })
      await load()
    } catch (failure) { reportError(failure) }
  }

  async function setup() {
    setStarting(true)
    try { await api('/read-aloud/setup', {}); await load() } catch (failure) { reportError(failure) } finally { setStarting(false) }
  }

  if (status && !status.ready) {
    const progress = status.progress || idle
    return <div className="conversation-read-aloud setup">
      <span className="ra-note">Read aloud needs its engine. <b>Chatterbox</b> runs here on the GPU — about 5 GB, downloaded once.</span>
      {working
        ? <span className="ra-progress" role="status"><span>{progress.message || 'Installing…'}</span><b>{Math.round(progress.percent)}%</b></span>
        : progress.phase === 'failed'
          ? <><span className="ra-failed" role="alert">{progress.message}</span><button type="button" onClick={setup}><Icon name="down" size={13} />Try again</button></>
          : <button type="button" className="ra-setup" onClick={setup}><Icon name="down" size={13} />Set up read aloud</button>}
    </div>
  }

  return <div className="conversation-read-aloud">
    <button type="button" onClick={onRead} aria-label={activeId ? paused ? 'Resume reading' : 'Pause reading' : 'Read aloud'} title={activeId ? paused ? 'Resume reading' : 'Pause reading' : 'Read this reply aloud'}><Icon name={activeId ? paused ? 'play' : 'pause' : 'speaker'} size={15} />{activeId ? paused ? 'Resume' : 'Pause' : 'Read aloud'}</button>
    {activeId && <button type="button" onClick={onStop} aria-label="Stop reading" title="Stop"><Icon name="stop" size={13} /></button>}
    <select aria-label="Reading voice" value={voice} onChange={event => onVoice(event.target.value)} disabled={disabled}>{(status?.voices?.length ? status.voices : readingVoices).map(item => <option key={item.id} value={item.id}>{status?.custom ? 'Your clip · ' + status.custom : item.label}</option>)}</select>
    <button type="button" className="ra-clip" onClick={chooseClip} title={status?.custom ? 'Replace the voice clip' : 'Read aloud in a voice from a recording (about 10 seconds, one speaker, no music)'}><Icon name="mic" size={13} />{status?.custom ? 'Your clip' : 'Use a clip'}</button>
    {loading && <span role="status">Preparing audio…</span>}
    {error && <span role="alert">{error}</span>}
  </div>
}
