import { useCallback, useEffect, useMemo, useState } from 'react'
import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { sourceUrl, type CardBlock, type TabDocument } from '../../desktop/service/vault-schema.mjs'
import { ZoomImage } from './ImagePreview'
import { statusLabels } from '../lib/card-labels'
import { runsOf } from '../lib/blocks'
import '../styles/document.css'

/**
 * The four document layouts: Codex, Margin, PPT and Folio.
 *
 * The card layouts answer "how are the cards arranged?". These answer
 * a different question — "how does a reader move through a long
 * document, and what does the page do in their hands?" — so a tab
 * chosen as one of these is read rather than scanned.
 *
 * The document is the same flat list of blocks the editor edits. A
 * heading is a section, a card is a block of prose, and a card's notes
 * are Markdown, so a table or a piece of code inside a card is a table
 * or a piece of code on the page.
 */

type DocumentLayoutName = 'codex' | 'margin' | 'ppt' | 'folio'

interface DocSection {
  id: string
  number: string
  title: string
  note?: string
  cards: CardBlock[]
}

/* ── Text ──────────────────────────────────────────────────────── */

/** Markdown without the markup — for a rail that wants a sentence. */
function plainText(markdown?: string): string {
  if (!markdown) return ''
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s*[>#*-]+\s*/gm, '')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** The rail's abstract: the opening of the summary, in a breath.
 *
 *  A reading room's rail says what the page is before the contents
 *  begin; a paragraph there is a wall in front of them. The cap is two
 *  sentences and twenty words, and an author who writes the opening as
 *  a whole sentence never sees it bite. */
const ABSTRACT_WORDS = 20;

function abstractFrom(markdown?: string): string {
  if (!markdown) return ''
  /* A summary that opens with a heading is introducing the document,
     not describing it: the heading has no place in the abstract. */
  const text = plainText(markdown.replace(/^\s*#{1,6}[^\n]*\n+/, ''))
  if (!text) return ''
  const sentences = text.split(/(?<=[.!?])\s+(?=["'“]?[A-Z0-9])/)
  const words = (value: string) => value.split(/\s+/).filter(Boolean)
  const kept: string[] = []
  let count = 0
  for (const sentence of sentences) {
    const size = words(sentence).length
    if (kept.length && count + size > ABSTRACT_WORDS) break
    kept.push(sentence)
    count += size
    if (count >= ABSTRACT_WORDS) break
  }
  const abstract = words(kept.join(' '))
  if (abstract.length <= ABSTRACT_WORDS) return abstract.join(' ')
  return abstract.slice(0, ABSTRACT_WORDS).join(' ') + '…'
}

const CALLOUT_MARKER = /^\[!(NOTE|TIP|DECISION|WARNING|QUESTION|CAUTION)\]\s*(.*)$/i
const CALLOUT_TITLES: Record<string, string> = {
  note: 'Note', tip: 'Tip', decision: 'Decision',
  warning: 'Warning', question: 'Open question', caution: 'Caution',
}
/* The two that read as an interruption rather than an explanation.
   In the Margin layout these are the ones that leave the text. */
const CALLOUT_FLOATS = new Set(['warning', 'question'])

type Segment =
  | { kind: 'text'; body: string }
  | { kind: 'callout'; tone: string; title: string; body: string }

/**
 * Split a card's notes into prose and asides.
 *
 * An aside is a blockquote that opens with a marker — `> [!WARNING]`
 * and so on. The marker names the kind; the rest of its line is the
 * title; the lines under it are the body.
 */
function segments(text: string): Segment[] {
  const out: Segment[] = []
  let buffer: string[] = []
  let callout: { tone: string; title: string; body: string[] } | null = null

  const flush = () => {
    if (buffer.length) { out.push({ kind: 'text', body: buffer.join('\n') }); buffer = [] }
  }
  const close = () => {
    if (!callout) return
    out.push({ kind: 'callout', tone: callout.tone, title: callout.title, body: callout.body.join('\n') })
    callout = null
  }

  for (const line of text.split('\n')) {
    const quoted = line.match(/^>\s?(.*)$/)
    if (callout) {
      if (quoted) { callout.body.push(quoted[1]); continue }
      close()
      continue
    }
    if (quoted) {
      const marker = quoted[1].match(CALLOUT_MARKER)
      if (marker) {
        flush()
        callout = { tone: marker[1].toLowerCase(), title: marker[2].trim(), body: [] }
        continue
      }
    }
    buffer.push(line)
  }
  close()
  flush()
  return out
}

/* ── The Markdown ──────────────────────────────────────────────── */

function DocMarkdown({ text, baseUrl }: { text: string; baseUrl: string }) {
  const base = new URL(baseUrl, window.location.href).href
  const components: Components = {
    a: ({ href, children }) => <a href={href?.startsWith('#') ? href : href && base ? new URL(href, base).href : href} target={href?.startsWith('#') ? undefined : '_blank'} rel="noreferrer">{children}</a>,
    img: ({ src, alt }) => <ZoomImage src={typeof src === 'string' ? (base ? new URL(src, base).href : src) : undefined} alt={alt} />,
    table: ({ children }) => <div className="doc-table-wrap"><table className="doc-table">{children}</table></div>,
    code: ({ className, children }) => /language-/.test(className || '')
      ? <code className={className}>{children}</code>
      : <code className="doc-inline-code">{children}</code>,
    pre: ({ children }) => <div className="doc-code"><pre>{children}</pre></div>,
  }
  return <>{segments(text).map((segment, index) => {
    if (segment.kind === 'text') return <Markdown key={index} remarkPlugins={[remarkGfm]} components={components}>{segment.body}</Markdown>
    return <div key={index} className="doc-callout" data-tone={segment.tone} data-float={CALLOUT_FLOATS.has(segment.tone) ? 'true' : undefined}>
      <div className="doc-callout-title">{segment.title || CALLOUT_TITLES[segment.tone] || 'Note'}</div>
      <Markdown remarkPlugins={[remarkGfm]} components={components}>{segment.body}</Markdown>
    </div>
  })}</>
}

/* ── The pieces ────────────────────────────────────────────────── */

function DocCard({ card, baseUrl }: { card: CardBlock; baseUrl: string }) {
  const href = sourceUrl(card.url)
  return <article className="doc-card" id={'doc-card-' + card.id}>
    <div className="doc-card-head">
      <h3 className="doc-card-title">{card.title}</h3>
      {card.status && <span className={'doc-badge status-' + card.status}>{statusLabels[card.status]}</span>}
    </div>
    {card.body && <div className="doc-prose"><DocMarkdown text={card.body} baseUrl={baseUrl} /></div>}
    {card.image && <figure className="doc-figure">
      <ZoomImage src={new URL(card.image, baseUrl).href} alt={card.alt || card.title} />
      {card.alt && <figcaption>{card.alt}</figcaption>}
    </figure>}
    {href && <a className="doc-source" href={href} target="_blank" rel="noopener noreferrer">{card.linkLabel || 'Source'} <span aria-hidden="true">↗</span></a>}
  </article>
}

function DocHead({ doc, title, baseUrl }: { doc: TabDocument; title: string; baseUrl: string }) {
  const cards = doc.nodes.filter(node => node.kind === 'card').length
  const sections = doc.nodes.filter(node => node.kind === 'section').length
  return <header className="doc-head">
    <div className="doc-kicker">
      <span>{title}</span>
      <span>{cards} {cards === 1 ? 'card' : 'cards'}</span>
      <span>{sections} {sections === 1 ? 'section' : 'sections'}</span>
    </div>
    {doc.summary && <div className="doc-summary"><DocMarkdown text={doc.summary} baseUrl={baseUrl} /></div>}
  </header>
}

/* ── The rail ──────────────────────────────────────────────────── */

function DocRail({ sections, active, title, note, summary }: {
  sections: DocSection[]
  active: string
  title: string
  note: string
  summary?: string
}) {
  const abstract = abstractFrom(summary)
  return <aside className="doc-rail">
    <div className="doc-rail-title">{title}</div>
    <div className="doc-rail-sub">{note}</div>
    {abstract && <p className="doc-rail-abstract">{abstract}</p>}
    <nav aria-label="Contents">
      <div className="doc-toc-label">Contents</div>
      <ul className="doc-toc">
        {sections.map(section => <li key={section.id}>
          <a className="doc-toc-link" href={'#doc-' + section.id} data-target={section.id}
            aria-current={active === section.id ? 'true' : undefined}
            onClick={event => {
              event.preventDefault()
              window.document.getElementById('doc-' + section.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }}>
            <span className="n">{section.number}</span>{section.title}
          </a>
        </li>)}
      </ul>
    </nav>
  </aside>
}

/* ── The dot rail ──────────────────────────────────────────────── */

function DocDots({ sections, active, onGo }: { sections: DocSection[]; active: string; onGo: (id: string) => void }) {
  return <nav className="doc-dots" aria-label="Sections">
    {sections.map(section => <button key={section.id} type="button" className="doc-dot" data-target={section.id}
      aria-current={active === section.id ? 'true' : undefined}
      aria-label={section.title}
      onClick={() => onGo(section.id)}>
      <span className="doc-dot-label"><span className="n">{section.number}</span>{section.title}</span>
      <span className="doc-dot-bar" />
    </button>)}
  </nav>
}

/* ── The scroll spy ────────────────────────────────────────────── */

function useScrollSpy(ids: string[], scroller: HTMLElement | null) {
  const [active, setActive] = useState('')
  useEffect(() => {
    if (!scroller || !ids.length) return
    const nodes = ids
      .map(id => scroller.querySelector<HTMLElement>('[data-doc-section="' + id + '"]'))
      .filter((node): node is HTMLElement => !!node)
    if (!nodes.length) return
    const update = () => {
      const line = scroller.getBoundingClientRect().top + 140
      let current = nodes[0]
      for (const node of nodes) if (node.getBoundingClientRect().top <= line) current = node
      /* The foot of the document is its own case: the last section
         cannot scroll its heading above the line, so it would never
         become the current one. */
      if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2) current = nodes[nodes.length - 1]
      setActive(current.dataset.docSection || '')
    }
    update()
    scroller.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => { scroller.removeEventListener('scroll', update); window.removeEventListener('resize', update) }
  }, [ids, scroller])
  return active
}

/* ── The document ──────────────────────────────────────────────── */

function buildSections(doc: TabDocument): DocSection[] {
  return runsOf(doc).map((run, index) => ({
    id: run.section?.id ?? 'lead-' + index,
    number: String(index + 1).padStart(2, '0'),
    title: run.section?.title ?? '',
    note: run.section?.note,
    cards: run.cards,
  }))
}

function DocSectionBody({ section, baseUrl }: { section: DocSection; baseUrl: string }) {
  return <section className="doc-section" id={'doc-' + section.id} data-doc-section={section.id}>
    <div className="doc-section-number">{section.number}</div>
    <h2 className="doc-section-title">{section.title}</h2>
    {section.note && <div className="doc-section-note"><DocMarkdown text={section.note} baseUrl={baseUrl} /></div>}
    {section.cards.map(card => <DocCard key={card.id} card={card} baseUrl={baseUrl} />)}
  </section>
}

export default function DocumentLayout({ document, baseUrl, title }: {
  document: TabDocument
  baseUrl: string
  title?: string
}) {
  const layout = document.layout as DocumentLayoutName
  const sections = useMemo(() => buildSections(document), [document])
  const ids = useMemo(() => sections.map(section => section.id), [sections])
  const heading = title || 'Document'

  /* The scroller is a state, not a ref: the spy needs to attach to it
     once it exists, and a ref would read null on the first render. */
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null)
  const active = useScrollSpy(ids, layout === 'ppt' ? null : scroller)

  const goTo = (id: string) => {
    scroller?.querySelector<HTMLElement>('[data-doc-section="' + id + '"]')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  /* ── PPT: one section per slide, and the bar that follows ───── */
  const [slide, setSlide] = useState(0)
  const goSlide = useCallback((index: number) => {
    const next = Math.max(0, Math.min(sections.length - 1, index))
    setSlide(next)
    const track = window.document.querySelector<HTMLElement>('.doc-ppt-track')
    const node = track?.children[next] as HTMLElement | undefined
    node?.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'start' })
  }, [sections.length])
  useEffect(() => {
    if (layout !== 'ppt') return
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const tag = (event.target as HTMLElement | null)?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea') return
      if (event.key === 'ArrowRight' || event.key === ' ' || event.key === 'PageDown') { event.preventDefault(); goSlide(slide + 1) }
      else if (event.key === 'ArrowLeft' || event.key === 'PageUp') { event.preventDefault(); goSlide(slide - 1) }
      else if (event.key === 'Home') { event.preventDefault(); goSlide(0) }
      else if (event.key === 'End') { event.preventDefault(); goSlide(sections.length - 1) }
    }
    window.document.addEventListener('keydown', onKey)
    return () => window.document.removeEventListener('keydown', onKey)
  }, [layout, slide, sections.length, goSlide])

  if (layout === 'ppt') {
    return <div className="doc-layout doc-ppt">
      <div className="doc-ppt-track">
        {sections.map(section => <section className="doc-slide" key={section.id} data-doc-section={section.id}>
          <div className="doc-slide-ghost" aria-hidden="true">{section.number}</div>
          <div className="doc-slide-inner">
            <div className="doc-slide-number">{section.number}</div>
            <h2 className="doc-slide-title">{section.title}</h2>
            {section.note && <div className="doc-slide-summary"><DocMarkdown text={section.note} baseUrl={baseUrl} /></div>}
            {section.cards.map(card => <DocCard key={card.id} card={card} baseUrl={baseUrl} />)}
          </div>
        </section>)}
      </div>
      <div className="doc-ppt-bar">
        <span className="doc-ppt-now"><b>{sections[slide]?.title}</b><span className="count">{slide + 1} / {sections.length}</span></span>
        <div className="doc-ppt-dots">
          {sections.map((section, index) => <button key={section.id} type="button"
            className="doc-ppt-dot"
            aria-label={'Go to ' + section.title}
            aria-current={index === slide ? 'true' : undefined}
            onClick={() => goSlide(index)} />)}
        </div>
        <button type="button" onClick={() => goSlide(slide - 1)} disabled={slide === 0}>← Prev</button>
        <button type="button" onClick={() => goSlide(slide + 1)} disabled={slide === sections.length - 1}>Next →</button>
      </div>
    </div>
  }

  /* ── Folio: sheets of paper ─────────────────────────────────── */
  if (layout === 'folio') {
    return <div className="doc-layout doc-folio">
      <div className="doc-viewport" ref={setScroller}>
        <div className="doc-folio-stack">
          <section className="doc-sheet">
            <div className="doc-cover-body">
              <div className="doc-cover-eyebrow">Project KO — design document</div>
              <h1 className="doc-cover-title">{heading}</h1>
              {document.summary
                ? <div className="doc-prose"><DocMarkdown text={document.summary} baseUrl={baseUrl} /></div>
                : <div className="doc-cover-sub">A design document</div>}
              <div className="doc-cover-rule" />
            </div>
            <div className="doc-sheet-foot"><span>Cover</span><span>{sections.length} sections</span></div>
          </section>
          <section className="doc-sheet">
            <div className="doc-sheet-head"><span>{heading}</span><span>Contents</span></div>
            <div className="doc-section-number">—</div>
            <h2 className="doc-section-title">Contents</h2>
            <ol className="doc-contents-list">
              {sections.map((section, index) => <li className="doc-contents-item" key={section.id}>
                <span className="doc-contents-num">{section.number}</span>
                <span className="doc-contents-title">{section.title}</span>
                <span className="doc-contents-page">{index + 3}</span>
              </li>)}
            </ol>
            <div className="doc-sheet-foot"><span>Contents</span><span>{sections.length} sections</span></div>
          </section>
          {sections.map(section => <section className="doc-sheet" key={section.id} data-doc-section={section.id}>
            <div className="doc-sheet-head"><span>{heading}</span><span>{section.title}</span></div>
            <div className="doc-section-number">{section.number}</div>
            <h2 className="doc-section-title">{section.title}</h2>
            {section.note && <div className="doc-section-note"><DocMarkdown text={section.note} baseUrl={baseUrl} /></div>}
            {section.cards.map(card => <DocCard key={card.id} card={card} baseUrl={baseUrl} />)}
            <div className="doc-sheet-foot"><span>{section.number} — {section.title}</span><span>{heading}</span></div>
          </section>)}
        </div>
      </div>
    </div>
  }

  /* ── Codex and Margin ───────────────────────────────────────── */
  const rail = <DocRail sections={sections} active={active} title={heading}
    note={layout === 'codex' ? 'a reading room' : 'an editorial spread'}
    summary={document.summary} />

  const body = <div className="doc-body">
    <DocHead doc={document} title={heading} baseUrl={baseUrl} />
    {sections.map(section => <DocSectionBody key={section.id} section={section} baseUrl={baseUrl} />)}
  </div>

  if (layout === 'margin') {
    return <div className="doc-layout doc-margin">
      {rail}
      <div className="doc-flow">
        <div className="doc-viewport" ref={setScroller}>{body}</div>
      </div>
      <DocDots sections={sections} active={active} onGo={goTo} />
    </div>
  }

  return <div className="doc-layout doc-codex">
    {rail}
    <div className="doc-column">
      <div className="doc-viewport" ref={setScroller}>{body}</div>
    </div>
    <DocDots sections={sections} active={active} onGo={goTo} />
  </div>
}
