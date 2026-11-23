import { useCallback, useEffect, useRef, useState } from 'react'
import { api, useDesktop } from './client'
import { Icon } from './Icons'

type Phase = 'idle' | 'starting' | 'listening' | 'stopping'
interface ListenState { listening: boolean; text?: string; last?: { text?: string; at?: number } | null }
interface Chord { ctrl: boolean; alt: boolean; shift: boolean; meta: boolean; key: string }

const modifiers = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'ContextMenu', 'OS'])

// Toxic's shortcut arrives as "Ctrl+T". Parse it rather than assume one chord:
// the owner can rebind it in Toxic, and the chat follows that setting.
function parseChord(value: string): Chord | null {
  const parts = value.split('+').map(part => part.trim()).filter(Boolean)
  if (parts.length < 2) return null
  const chord: Chord = { ctrl: false, alt: false, shift: false, meta: false, key: parts[parts.length - 1].toLowerCase() }
  for (const part of parts.slice(0, -1)) {
    const name = part.toLowerCase()
    if (name === 'ctrl' || name === 'control') chord.ctrl = true
    else if (name === 'alt') chord.alt = true
    else if (name === 'shift') chord.shift = true
    else if (name === 'win' || name === 'meta' || name === 'cmd' || name === 'super') chord.meta = true
    else return null
  }
  return chord
}

/**
 * The microphone, as a switch for Toxic.
 *
 * Toxic owns the listening: it records with its own device, draws its own HUD
 * and transcribes with Hex. Project KO saves no audio and shows no recorder
 * panel; this control starts and stops Toxic and puts the words in the draft.
 *
 * The shortcut is Toxic's own speech-to-text chord, read when the app connects,
 * and it works like a native one: it starts listening, and the next key of any
 * kind finishes the take and inserts the words, as Toxic's own dictation does.
 */
export default function DictationButton({ connected, disabled, onText, onNote, toggleEvent }: {
  connected: boolean
  disabled?: boolean
  onText: (text: string) => void
  onNote?: (note: string) => void
  toggleEvent?: string
}) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [learned, setLearned] = useState('')
  const state = useDesktop()
  const shortcut = state.dictationShortcut || learned
  const started = useRef(0), alive = useRef(true), phaseRef = useRef<Phase>('idle')
  const note = useRef(onNote), deliver = useRef(onText)
  useEffect(() => { note.current = onNote; deliver.current = onText })
  useEffect(() => { phaseRef.current = phase }, [phase])
  useEffect(() => () => { alive.current = false }, [])
  const say = (message: string) => note.current?.(message)

  const finishTaking = useCallback(async () => {
    if (phaseRef.current !== 'listening') return
    setPhase('stopping')
    try {
      const answer = await api<ListenState>('/dictation/listen', { action: 'stop' })
      const text = (answer.text || '').trim()
      if (text) deliver.current(text)
      say(text ? '' : 'Toxic heard nothing. Try again a little closer to the microphone.')
    } catch (error) { say(error instanceof Error ? error.message : String(error)) }
    if (alive.current) setPhase('idle')
  }, [])

  const startTaking = useCallback(async () => {
    if (phaseRef.current !== 'idle') return
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
  // length stops it. Watching the state keeps the control honest and recovers
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

  // The chord comes from Toxic when the app connects. If the connection predates
  // this build, ask the service for it once instead.
  useEffect(() => {
    if (state.dictationShortcut) return
    let live = true
    void api<{ shortcut?: string | null }>('/dictation')
      .then(info => { if (live && typeof info.shortcut === 'string') setLearned(info.shortcut) })
      .catch(() => { /* No Toxic, no chord; the microphone still works. */ })
    return () => { live = false }
  }, [state.dictationShortcut])

  // One listener for the whole gesture. While a take is open any key finishes it
  // and is swallowed, the way Toxic's own dictation behaves; otherwise the
  // shortcut starts it. The terminal view leaves the chord to xterm, which
  // already swallows it and dispatches the toggle event.
  useEffect(() => {
    const chord = toggleEvent ? null : parseChord(shortcut)
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || event.isComposing || event.keyCode === 229) return
      if (phaseRef.current === 'listening') {
        if (modifiers.has(event.key)) return
        event.preventDefault(); event.stopPropagation()
        void finishTaking()
        return
      }
      if (!chord || phaseRef.current !== 'idle') return
      if (event.ctrlKey !== chord.ctrl || event.altKey !== chord.alt || event.shiftKey !== chord.shift || event.metaKey !== chord.meta) return
      if ((event.key || '').toLowerCase() !== chord.key) return
      event.preventDefault(); event.stopPropagation()
      void startTaking()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [shortcut, toggleEvent, startTaking, finishTaking])

  // The terminal's Ctrl+T asks this microphone to toggle.
  useEffect(() => {
    if (!toggleEvent) return
    const listener = () => { if (phaseRef.current === 'listening') void finishTaking(); else void startTaking() }
    window.addEventListener(toggleEvent, listener)
    return () => window.removeEventListener(toggleEvent, listener)
  }, [toggleEvent, startTaking, finishTaking])

  const listening = phase === 'listening', busy = phase === 'starting' || phase === 'stopping'
  return <button type="button" className={'dictation-button ' + phase}
    aria-label={listening ? 'Stop dictating' : busy ? 'Toxic is starting' : 'Dictate a message'}
    title={listening ? 'Stop dictating and add the words' : shortcut ? 'Dictate with Toxic · ' + shortcut : 'Dictate with Toxic'}
    disabled={busy || (!listening && (disabled || !connected))}
    onClick={() => { if (listening) void finishTaking(); else void startTaking() }}><Icon name={listening ? 'stop' : 'mic'} size={16} /></button>
}
