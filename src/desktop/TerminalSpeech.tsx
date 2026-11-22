import { useEffect, useState } from 'react'
import { api, reportError, speakDesktopText, useDesktop } from './client'
import { Icon } from './Icons'
import { lastReply, spokenMarkdown } from '../mobile/replySpeech'
import { useReadAloud } from '../mobile/useReadAloud'
import type { ChatSession } from './types'

interface Transcript { supported: boolean; messages: { role: string; text: string }[] }

/**
 * Read aloud while a chat is shown as a terminal.
 *
 * The conversation view hangs its bar under the reply, because the reply is an
 * element. A terminal has no elements: the CLI's output is drawn on a canvas, so
 * there is nothing under the last line to attach to. The same reply is in the
 * chat's transcript, which this window already reads for the conversation view,
 * so a button in the chat's own row speaks it — no selection, and nothing to
 * copy first.
 */
export default function TerminalSpeech({ session, connected, running }: { session: ChatSession; connected: boolean; running: boolean }) {
  const settings = useDesktop().settings
  const [ready, setReady] = useState(false), [asking, setAsking] = useState(false)
  // The voice and the speed are app settings, the same ones the conversation uses.
  const speech = useReadAloud(session.id, speakDesktopText, { speed: settings.readAloudSpeed || 1, voice: settings.readAloudVoice || '' })
  useEffect(() => {
    let live = true
    // A build without the engine (or an older service) simply has no button; the
    // conversation view is where the install is offered.
    api<{ ready: boolean }>('/read-aloud').then(value => { if (live) setReady(!!value.ready) }).catch(() => { /* No engine to speak with. */ })
    return () => { live = false }
  }, [])
  useEffect(() => { if (speech.error) reportError(speech.error) }, [speech.error])
  async function read() {
    if (speech.activeId) { speech.togglePause(); return }
    if (asking) return
    setAsking(true)
    try {
      const transcript = await api<Transcript>(`/sessions/${session.id}/messages`)
      const text = spokenMarkdown(lastReply(transcript.messages || []))
      if (!text) { reportError('This chat has no reply to read aloud yet.'); return }
      speech.read('last-reply', text)
    } catch (error) { reportError(error) } finally { setAsking(false) }
  }
  if (!ready) return null
  const playing = !!speech.activeId, disabled = !connected || !running
  return <>
    <button type="button" className={`desk-icon ${playing ? 'active' : ''}`} disabled={disabled || asking} aria-pressed={playing}
      title={playing ? speech.paused ? 'Resume reading' : 'Pause reading' : 'Read the last reply aloud'}
      aria-label={playing ? speech.paused ? 'Resume reading' : 'Pause reading' : 'Read the last reply aloud'}
      onClick={() => void read()}>
      <Icon name={playing ? speech.paused ? 'play' : 'pause' : 'speaker'} size={16} />
    </button>
    {playing && <button type="button" className="desk-icon" title="Stop reading" aria-label="Stop reading" onClick={speech.stop}><Icon name="stop" size={13} /></button>}
  </>
}
