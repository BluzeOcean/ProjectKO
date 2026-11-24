// Toxic's dictation chord, as Toxic itself writes it in its config: "Ctrl+T".
//
// The owner can rebind the chord in Toxic, so nothing here assumes one
// combination. The service reads the label from Toxic's config
// (`toxicShortcut()` in desktop/service/toxic-launch.mjs) and hands it to the
// windows, which then answer the same chord Toxic would.

export interface Chord {
  ctrl: boolean
  alt: boolean
  shift: boolean
  meta: boolean
  key: string
}

/** Parse a chord label such as "Ctrl+T", "Ctrl+Shift+Space" or "Alt+T". */
export function parseChord(value: string | null | undefined): Chord | null {
  const parts = String(value || '').split('+').map(part => part.trim()).filter(Boolean)
  if (parts.length < 2) return null
  const chord: Chord = { ctrl: false, alt: false, shift: false, meta: false, key: parts[parts.length - 1].toLowerCase() }
  for (const part of parts.slice(0, -1)) {
    const name = part.toLowerCase()
    if (name === 'ctrl' || name === 'control') chord.ctrl = true
    else if (name === 'alt' || name === 'option') chord.alt = true
    else if (name === 'shift') chord.shift = true
    else if (name === 'win' || name === 'meta' || name === 'cmd' || name === 'super') chord.meta = true
    else return null
  }
  return chord
}

/**
 * Whether a key event is exactly this chord.
 *
 * The modifiers have to match one for one, the way Toxic matches them: Ctrl+T
 * never fires for Ctrl+Shift+T. The key itself is matched by name and by code,
 * so a layout that names the key differently still answers.
 */
export function matchesChord(event: KeyboardEvent, chord: Chord | null): boolean {
  if (!chord) return false
  if (event.type !== 'keydown') return false
  if (event.ctrlKey !== chord.ctrl || event.altKey !== chord.alt || event.shiftKey !== chord.shift || event.metaKey !== chord.meta) return false
  const key = (event.key || '').toLowerCase()
  const code = (event.code || '').toLowerCase()
  return key === chord.key || code === chord.key || code === `key${chord.key}`
}

/**
 * The chord Project KO falls back to when Toxic has not published one, so the
 * control character never reaches a CLI that cannot use it. It is also the
 * chord Toxic has used by default.
 */
export const fallbackChord: Chord = { ctrl: true, alt: false, shift: false, meta: false, key: 't' }
