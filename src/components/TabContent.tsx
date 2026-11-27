import { useEffect, useRef, useState } from 'react'
import { sourceUrl, type CardBlock, type TabDocument } from '../../desktop/service/vault-schema.mjs'
import { MarkdownView } from './MarkdownDocument'
import { ZoomImage } from './ImagePreview'
import { statusLabels } from '../lib/card-labels'
import { cardStarts, runsOf, type Where } from '../lib/blocks'
import Pinboard from './Pinboard'
import '../styles/editable-cards.css'
export type { Where }

function CardFrame({ card, baseUrl, index }: { card: CardBlock; baseUrl: string; index: number }) {
  return <section className={'card-entry' + (card.wide ? ' wide' : '')} key={card.id} data-card-id={card.id}>
    {card.image && <div className="card-entry-image"><ZoomImage src={new URL(card.image, baseUrl).href} alt={card.alt || card.title} /></div>}
    <div className="card-entry-copy">
      <div className="card-entry-meta">
        <span className="card-entry-number">{String(index + 1).padStart(2, '0')}</span>
        {card.status && <span className={'card-entry-status status-' + card.status}>{statusLabels[card.status]}</span>}
      </div>
      <h2>{card.title}</h2>
      {card.body && <div className="card-prose"><MarkdownView text={card.body} baseUrl={baseUrl} /></div>}
      {sourceUrl(card.url) && <a className="card-source" href={sourceUrl(card.url)} target="_blank" rel="noopener noreferrer">{card.linkLabel || 'Source'} <span aria-hidden="true">↗</span></a>}
      {card.prompt && <details className="card-prompt"><summary>Prompt</summary><pre>{card.prompt}</pre></details>}
    </div>
  </section>
}

/** The nearest ancestor that scrolls, so the rail can follow the reader. */
function findScroller(node: HTMLElement): HTMLElement | null {
  let parent = node.parentElement
  while (parent) {
    const style = getComputedStyle(parent)
    if (/(auto|scroll)/.test(style.overflowY) && parent.scrollHeight > parent.clientHeight + 4) return parent
    parent = parent.parentElement
  }
  return null
}

export default function TabContent({ document, baseUrl, where, onFeedback, onSave }: {
  document: TabDocument
  baseUrl: string
  where?: Where
  onFeedback?: (cardId: string, text: string) => void
  onSave?: (document: TabDocument) => Promise<boolean>
}) {
  const base = new URL(baseUrl, window.location.href).href
  const cards = document.nodes.filter((node): node is CardBlock => node.kind === 'card')
  const runs = runsOf(document)
  const head = <header className="card-document-heading">
    <div className="card-kicker"><span>{document.layout}</span><span>{cards.length} {cards.length === 1 ? 'card' : 'cards'}</span></div>
    {document.summary && <div className="card-prose card-introduction"><MarkdownView text={document.summary} baseUrl={base} /></div>}
  </header>

  const starts = cardStarts(runs)
  // A long document needs a way in: a rail of its own sections, sticky beside
  // the text, marking the section the reader is in. Only for a tab with enough
  // sections to be worth navigating.
  const index = runs.filter(run => run.section).map(run => run.section!)
  const withIndex = index.length >= 4
  const anchor = (id: string) => 'card-section-' + id

  const bodyRef = useRef<HTMLDivElement | null>(null)
  const [active, setActive] = useState('')
  useEffect(() => {
    const root = bodyRef.current
    if (!root) return
    const heads = Array.from(root.querySelectorAll<HTMLElement>('.tab-section'))
    if (!heads.length) return
    const scroller = findScroller(root)
    const update = () => {
      const offset = scroller ? scroller.getBoundingClientRect().top + 140 : 140
      let current = heads[0]
      for (const head of heads) {
        if (head.getBoundingClientRect().top <= offset) current = head
      }
      setActive(current.dataset.section || '')
    }
    update()
    const target: HTMLElement | Window = scroller || window
    target.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      target.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [document])

  if (document.layout === 'pinboard') return <article className="card-content card-template-pinboard">
    {head}
    <Pinboard document={document} baseUrl={base} where={where} onFeedback={onFeedback} onSave={onSave} />
  </article>


  return <article className={'card-content card-template-' + document.layout + (withIndex ? ' has-index' : '')}>
    {head}
    <div className="card-body">
      {withIndex && <nav className="card-index" aria-label="Sections">
        <p className="card-index-title">Sections</p>
        {index.map(section => <a key={section.id} href={'#' + anchor(section.id)} data-section={section.id}
          className={active === section.id ? 'on' : ''}
          onClick={event => {
            event.preventDefault()
            const target = window.document.getElementById(anchor(section.id))
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }}>{section.title}</a>)}
      </nav>}
      <div className="card-body-main" ref={bodyRef}>
        {runs.map((run, at) => <section className="tab-run" key={run.section?.id ?? 'lead-' + at}>
          {run.section && <header className="tab-section" id={anchor(run.section.id)} data-section={run.section.id}>
            <h2>{run.section.title}</h2>
            {run.section.note && <div className="card-prose tab-section-note"><MarkdownView text={run.section.note} baseUrl={base} /></div>}
          </header>}
          <div className="card-entries">
            {run.cards.map((card, index) => <CardFrame key={card.id} card={card} baseUrl={base} index={starts[at] + index} />)}
          </div>
        </section>)}
        {!cards.length && <p className="card-empty">No cards yet.</p>}
      </div>
    </div>
  </article>
}
