import QuotaFooter from './QuotaFooter'
import type { ChatSession } from './types'

/**
 * The one line at the bottom of the Chats window.
 *
 * It answers about the chat in front of you, so what it says depends on who
 * is answering. A DeepSeek Harness chat reports its own numbers — turns,
 * tokens, how much of them came from cache, what the chat has cost and how
 * full the context is — and the line shows those. Every other harness is a CLI
 * whose account is the thing worth watching, so the line stays the MiniMax
 * quota it has always been.
 *
 * Only these two exist: DeepSeek and everything else.
 */

const CIRCUMFERENCE = 31.4

// Thousands, in the size a footer can hold: 41.8k, 312k, 1.2M.
function compactTokens(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0'
  if (value < 1000) return String(Math.round(value))
  if (value < 100000) return (value / 1000).toFixed(1) + 'k'
  if (value < 1000000) return Math.round(value / 1000) + 'k'
  return (value / 1000000).toFixed(1) + 'M'
}

// The ring is a 12 px circle: the track, then the arc drawn from the top.
function Ring({ percent }: { percent: number }) {
  const offset = CIRCUMFERENCE * (1 - Math.max(0, Math.min(100, percent)) / 100)
  return <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
    <circle className="ds-track" cx="6" cy="6" r="5" fill="none" strokeWidth="1.5" />
    <circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeDasharray={CIRCUMFERENCE} strokeDashoffset={offset} transform="rotate(-90 6 6)" />
  </svg>
}

export default function ChatStatusFooter({ session, connected }: { session?: ChatSession | null; connected: boolean }) {
  if (session?.agent !== 'dsh') return <QuotaFooter connected={connected} />
  const usage = session.usage
  const turns = usage?.turns || 0
  const tokens = usage?.tokens || 0
  const cacheHit = usage?.cacheHit || 0
  const cost = usage?.cost || 0
  const percent = usage?.contextPercent ?? null
  const tone = percent === null ? 'none' : percent >= 85 ? 'low' : percent >= 70 ? 'warm' : 'ok'
  const limit = usage?.limit || 0
  return <footer className="quota-footer ds-status" role="status" aria-label="Chat status">
    <span className="ds-fact ds-turns" title={`${turns} turns · ${usage?.steps || 0} model steps`}>
      <b>{turns}</b> {turns === 1 ? 'turn' : 'turns'}
    </span>
    <span className="ds-fact" title={`${tokens.toLocaleString('en-US')} tokens in and out of this chat`}>
      <b>{compactTokens(tokens)}</b> tok
    </span>
    <span className="ds-fact ds-cache" title={`${cacheHit}% of the last request was served from cache, which is why the cost is low`}>
      <b>{cacheHit}%</b> cache
    </span>
    <span className="ds-cost" title={`About ¥${cost.toFixed(3)} so far · estimated from cached and fresh tokens at DeepSeek's published rate\nThe harness reports usage, not a price; Project KO prices it.`}>
      ¥<b>{cost.toFixed(3)}</b>
    </span>
    {percent !== null && <span className="ds-ring" data-tone={tone} title={`${percent}% of the ${limit.toLocaleString('en-US')}-token window used`}>
      <Ring percent={percent} />
      <b>{percent}%</b>
    </span>}
  </footer>
}
