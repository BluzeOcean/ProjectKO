// The dictation probe. It records what this window receives when another
// process types into it: the chord and its modifiers, the unicode packets
// Windows injects as text, and the text that arrives. The lines are kept in the
// window's own storage, where an agent can read them from disk after the fact,
// and a small badge shows them to a person who wants to watch them live.
//
// This is a diagnostic, not part of the product's behaviour. It records by
// default - a measurement that is never taken cannot be read - but it stays off
// the screen until it is asked for. The service switches it on and off:
//
//   POST /api/dictation/probe  { "recording": true, "badge": true }

const badgeId = 'pko-dictation-probe'
const storageKey = 'mrmak.dictationProbe'
const maxLines = 300
const lines: string[] = []

type ProbeHost = Window & { __pkoDictationProbe?: () => void }
type ProbeOptions = { badge?: boolean }

let badgeVisible = false
let badgePinned = false

function stamp(): string {
  const now = new Date()
  const pad = (value: number, size = 2) => String(value).padStart(size, '0')
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${pad(now.getMilliseconds(), 3)}`
}

function target(event: Event): string {
  const element = event.target as HTMLElement | null
  if (!element) return 'none'
  const tag = element.tagName.toLowerCase()
  const name = element.className ? '.' + String(element.className).split(' ')[0] : ''
  return tag + name
}

function surfaceName(): string {
  const root = document.querySelector('.desktop-root')
  if (root) return String(root.className)
  // The root may not be rendered yet when the probe arms, so the window's own
  // query is the honest answer until it is.
  const surface = new URLSearchParams(location.search).get('surface')
  return surface ? `${surface}-root` : 'unknown'
}

function persist() {
  try {
    // Both desktop windows share this store, so merge instead of overwriting:
    // one window must not erase what the other recorded.
    const stored = window.localStorage.getItem(storageKey)
    let previous: string[] = []
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) previous = parsed.filter((entry): entry is string => typeof entry === 'string')
      } catch {
        previous = []
      }
    }
    const merged = [...previous, ...lines]
    const unique = [...new Set(merged)].sort()
    while (unique.length > maxLines) unique.shift()
    window.localStorage.setItem(storageKey, JSON.stringify(unique))
  } catch {
    // A full or unavailable store must not break the app.
  }
}

/** The badge is a small tab in the corner: it must be seen, and it must not
 *  block the view. Hovering opens it, clicking keeps it open. */
function ensureBadge(): HTMLElement | null {
  if (typeof document === 'undefined' || !document.body) return null
  let badge = document.getElementById(badgeId)
  if (badge) return badge
  if (!document.getElementById(`${badgeId}-style`)) {
    const style = document.createElement('style')
    style.id = `${badgeId}-style`
    style.textContent = `#${badgeId}{position:fixed;left:8px;bottom:8px;z-index:2147483647;background:#0b0c10;color:#c9d4e2;font:11px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;border:1px solid #3d4a5c;border-radius:6px;padding:3px 7px;max-width:78px;max-height:19px;overflow:hidden;opacity:.92;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.45);transition:max-width .15s ease,max-height .15s ease}#${badgeId}:hover,#${badgeId}.pinned{max-width:min(560px,82vw);max-height:340px}`
    style.textContent = style.textContent.replace('#3d4characters', '#3d4a5c')
    document.head.appendChild(style)
  }
  badge = document.createElement('div')
  badge.id = badgeId
  badge.title = 'Dictation probe: click to keep it open, hover to read'
  badge.addEventListener('click', () => {
    badgePinned = !badgePinned
    badge.classList.toggle('pinned', badgePinned)
  })
  document.body.appendChild(badge)
  return badge
}

function renderBadge() {
  if (!badgeVisible) return
  const badge = ensureBadge()
  if (!badge) return
  const body = lines.slice(-12).map(entry => entry.replace(/^\d\d:\d\d:\d\d\.\d\d\d \| /, '')).join('\n')
  badge.textContent = `PROBE (${lines.length})\n${body}`
}

