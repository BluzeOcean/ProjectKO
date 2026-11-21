import type { AgentId, AgentInfo, ChatSession } from './types'

// Where an agent's account lives, in the words the New chat panel already used.
const account: Record<AgentId, string> = {
  codex: 'Your CLI account', claude: 'Your CLI account', antigravity: 'Your CLI account',
  kimi: 'Your CLI account', dsh: 'Your DeepSeek account', opencode: 'Your providers', shell: 'Local terminal',
}

/** The account line under an agent, or the plain truth when its CLI is missing. */
export const agentAccount = (item: AgentInfo) => item.available ? account[item.id] : 'Not installed'

/** "12 min ago" for a stored timestamp. */
export function relativeTime(value: string) {
  const then = new Date(value).getTime()
  if (!Number.isFinite(then)) return ''
  const minutes = Math.max(0, Math.round((Date.now() - then) / 60000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

/** Agents already used, most recent first, with how long ago that was. */
export function recentAgents(sessions: ChatSession[]) {
  const times: Partial<Record<AgentId, string>> = {}
  for (const item of [...sessions].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))) {
    if (item.agent in times) continue
    times[item.agent] = relativeTime(item.updatedAt)
  }
  return times
}
