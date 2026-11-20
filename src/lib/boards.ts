// A board keeps its own colour for as long as it exists. The hue is derived
// from the board's id, so it never changes between sessions and a new board
// never repaints the ones beside it.
const HUES = ['amber', 'pink', 'blue', 'purple', 'green'] as const

export interface BoardHue {
  bg: string
  ink: string
}

// The ink follows the accent of the running theme, so a mark stays readable
// whether the palette is dark or light.
const INK = 'var(--on-accent, #101115)'

export function boardHue(id: string): BoardHue {
  let hash = 0x811c9dc5
  for (let index = 0; index < id.length; index++) {
    hash ^= id.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return { bg: `var(--${HUES[hash % HUES.length]})`, ink: INK }
}
