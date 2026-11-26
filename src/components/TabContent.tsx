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

  if (document.layout === 'pinboard') return <article className="card-content card-template-pinboard">
    {head}
    <Pinboard document={document} baseUrl={base} where={where} onFeedback={onFeedback} onSave={onSave} />
  </article>

  const starts = cardStarts(runs)
  return <article className={'card-content card-template-' + document.layout}>
    {head}
    {runs.map((run, at) => <section className="tab-run" key={run.section?.id ?? 'lead-' + at}>
      {run.section && <header className="tab-section">
        <h2>{run.section.title}</h2>
        {run.section.note && <div className="card-prose tab-section-note"><MarkdownView text={run.section.note} baseUrl={base} /></div>}
      </header>}
      <div className="card-entries">
        {run.cards.map((card, index) => <CardFrame key={card.id} card={card} baseUrl={base} index={starts[at] + index} />)}
      </div>
    </section>)}
    {!cards.length && <p className="card-empty">No cards yet.</p>}
  </article>
}
