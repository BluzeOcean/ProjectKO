import { boardTagLabels, pageTagLabels } from '../../desktop/service/vault-schema.mjs'

const BOARD_ICONS: Record<string, string> = {
  research: '\u{1F50D}',
  'game-project': '\u{1F3AE}',
  gallery: '\u{1F3A8}',
  'app-project': '\u{1F6E0}\u{FE0F}',
}

const PAGE_ICONS: Record<string, string> = {
  'game-mechanics': '\u2699\uFE0F',
  'game-idea': '\u{1F4A1}',
  ui: '\u{1F5A5}\u{FE0F}',
  sound: '\u{1F50A}',
  '3d': '\u{1F9CA}',
  '2d': '\u270F\uFE0F',
  animation: '\u{1F39E}\uFE0F',
}

const FOLDER = '\u{1F4C1}'

const title = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)

/* The words the Vault shows for a tag. The vocabulary itself lives in the
   schema, so the panels, the filter row and the service cannot drift apart. */
export const boardTagLabel = (tag: string): string => (boardTagLabels as Record<string, string>)[tag] ?? title(tag || 'Other')
export const pageTagLabel = (tag: string): string => (pageTagLabels as Record<string, string>)[tag] ?? title(tag || 'Other')

/** The glyph on a tile: the first tag's, or a folder when it has none. */
export const boardIcon = (tags: string[]): string => BOARD_ICONS[tags[0]] ?? FOLDER
export const pageIcon = (tags: string[]): string => PAGE_ICONS[tags[0]] ?? FOLDER

/** Every tag a grid can offer, in the order the schema lists them. */
export { boardTagLabels, pageTagLabels }
