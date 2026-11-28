import { useState, type ReactNode } from 'react'
import '../styles/workspace-deck.css'

/**
 * The one thumbnail grid. The Vaultspace draws boards with it and a board draws
 * its pages with it, so the two levels behave the same: a banner, a tag row, a
 * wall of tiles and an inspector column that describes the tile you are on.
 *
 * The caller supplies the tiles, the tag vocabulary and the inspector, because
 * a board and a page do not carry the same facts.
 *
 * The counts live on the head of the wall - the level, how many are on screen,
 * and what is inside them. There is no band at the foot of the stage: the same
 * number twice, in two places, is noise.
 */

export interface Tile {
  id: string
  href: string
  title: string
  /** "3 pages" or "2 tabs" - the one number the tile carries. */
  subtitle: string
  glyph: string
  hue: { bg: string; ink: string }
  /** A thumbnail, when the tile has one; the glyph is the fallback. */
  image?: string
  tags: string[]
}

export interface TileDeckProps {
  bannerTitle: string
  bannerRight?: ReactNode
  tags: string[]
  labels: Record<string, string>
  activeTag: string
  onTag: (tag: string) => void
  bannerBottomExtra?: ReactNode
  stageLabel: string
  /** The rest of the level's facts, beside the count: "· 11 tabs". */
  stageFacts?: ReactNode
  tiles: Tile[]
  emptyText: string
  searching?: boolean
  query?: string
  offline?: boolean
  inspector: (focus: Tile | null) => ReactNode
  note?: ReactNode
}

export default function TileDeck({
  bannerTitle, bannerRight, tags, labels, activeTag, onTag, bannerBottomExtra,
  stageLabel, stageFacts, tiles, emptyText, searching, query, offline, inspector, note,
}: TileDeckProps) {
  const [focusId, setFocusId] = useState<string | null>(null)
  // The tile being described. A tag that hides the focused tile hands the
  // column to the first one that is still there.
  const focus = tiles.find(tile => tile.id === focusId) ?? tiles[0] ?? null

  return (
    <div className="deck">
      <header className="deck-banner">
        <div className="deck-banner-text">
          <h1 className="deck-banner-title">{bannerTitle}</h1>
        </div>
        {bannerRight && <div className="deck-banner-right">{bannerRight}</div>}
        <div className="deck-banner-bottom">
          <div className="deck-genres" role="group" aria-label="Filter by tag">
            <button
              type="button"
              className={'deck-genre' + (activeTag === 'all' ? ' active' : '')}
              aria-pressed={activeTag === 'all'}
              onClick={() => onTag('all')}
            >
              All
            </button>
            {tags.map(value => (
              <button
                key={value}
                type="button"
                className={'deck-genre' + (activeTag === value ? ' active' : '')}
                aria-pressed={activeTag === value}
                onClick={() => onTag(value)}
              >
                {labels[value] ?? value}
              </button>
            ))}
          </div>
          {bannerBottomExtra}
        </div>
      </header>

      <div className="deck-page">
        <section className="deck-stage">
          <div className="deck-stage-head">
            <span className="deck-label">{stageLabel}</span>
            <span className="deck-stage-count">{tiles.length}</span>
            {stageFacts && <span className="deck-stage-facts">{stageFacts}</span>}
            {searching && <span className="deck-stage-note">matching “{query?.trim()}”</span>}
            {offline && <span className="deck-offline">workspace.json unreachable</span>}
          </div>

          <div className="deck-tiles">
            {tiles.map(tile => (
              <a
                key={tile.id}
                href={tile.href}
                data-card={tile.id}
                data-tile={tile.id}
                className={'deck-tile' + (focus?.id === tile.id ? ' active' : '')}
                onMouseEnter={() => setFocusId(tile.id)}
                onFocus={() => setFocusId(tile.id)}
              >
                <span className="deck-mark" style={{ background: tile.hue.bg, color: tile.hue.ink }} aria-hidden="true">
                  {tile.image ? <img className="deck-mark-image" src={tile.image} alt="" loading="lazy" /> : tile.glyph}
                </span>
                <span className="deck-tile-name">{tile.title}</span>
                <span className="deck-tile-count">
                  {tile.subtitle}
                  <span className="deck-tile-open" aria-hidden="true">→</span>
                </span>
              </a>
            ))}
          </div>

          {!tiles.length && <p className="deck-empty">{emptyText}</p>}
          {note && <p className="deck-note">{note}</p>}
        </section>

        <aside className="deck-inspector" aria-label="Details" data-card={focus?.id}>
          {inspector(focus)}
        </aside>
      </div>
    </div>
  )
}
