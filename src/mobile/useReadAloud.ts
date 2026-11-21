import { useCallback, useEffect, useRef, useState } from 'react'
import { readingVoiceChanged, savedReadingVoice } from './readingVoices'

export function spokenText(element: HTMLElement | null) {
  if (!element) return ''
  const copy = element.cloneNode(true) as HTMLElement
  copy.querySelectorAll('pre, code, table, img').forEach(node => node.remove())
  copy.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, blockquote, br').forEach(node => { node.append(document.createTextNode('\n')) })
  return (copy.textContent || '').replace(/\s+/g, ' ').trim()
}
function chunks(text: string) {
  const result: string[] = []
  while (text.length > 220) {
    const fragment = text.slice(0, 220)
    const sentence = Math.max(fragment.lastIndexOf('. '), fragment.lastIndexOf('? '), fragment.lastIndexOf('! '))
    const space = fragment.lastIndexOf(' ')
    const split = sentence > 60 ? sentence + 1 : space > 60 ? space : 220
    result.push(text.slice(0, split)); text = text.slice(split).trimStart()
  }
  if (text) result.push(text)
  return result
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
export function useReadAloud(sessionId: string, speak: Speak = speakOnPhone, options: { speed?: number } = {}) {
  const speed = Math.min(5, Math.max(1, options.speed || 1))
  const supported = typeof window.AudioContext !== 'undefined'
  const [activeId, setActiveId] = useState<string | null>(null), [paused, setPaused] = useState(false), [loading, setLoading] = useState(false), [error, setError] = useState('')
  const generation = useRef(0), player = useRef<HTMLAudioElement | null>(null), url = useRef<string | null>(null), pending = useRef<AbortController | null>(null)
  const release = () => {
    const audio = player.current; player.current = null
    if (audio) { audio.pause(); audio.src = '' }
    if (url.current) { URL.revokeObjectURL(url.current); url.current = null }
  }
  const stop = useCallback(() => {
    generation.current++; pending.current?.abort(); pending.current = null
    release()
    setActiveId(null); setPaused(false); setLoading(false)
  }, [])
  useEffect(() => {
    const run = generation, request = pending
    window.addEventListener(readingVoiceChanged, stop)
    return () => { run.current++; request.current?.abort(); release(); window.removeEventListener(readingVoiceChanged, stop) }
  }, [stop])
  function read(id: string, text: string) {
    if (!supported) { setError('Audio playback is unavailable in this browser.'); return }
    stop(); setError('')
    if (!text.trim()) { setError('This reply has no text to read aloud.'); return }
    const run = generation.current, queue = chunks(text), voice = savedReadingVoice()
    setActiveId(id)
    const next = async () => {
      if (generation.current !== run) return
      const part = queue.shift(); if (!part) { stop(); return }
      const controller = new AbortController(); pending.current = controller
      // Each segment is generated on the computer before it plays; the first one
      // also waits for the model to load.
      setLoading(true)
      try {
        const data = await speak(sessionId, voice, part, controller.signal)
        if (generation.current !== run) return
        const audio = new Audio(URL.createObjectURL(new Blob([data], { type: 'audio/wav' })))
        if (url.current) URL.revokeObjectURL(url.current)
        url.current = audio.src
        audio.preservesPitch = true; audio.playbackRate = speed
        player.current = audio
        audio.onended = () => { if (generation.current === run) void next() }
        await audio.play()
        setLoading(false)
      } catch (cause) { if (generation.current !== run) return; stop(); setError(cause instanceof Error ? cause.message : 'Read aloud could not start.') }
    }
    void next()
  }
  function togglePause() {
    const audio = player.current; if (!audio) return
    try { if (paused) void audio.play(); else audio.pause() } catch { stop(); setError('Audio playback could not continue.') }
    setPaused(!paused)
  }
  return { supported, activeId, paused, loading, error, read, stop, togglePause }
}
