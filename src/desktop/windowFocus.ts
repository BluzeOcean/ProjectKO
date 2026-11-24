/**
 * Whether this Project KO window is the one the person is working in.
 *
 * Toxic is a machine-wide tool: its chord opens a take wherever the focus is,
 * and its words are typed into that same window with SendInput. Project KO has
 * to know whether the words of a take belong to this window, so this module
 * answers two questions: is the window focused now, and since when has it been
 * focused without a break?
 *
 * Two signals are watched, because either one alone is thin. The window's own
 * focus and blur events say what the operating system did with this window; the
 * document's focus state says what the page believes. A web view behind another
 * window can still report a focused document, so once an event has arrived the
 * events are believed, and the document answers only while none has.
 */

export interface FocusHost {
  addEventListener(type: 'focus' | 'blur', listener: () => void): void
  hasFocus(): boolean
}

export interface WindowFocus {
  /** Whether this window holds the focus right now. */
  focused(): boolean
  /** When the current focus period began. */
  since(): number
}

export function createWindowFocus(host: FocusHost | null, now: () => number = Date.now): WindowFocus {
  // How many focus events the window has delivered. Zero means the window has
  // not said anything yet, and the document has to answer on its own.
  let events = 0
  let eventFocused = false
  let documentFocused = host ? host.hasFocus() : false
  let since = now()

  host?.addEventListener('focus', () => {
    events += 1
    // A focus event without a blur in between does not start a new period.
    if (!eventFocused) since = now()
    eventFocused = true
  })
  host?.addEventListener('blur', () => { events += 1; eventFocused = false })

  const focused = () => {
    if (events) return eventFocused
    const has = host ? host.hasFocus() : false
    if (has !== documentFocused) {
      documentFocused = has
      // The window gained the focus: the period starts now.
      if (has) since = now()
    }
    return documentFocused
  }
  return { focused, since: () => since }
}

const browserHost: FocusHost | null = typeof window === 'undefined' ? null : {
  addEventListener: (type, listener) => { window.addEventListener(type, listener) },
  hasFocus: () => document.hasFocus(),
}

export const windowFocus = createWindowFocus(browserHost)
