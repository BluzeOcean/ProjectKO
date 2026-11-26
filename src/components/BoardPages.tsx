import { useState, type ReactNode } from 'react'
import type { Board, Page, PageTag } from '../types'
import { boardHue } from '../lib/boards'
import { pageHash } from '../lib/route'
import { pageIcon, pageTagLabel, pageTagLabels } from '../lib/categories'
import { deletePage, updatePage } from '../lib/workspace'
import { pageUrl, isDesktop } from '../desktop/client'
import { Icon } from '../desktop/Icons'
import TileDeck, { type Tile } from './TileDeck'
import DeleteDialog from './DeleteDialog'
import NewPage from './NewPage'

/**
 * A board's own grid: its pages, drawn by the same component as the Vaultspace.
 * A page is a folder for one topic - its tabs, its media and its tags.
 */

function PageInspector({ board, page, onDeleted }: { board: Board; page: Page; onDeleted: (page: Page) => void }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)

  async function save(patch: Parameters<typeof updatePage>[2]) {
    if (saving) return
    setSaving(true); setError('')
    try { await updatePage(board.id, page.id, patch) } catch (reason) { setError(reason instanceof Error ? reason.message : 'The page could not be updated. Try again.') } finally { setSaving(false) }
  }

  const toggleTag = (tag: PageTag) => {
    const next = page.tags.includes(tag) ? page.tags.filter(value => value !== tag) : [...page.tags, tag]
    void save({ tags: next })
  }

  return <>
    <header className="deck-insp-head">
      <h2 className="deck-insp-title">{page.title}</h2>
      <span className="deck-insp-meta">{page.updated ?? page.created}</span>
    </header>
    {page.description && <p className="deck-insp-desc">{page.description}</p>}

    <div className="deck-tags">
      <div className="deck-tag-label">Tags</div>
      <div className="deck-tag-options">
        {(Object.keys(pageTagLabels) as PageTag[]).map(value => (
          <button
            key={value}
            type="button"
            className={'deck-tag-option' + (page.tags.includes(value) ? ' on' : '')}
            aria-pressed={page.tags.includes(value)}
            disabled={!isDesktop || saving}
            title={isDesktop ? 'Tag this page ' + pageTagLabel(value) : 'Open the desktop app to change the tag'}
            onClick={() => toggleTag(value)}
          >
            {pageTagLabel(value)}
          </button>
        ))}
      </div>
      {error && <p className="deck-tag-error" role="alert">{error}</p>}
    </div>

    <footer className="deck-insp-foot">
      <div className="deck-facts">
        <div className="deck-fact"><b>Tabs</b><span>{page.tabs.length}</span></div>
        <div className="deck-fact"><b>Created</b><span>{page.created}</span></div>
        <div className="deck-fact"><b>Updated</b><span>{page.updated ?? '—'}</span></div>
        <div className="deck-fact"><b>Folder</b><span>{board.folder}/{page.id}</span></div>
      </div>
      <div className="deck-insp-actions">
        <a className="deck-insp-action" href={pageHash(board.id, page.id)}>Open page</a>
        <button
          type="button"
          className="deck-insp-delete"
          aria-label={'Delete ' + page.title}
          aria-haspopup="dialog"
          title={isDesktop ? 'Delete ' + page.title : 'Open the desktop app to delete a page'}
          disabled={!isDesktop}
          onClick={() => setConfirming(true)}
        >
          <Icon name="trash" size={14} />
        </button>
      </div>
    </footer>
    {confirming && <DeleteDialog
      label="Delete this page?"
      name={page.title}
      facts={[
        { label: 'Tabs', value: page.tabs.length ? page.tabs.map(tab => tab.name).join(', ') : 'none yet' },
        { label: 'Folder', value: board.folder + '/' + page.id },
      ]}
      warning="The files in this page's folder go with it. The board and its other pages stay."
      onDelete={async () => { await deletePage(board.id, page.id); onDeleted(page) }}
      onClose={() => setConfirming(false)}
    />}
  </>
}

export default function BoardPages({ board }: { board: Board }) {
  const [activeTag, setActiveTag] = useState('all')
  const [note, setNote] = useState<ReactNode>('')
  const tags = [...new Set(board.pages.flatMap(page => page.tags))]
  const shown = activeTag === 'all' ? board.pages : board.pages.filter(page => page.tags.some(tag => tag === activeTag))
  const tiles: Tile[] = shown.map(page => ({
    id: page.id,
    href: pageHash(board.id, page.id),
    title: page.title,
    subtitle: page.tabs.length + (page.tabs.length === 1 ? ' tab' : ' tabs'),
    glyph: pageIcon(page.tags),
    hue: boardHue(board.id + '/' + page.id),
    image: page.icon ? pageUrl(board.folder, page.id, page.icon) : undefined,
    tags: page.tags,
  }))
  const tabs = board.pages.reduce((total, page) => total + page.tabs.length, 0)

  return <TileDeck
    bannerTitle={board.title}
    bannerRight={isDesktop ? <NewPage board={board} label="+ New page" className="deck-new-board" /> : undefined}
    tags={tags}
    labels={pageTagLabels as Record<string, string>}
    activeTag={activeTag}
    onTag={setActiveTag}
    stageLabel="Pages"
    tiles={tiles}
    emptyText={board.pages.length ? 'No page carries this tag.' : 'No page yet. A page is a folder for one topic - make the first one.'}
    note={note}
    inspector={tile => {
      const page = tile ? board.pages.find(item => item.id === tile.id) : undefined
      if (!page) return <p className="deck-empty">No page to describe.</p>
      return <PageInspector key={board.id + '/' + page.id} board={board} page={page} onDeleted={value => setNote(<><b>{value.title}</b> deleted. Its folder went with it.</>)} />
    }}
    status={<><b>{board.pages.length}</b> page{board.pages.length === 1 ? '' : 's'} · <b>{tabs}</b> tab{tabs === 1 ? '' : 's'}</>}
  />
}
