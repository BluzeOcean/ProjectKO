import { useCallback, useEffect, useRef, useState } from 'react'
import { readingVoiceChanged, savedReadingVoice } from './readingVoices'
import { runSpeech, speechChunks } from './speechPipeline'

export function spokenText(element: HTMLElement | null) {
  if (!element) return ''
  const copy = element.cloneNode(true) as HTMLElement
  copy.querySelectorAll('pre, code, table, img').forEach(node => node.remove())
  copy.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, blockquote, br').forEach(node => { node.append(document.createTextNode('\n')) })
  return (copy.textContent || '').replace(/\s+/g, ' ').trim()
}

export type Speak = (sessionId: string, voice: string, text: string, signal: AbortSignal) => Promise<ArrayBuffer>
async function speakOnPhone(sessionId: string, voice: string, text: string, signal: AbortSignal) {
  const response = await fetch(`/mobile/api/sessions/${sessionId}/read-aloud`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ voice, text }), signal })
  if (!response.ok) { const result = await response.json(); throw new Error(result.error || 'Speech generation failed.') }
  return response.arrayBuffer()
}

// Played through an audio element rather than WebAudio: a buffer source speeds
// up by resampling, which raises the pitch — at 2x the voice is a chipmunk. The
// element keeps the pitch and stretches time instead.
export function useReadAloud(sessionId: string, speak: Speak = speakOnPhone, options: { speed?: number; voice?: string } = {}) {
  const speed = Math.min(5, Math.max(1, options.speed || 1))
  const supported = typeof window.AudioContext !== 'undefined'
  const [activeId, setActiveId] = useState<string | null>(null), [paused, setPaused] = useState(false), [loading, setLoading] = useState(false), [error, setError] = useState('')
  const generation = useRef(0), player = useRef<HTMLAudioElement | null>(null), speech = useRef<ReturnType<typeof runSpeech> | null>(null)
  const urls = useRef<Set<string>>(new Set())
  const release = () => {
    speech.current?.stop(); speech.current = null
    const audio = player.current; player.current = null
    if (audio) { audio.pause(); audio.src = ''; audio.dispatchEvent(new Event('ended')) }
    for (const url of urls.current) URL.revokeObjectURL(url)
    urls.current.clear()
  }
  const stop = useCallback(() => {
    generation.current++
    release()
    setActiveId(null); setPaused(false); setLoading(false)
  }, [])
  useEffect(() => {
    const run = generation
    window.addEventListener(readingVoiceChanged, stop)
    return () => { run.current++; release(); window.removeEventListener(readingVoiceChanged, stop) }
  }, [stop])
  function read(id: string, text: string) {
    if (!supported) { setError('Audio playback is unavailable in this browser.'); return }
    stop(); setError('')
    if (!text.trim()) { setError('This reply has no text to read aloud.'); return }
    // An empty choice means the first voice in the install folder, which is
    // what the phone asks for too.
    const run = generation.current, voice = options.voice || savedReadingVoice()
    const pipeline = runSpeech({
      segments: speechChunks(text),
      // A second of speech is worth less wall time when it plays faster, so the
      // lead grows with the speed: the queue is measured in seconds of audio.
      target: Math.min(48, 24 * speed),
      speak: (part, signal) => speak(sessionId, voice, part, signal),
      cancelled: () => generation.current !== run,
      onLoading: setLoading,
      play: async segment => {
        const url = URL.createObjectURL(segment.blob)
        urls.current.add(url)
        const audio = new Audio(url)
        audio.preservesPitch = true; audio.playbackRate = speed
        player.current = audio
        const ended = new Promise<void>(resolve => { audio.onended = () => resolve(); audio.onerror = () => resolve() })
        await audio.play()
        await ended
        URL.revokeObjectURL(url); urls.current.delete(url)
      },
    })
    speech.current = pipeline
    setActiveId(id); setPaused(false)
    void pipeline.done.then(() => { if (generation.current === run) stop() }).catch(cause => {
      if (generation.current !== run) return
      stop(); setError(cause instanceof Error ? cause.message : 'Read aloud could not start.')
    })
  }
  function togglePause() {
    const audio = player.current; if (!audio) return
    try { if (paused) void audio.play(); else audio.pause() } catch { stop(); setError('Audio playback could not continue.') }
    setPaused(!paused)
  }
  return { supported, activeId, paused, loading, error, read, stop, togglePause }
}
