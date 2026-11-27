import { useEffect, useState } from 'react'
import { api, useDesktop } from './client'

type QuotaWindow = { left: number; resetMs: number }
type Reading = { ok: boolean; session?: QuotaWindow; week?: QuotaWindow; error?: string }

// The two windows keep their own colour. The week is the one that runs
// out, so it is red; the five-hour window is the one that comes back, so
// it is green. Neither changes with what is left of it - the length of
// the bar and the number beside it say that, and a bar that changed
// colour as it emptied read as an alarm rather than as a measurement.

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

// The MiniMax account's two windows, for the line at the bottom of the window:
// the week, then the five-hour window, then when that window turns over — the
// countdown ends the line, so it stands against the meter it belongs to.
// Nothing is drawn until the service has a reading, so a machine without the
// CLI keeps the line it always had and loses only the meters.
export default function QuotaMeters({ connected }: { connected: boolean }) {
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

  // Two bars in a row say nothing about themselves. Each carries the short
  // name of the window it measures - W for the week, 5H for the five-hour
  // one - so the reader can tell them apart at a glance, and the full name
  // in the title for anyone who wants it.
  const meter = (left: number, short: string, label: string, window: 'week' | 'session') => <span className="qf-meter" role="img" aria-label={label} title={label}>
    <span className="qf-tag">{short}</span>
    <span className="qb-track" data-window={window}><span className="qb-fill" style={{ width: fill(left) + '%' }} /></span>
    <span className="qf-pct">{share(left)}</span>
  </span>

  return <>
    {meter(week.left, 'W', 'Week: ' + share(week.left) + ' left', 'week')}
    {meter(session.left, '5H', 'Five-hour window: ' + share(session.left) + ' left', 'session')}
    <span className="qf-reset" title={'The five-hour window resets in ' + turnover(session.resetMs)}>{turnover(session.resetMs)}</span>
  </>
}