function show(text: string) {
  const line = `${stamp()} | ${text}`
  lines.push(line)
  while (lines.length > maxLines) lines.shift()
  persist()
  renderBadge()
}

/** The keys worth recording: the dictation chord and its modifiers, plus any
 *  packet (the text Windows injects as unicode). */
function interesting(event: KeyboardEvent): boolean {
  if (event.keyCode === 229 || event.key === 'Unidentified') return true
  if (event.ctrlKey || event.altKey || event.metaKey) return true
  return event.code === 'KeyT' || event.code === 'ControlLeft' || event.code === 'ControlRight'
}

/** Shows or hides the on-screen badge. The recording is unaffected. */
export function setDictationProbeBadge(visible: boolean) {
  badgeVisible = visible
  if (!visible) { document.getElementById(badgeId)?.remove(); return }
  renderBadge()
}

/** Stops the probe and removes everything it put on the screen. */
export function uninstallDictationProbe() {
  const host = window as ProbeHost
  host.__pkoDictationProbe?.()
}

/** Starts the probe. It replaces an earlier instance, so a hot update never
 *  leaves two of them listening. */
export function installDictationProbe(options: ProbeOptions = {}) {
  const host = window as ProbeHost
  host.__pkoDictationProbe?.()

  const onKeyDown = (event: KeyboardEvent) => {
    if (!interesting(event)) return
    show(`keydown code=${event.keyCode} key=${event.key || '-'} ctrl=${event.ctrlKey ? 1 : 0} shift=${event.shiftKey ? 1 : 0} alt=${event.altKey ? 1 : 0} composing=${event.isComposing ? 1 : 0} target=${target(event)}`)
    // After the event has been through every listener: was it cancelled?
    window.setTimeout(() => show(`  ^ after: defaultPrevented=${event.defaultPrevented ? 1 : 0}`), 0)
  }
  const onKeyUp = (event: KeyboardEvent) => {
    if (!interesting(event)) return
    show(`keyup   code=${event.keyCode} key=${event.key || '-'} ctrl=${event.ctrlKey ? 1 : 0} target=${target(event)}`)
  }
  const onKeyPress = (event: KeyboardEvent) => {
    if (event.keyCode !== 229 && event.charCode < 32) return
    show(`keypress code=${event.keyCode} char=${event.charCode} key=${event.key || '-'} target=${target(event)}`)
  }
  const onInput = (event: InputEvent) => {
    if (event.inputType !== 'insertText' && event.inputType !== 'insertCompositionText') return
    show(`beforeinput type=${event.inputType} data=${JSON.stringify(event.data || '')} composing=${event.isComposing ? 1 : 0} target=${target(event)}`)
    window.setTimeout(() => show(`  ^ after: defaultPrevented=${event.defaultPrevented ? 1 : 0}`), 0)
  }
  const onFocus = () => {
    const active = document.activeElement as HTMLElement | null
    const name = active ? active.tagName.toLowerCase() + (active.className ? '.' + String(active.className).split(' ')[0] : '') : 'none'
    show(`focus ${name}`)
  }
  window.addEventListener('keydown', onKeyDown, true)
  window.addEventListener('keyup', onKeyUp, true)
  window.addEventListener('keypress', onKeyPress, true)
  window.addEventListener('beforeinput', onInput, true)
  document.addEventListener('focusin', onFocus, true)
  window.setTimeout(onFocus, 400)
  show(`probe armed surface=${surfaceName()} origin=${location.origin}`)
  const stop = () => {
    window.removeEventListener('keydown', onKeyDown, true)
    window.removeEventListener('keyup', onKeyUp, true)
    window.removeEventListener('keypress', onKeyPress, true)
    window.removeEventListener('beforeinput', onInput, true)
    document.removeEventListener('focusin', onFocus, true)
    document.getElementById(badgeId)?.remove()
    if (host.__pkoDictationProbe === stop) delete host.__pkoDictationProbe
  }
  host.__pkoDictationProbe = stop
  if (options.badge) setDictationProbeBadge(true)
  renderBadge()
  return stop
}
