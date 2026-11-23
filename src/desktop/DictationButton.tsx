import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './client'
import { Icon } from './Icons'

type Phase = 'idle' | 'starting' | 'listening' | 'stopping'
interface ListenState { listening: boolean; text?: string; last?: { text?: string; at?: number } | null }

/**
 * The microphone, as a switch for Toxic.
 *
 * Toxic owns the listening: it records with its own device, draws its own HUD
 * and transcribes with Hex. Project KO saves no audio and shows no recorder
 * panel; this button starts and stops Toxic and puts the words in the draft.
 * Starting it wakes Toxic when the app is closed, and asks for an install when
 * it is not on the computer at all.
 */
export default function DictationButton({ connected, disabled, onText, onNote, toggleEvent }: {
  connected: boolean
  disabled?: boolean
  onText: (text: string) => void
  onNote?: (note: string) => void
  toggleEvent?: string
}) {
  const [phase, setPhase] = useState<Phase>('idle')
  const started = useRef(0), alive = useRef(true), phaseRef = useRef<Phase>('idle')
  const note = useRef(onNote), deliver = useRef(onText)
  useEffect(() => { note.current = onNote; deliver.current = onText })
  useEffect(() => { phaseRef.current = phase }, [phase])
  useEffect(() => () => { alive.current = false }, [])
  const say = (message: string) => note.current?.(message)

  const listen = useCallback(async () => {
    const phase = phaseRef.current
    if (phase === 'starting' || phase === 'stopping') return
    if (phaseRef.current === 'listening') {
      setPhase('stopping')
      try {
        const answer = await api<ListenState>('/dictation/listen', { action: 'stop' })
        const text = (answer.text || '').trim()
        if (text) deliver.current(text)
        say(text ? '' : 'Toxic heard nothing. Try again a little closer to the microphone.')
      } catch (error) { say(error instanceof Error ? error.message : String(error)) }
      if (alive.current) setPhase('idle')
      return
    }
    setPhase('starting')
    // Waking Toxic from cold takes a few seconds; say so only when it does.
    const hint = window.setTimeout(() => { if (phaseRef.current === 'starting') say('Starting Toxic…') }, 700)
    try {
      await api('/dictation/listen', { action: 'start' })
      started.current = Date.now()
      if (alive.current) { setPhase('listening'); say('') }
    } catch (error) { say(error instanceof Error ? error.message : String(error)); if (alive.current) setPhase('idle') }
    finally { window.clearTimeout(hint) }
  }, [])

  // Toxic can end a take on its own: Escape cancels, and its maximum recording
  // length stops it. Watching the state keeps the button honest and recovers
  // the words that Toxic already transcribed.
  useEffect(() => {
    if (phase !== 'listening') return
    let active = true
    const timer = window.setInterval(() => {
      void api<ListenState>('/dictation/listen', { action: 'status' }).then(state => {
        if (!active || !alive.current || state.listening) return
        const last = state.last
        const text = last && Number(last.at || 0) >= started.current ? String(last.text || '').trim() : ''
        if (text) deliver.current(text)
        setPhase('idle')
      }).catch(() => { if (active && alive.current) setPhase('idle') })
    }, 1200)
    return () => { active = false; window.clearInterval(timer) }
  }, [phase])

  // The terminal's Ctrl+T asks this microphone to toggle.
  useEffect(() => {
    if (!toggleEvent) return
    const listener = () => { void listen() }
    window.addEventListener(toggleEvent, listener)
    return () => window.removeEventListener(toggleEvent, listener)
  }, [toggleEvent, listen])

  const listening = phase === 'listening', busy = phase === 'starting' || phase === 'stopping'
  return <button type="button" className={'dictation-button ' + phase}
    aria-label={listening ? 'Stop dictating' : busy ? 'Toxic is starting' : 'Dictate a message'}
    title={listening ? 'Stop dictating and add the words' : 'Dictate with Toxic'}
    disabled={busy || (!listening && (disabled || !connected))}
    onClick={() => void listen()}><Icon name={listening ? 'stop' : 'mic'} size={16} /></button>
}
