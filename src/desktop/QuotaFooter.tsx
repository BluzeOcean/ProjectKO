import { useEffect, useState } from 'react'
import { api, useDesktop } from './client'
import { Icon } from './Icons'

type QuotaWindow = { left: number; resetMs: number }
type Reading = { ok: boolean; session?: QuotaWindow; week?: QuotaWindow; error?: string }

// quota.ps1's threshold colour, left view: green above 70, amber to 10, red at
// 10 and below. The bar's track takes the tone too, so a spent window still
// reads as spent when there is no fill left to colour.
const tone = (left: number) => left > 70 ? 'ok' : left > 10 ? 'warm' : 'low'

// The script's TimeSpan, without its habit of showing 26h as 2h.
function turnover(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000))
  const days = Math.floor(total / 86400)
  const hours = Math.floor((total % 86400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  if (days) return days + 'd' + (hours ? ' ' + hours + 'h' : '')
  if (hours) return hours + 'h' + (minutes ? ' ' + minutes + 'm' : '')
  return minutes + 'm'
}

const share = (value: number) => Math.round(value) + '%'
const fill = (left: number) => Math.min(100, Math.max(0, left))

// The MiniMax agent's two windows as one line at the bottom of the window: the
// week, then the five-hour window, then when the five-hour window turns over —
// the countdown ends the line, so it stands against the meter it belongs to.
// Nothing is drawn until the service has a reading, so a machine without the
// CLI keeps the window it always had.
export default function QuotaFooter({ connected }: { connected: boolean }) {
  const { settings } = useDesktop()
  const minutes = Math.max(1, settings.quotaRefreshMinutes || 5)
  const [reading, setReading] = useState<Reading | null>(null)

  useEffect(() => {
    if (!connected) return
    let live = true
    let lastRead = 0
    const read = () => {
      lastRead = Date.now()
      api<Reading>('/quota')
        .then(value => { if (live) setReading(value) })
        .catch(() => { if (live) setReading(null) })
    }
    // The interval is the owner's, from Settings › Agent quota. Coming back to
    // the window asks again, but only once the interval has run out.
    const tick = () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - lastRead < minutes * 60000 - 1000) return
      read()
    }
    read()
    const timer = window.setInterval(tick, minutes * 60000)
    window.addEventListener('focus', tick)
    document.addEventListener('visibilitychange', tick)
    return () => {
      live = false
      window.clearInterval(timer)
      window.removeEventListener('focus', tick)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [connected, minutes])

  // Nothing is drawn for a reading that arrived on a connection since lost.
  const current = connected && reading?.ok ? reading : null
  const session = current?.session
  const week = current?.week
  if (!session || !week) return null

  const meter = (left: number, label: string) => <span className="qf-meter" role="img" aria-label={label}>
    <span className="qb-track" data-tone={tone(left)}><span className="qb-fill" style={{ width: fill(left) + '%' }} /></span>
    <span className="qf-pct">{share(left)}</span>
  </span>

  return <footer className="quota-footer" role="status" aria-label="Agent quota">
    {meter(week.left, 'Week: ' + share(week.left) + ' left')}
    {meter(session.left, 'Five-hour window: ' + share(session.left) + ' left')}
    <span className="qf-reset" title={'The five-hour window resets in ' + turnover(session.resetMs)}>
      <Icon name="refresh" size={10} />{turnover(session.resetMs)}
    </span>
  </footer>
}
