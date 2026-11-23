import { useEffect, useRef } from 'react'
import { api } from './client'

interface ListenState { listening?: boolean; owner?: 'project-ko' | 'toxic'; last?: { text?: string; at?: number } | null }

// Words this app already inserted, so the watcher below never types them twice.
const delivered = new Map<string, number>()
export function noteDelivered(text: string) {
  delivered.set(text, Date.now())
  if (delivered.size > 20) for (const [key, at] of delivered) if (Date.now() - at > 30_000) delivered.delete(key)
}
export function wasDelivered(text: string): boolean {
  const at = delivered.get(text)
  return !!at && Date.now() - at < 30_000
}

// The focused field may already hold the sentence: Toxic types its own takes,
// and a surface that received the words must not receive them again.
function fieldHasWords(text: string): boolean {
  const active = document.activeElement as HTMLTextAreaElement | HTMLInputElement | null
  const value = typeof active?.value === 'string' ? active.value : ''
  const needle = text.trim().slice(0, 24)
  return !!needle && value.replace(/\s+/g, ' ').includes(needle.replace(/\s+/g, ' '))
}

/**
 * Toxic's own takes, arriving with words Project KO has to place.
 *
 * The system-wide chord belongs to Toxic, so a take it opens is invisible to
 * this app until it ends: Toxic pushes the transcript into its history and the
 * service reads it from there. Surfaces that can be typed into already show
 * the words when Toxic types them, so this only fills the gap - and it stays
 * quiet while Project KO owns the take, because that one is returned directly.
 */
export function useToxicTranscripts(onTranscript: (text: string) => void, options: { enabled?: boolean; alreadyThere?: (text: string) => boolean } = {}) {
  const { enabled = true, alreadyThere } = options
  const deliver = useRef(onTranscript), there = useRef(alreadyThere)
  useEffect(() => { deliver.current = onTranscript; there.current = alreadyThere })

  useEffect(() => {
    if (!enabled) return
    let active = true
    // Only words spoken after this surface appeared belong to it; the history
    // already holds every earlier take.
    const mountedAt = Date.now()
    let seen = 0
    const timer = window.setInterval(() => {
      // A transcript belongs to the window the person is working in.
      if (!document.hasFocus()) return
      void api<ListenState>('/dictation/listen', { action: 'status' }).then(state => {
        if (!active || !document.hasFocus()) return
        const at = Number(state?.last?.at || 0)
        const text = String(state?.last?.text || '').trim()
        if (!at || at <= seen) return
        seen = at
        if (!text || at < mountedAt || wasDelivered(text)) return
        // Toxic types the words as the take ends; give it a moment before
        // deciding the field is still empty.
        window.setTimeout(() => {
          if (!active || !document.hasFocus() || wasDelivered(text)) return
          if (there.current?.(text) || fieldHasWords(text)) return
          noteDelivered(text)
          deliver.current(text)
        }, 700)
      }).catch(() => {})
    }, 900)
    return () => { active = false; window.clearInterval(timer) }
  }, [enabled])
}
