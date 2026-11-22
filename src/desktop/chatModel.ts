import { useEffect, useState } from 'react'
import { api } from './client'
import type { ChatSession } from './types'
import { hasConversationView } from './chatView'

// The model a Claude Code or Codex chat last used, read from its transcript. It
// refreshes after each turn and every 15 s, which also catches a /model change.
export function useChatModel(session: ChatSession | undefined) {
  const [read, setRead] = useState<{ id: string; model: string | null } | null>(null)
  const id = session && hasConversationView(session) && session.hasConversation ? session.id : null
  useEffect(() => {
    if (!id) return
    let alive = true
    const load = () => api<{ model?: string | null }>(`/sessions/${id}/stats`).then(value => { if (alive) setRead({ id, model: value.model || null }) }).catch(() => {})
    void load()
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load() }, 15000)
    return () => { alive = false; clearInterval(timer) }
  }, [id, session?.completionVersion])
  return id && read?.id === id ? read.model : null
}

// "claude-opus-5-5-20261001" reads as "opus-5-5"; other names are kept.
export const modelLabel = (model: string) => model.replace(/^claude-/, '').replace(/-\d{8}(?=$|\[)/, '')

// What the one line at the bottom has room for: the name a model goes by at a
// glance. "MiniMax-M3.1-Flash" reads as "minimax" and "claude-opus-5-5" as
// "opus" — the version is in the title, and on Claude the tier is the part
// that tells two of them apart.
export const modelShort = (model: string) => {
  const words = modelLabel(model).split(/[^A-Za-z0-9.]+/).filter(Boolean)
  return (words[0]?.toLowerCase() === 'claude' ? words[1] || words[0] : words[0] || '').toLowerCase()
}
