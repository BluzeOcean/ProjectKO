import { useCallback, useEffect, useRef, useState } from 'react'
import { api, useDesktop } from './client'
import { Icon } from './Icons'
import { noteDelivered, useToxicTranscripts } from './useToxicTranscripts'

type Phase = 'idle' | 'starting' | 'listening' | 'stopping'
interface ListenState { listening?: boolean; owner?: 'project-ko' | 'toxic'; text?: string; last?: { text?: string; at?: number } | null }

const modifiers = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'ContextMenu', 'OS'])
// Toxic closes a recording by itself after this long; the switch must not stay
// lit longer than the microphone can.
const longestTake = 5 * 60_000

/**
 * The microphone, as a switch for Toxic.
 *
 * Toxic owns the listening: it records with its own device, draws its own HUD
 * and transcribes with Hex. Project KO saves no audio and shows no recorder
 * panel. One press opens the microphone, the next closes it, Escape throws the
 * take away, any other key finishes it - and the words land in the field.
 *
 * The system-wide shortcut is Toxic's, not ours. It reaches Toxic's keyboard
 * hook before this window sees anything, so binding it here would only steal it
 * when Toxic is not running. A take opened by that chord belongs to Toxic, and
 * the watcher in useToxicTranscripts collects its words.
 */
export default function DictationButton({ connected, disabled, onText, onNote, alreadyThere }: {
  connected: boolean
  disabled?: boolean
  onText: (text: string) => void
  onNote?: (note: string) => void
  alreadyThere?: (text: string) => boolean
}) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [learned, setLearned] = useState('')
  const state = useDesktop()
  const shortcut = state.dictationShortcut || learned
  const started = useRef(0), alive = useRef(true), phaseRef = useRef<Phase>('idle')
  // Opening the microphone takes a moment; a press in that moment is a request
  // to take it back, not a press to ignore.
  const cancelPending = useRef(false)
  const note = useRef(onNote), deliver = useRef(onText)
  useEffect(() => { note.current = onNote; deliver.current = onText })
  useEffect(() => { phaseRef.current = phase }, [phase])
  // StrictMode runs an effect, its cleanup and the effect again in development:
  // the flag has to be set on every mount, not only cleared on the way out.
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const say = useCallback((message: string) => note.current?.(message), [])
  const take = useCallback((text: string) => { noteDelivered(text); deliver.current(text) }, [])

  const finishTaking = useCallback(async () => {
    if (phaseRef.current !== 'listening') return
    phaseRef.current = 'stopping'
    setPhase('stopping')
    try {
      const answer = await api<ListenState>('/dictation/listen', { action: 'stop' })
      const text = (answer.text || '').trim()
      if (text) take(text)
      say(text ? '' : 'Toxic heard nothing. Try again a little closer to the microphone.')
    } catch (error) { say(error instanceof Error ? error.message : String(error)) }
    if (alive.current) { phaseRef.current = 'idle'; setPhase('idle') }
  }, [say, take])

  const cancelTaking = useCallback(async () => {
    if (phaseRef.current !== 'listening') return
    phaseRef.current = 'stopping'
    setPhase('stopping')
    try { await api('/dictation/listen', { action: 'cancel' }) } catch { /* A closed Toxic has nothing to cancel. */ }
    if (alive.current) { phaseRef.current = 'idle'; setPhase('idle'); say('') }
  }, [say])

  const startTaking = useCallback(async () => {
    if (phaseRef.current !== 'idle') return
    phaseRef.current = 'starting'
    setPhase('starting')
    // Waking Toxic from cold takes a few seconds; say so only when it does.
    const hint = window.setTimeout(() => { if (phaseRef.current === 'starting') say('Starting Toxic…') }, 700)
    try {
      const answer = await api<ListenState>('/dictation/listen', { action: 'start' })
      if (cancelPending.current) {
        cancelPending.current = false
        try { await api('/dictation/listen', { action: 'cancel' }) } catch { /* Nothing to cancel. */ }
        if (alive.current) { phaseRef.current = 'idle'; setPhase('idle'); say('') }
        return
      }
      started.current = Date.now()
      if (answer?.owner === 'toxic') {
        // Toxic got there first. Its take ends on any key and types the words
        // itself, so this switch steps aside instead of holding a second take.
        say('Toxic is listening already — speak, then press any key.')
        if (alive.current) { phaseRef.current = 'idle'; setPhase('idle') }
        return
      }
      if (alive.current) { phaseRef.current = 'listening'; setPhase('listening'); say('') }
    } catch (error) {
      say(error instanceof Error ? error.message : String(error))
      if (alive.current) { phaseRef.current = 'idle'; setPhase('idle') }
    } finally { window.clearTimeout(hint) }
  }, [say])

  // Toxic can end a take on its own: Escape cancels it, and its maximum
  // recording length stops it. Watching the state keeps the switch honest and
  // recovers the words Toxic already transcribed.
  useEffect(() => {
    if (phase !== 'listening') return
    let active = true
    const timer = window.setInterval(() => {
      void api<ListenState>('/dictation/listen', { action: 'status' }).then(state => {
        if (!active || !alive.current) return
        if (state.listening) {
          if (Date.now() - started.current > longestTake) void finishTaking()
          return
        }
        const last = state.last
        const text = last && Number(last.at || 0) >= started.current ? String(last.text || '').trim() : ''
        if (text) take(text)
        phaseRef.current = 'idle'
        setPhase('idle')
      }).catch(() => { if (active && alive.current) { phaseRef.current = 'idle'; setPhase('idle') } })
    }, 900)
    return () => { active = false; window.clearInterval(timer) }
  }, [phase, finishTaking, take])

  // A reload or a remount can lose the state of a take that is still open:
  // ask once, and take the switch back to listening if it is ours.
  useEffect(() => {
    if (!connected) return
    let live = true
    void api<ListenState>('/dictation/listen', { action: 'status' }).then(state => {
      if (!live || phaseRef.current !== 'idle' || !state?.listening || state.owner !== 'project-ko') return
      started.current = Date.now()
      phaseRef.current = 'listening'
      setPhase('listening')
    }).catch(() => { /* No Toxic, no take to adopt. */ })
    return () => { live = false }
  }, [connected])

  // The chord is Toxic's; only its label is read here, for the tooltip.
  useEffect(() => {
    if (state.dictationShortcut) return
    let live = true
    void api<{ shortcut?: string | null }>('/dictation')
      .then(info => { if (live && typeof info?.shortcut === 'string') setLearned(info.shortcut || '') })
      .catch(() => { /* No Toxic, no chord; the microphone still works. */ })
    return () => { live = false }
  }, [state.dictationShortcut])

  // While this switch owns the take the keyboard closes it the way Toxic's own
  // dictation does: Escape discards, any other key finishes and is swallowed so
  // it cannot type into the field the words are about to fill. A take Toxic
  // owns is never touched here - those keys belong to Toxic.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || event.isComposing || event.keyCode === 229) return
      if (phaseRef.current === 'starting') {
        // The microphone is still opening: remember the wish and cancel as soon
        // as Toxic answers, so a take can never open with nobody holding it.
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancelPending.current = true; say('Stopping…') }
        return
      }
      if (phaseRef.current !== 'listening') return
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); void cancelTaking(); return }
      if (modifiers.has(event.key)) return
      event.preventDefault(); event.stopPropagation()
      void finishTaking()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [finishTaking, cancelTaking, say])

  // Words from a take Toxic opened and finished by itself.
  useToxicTranscripts(text => { take(text); say('') }, { enabled: connected && phase === 'idle', alreadyThere })

  const listening = phase === 'listening', starting = phase === 'starting', stopping = phase === 'stopping'
  return <button type="button" className={'dictation-button ' + phase}
    aria-label={listening ? 'Stop dictating' : starting ? 'Cancel opening the microphone' : stopping ? 'Toxic is finishing' : 'Dictate a message'}
    title={listening ? 'Stop dictating and add the words' : starting ? 'Opening the microphone · press again to cancel' : shortcut ? 'Dictate with Toxic · ' + shortcut : 'Dictate with Toxic'}
    disabled={stopping || phase === 'idle' && (disabled || !connected)}
    onClick={() => {
      if (listening) void finishTaking()
      else if (starting) { cancelPending.current = true; say('Stopping…') }
      else void startTaking()
    }}><Icon name={listening || starting ? 'stop' : 'mic'} size={16} /></button>
}
