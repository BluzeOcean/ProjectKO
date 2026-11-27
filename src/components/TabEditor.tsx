import { useEffect, useRef, useState } from 'react'
import { api, isDesktop, onServiceEvent, uploadTabImage } from '../desktop/client'
import { isDocumentLayout, layoutLabels, tabLayouts, validateTabDraft, type CardBlock, type SectionBlock, type TabDocument } from '../../desktop/service/vault-schema.mjs'
import { statusLabels } from '../lib/card-labels'
import TabContent, { type Where } from './TabContent'
import type { Tab } from '../types'
import '../styles/editable-cards.css'

interface Snapshot { document: TabDocument; revision: string; warning?: string }
interface State { saved: Snapshot | null; draft: TabDocument | null; latest: Snapshot | null; editing: boolean; saving: boolean; message: string; error: string }

const routeOf = (where: Where) => '/workspace/boards/' + encodeURIComponent(where.boardId) + '/pages/' + encodeURIComponent(where.pageId) + '/tabs/' + encodeURIComponent(where.tabId)
const draftKeyOf = (where: Where) => ['mrmak.tab-draft', where.boardId, where.pageId, where.tabId].join('.')
const changed = (state: State) => !!state.saved && JSON.stringify(state.draft) !== JSON.stringify(state.saved.document)
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error)
const uid = (prefix: string) => prefix + '-' + Math.random().toString(36).slice(2, 8)

/**
 * The tab editor. A tab is a document of headings and cards, so the editor edits
 * one flat list: a section is a heading, a card is a block. Nothing here is
 * generated HTML - the document is the source of truth.
 */
export default function TabEditor({ where, tab, baseUrl }: { where: Where; tab: Tab; baseUrl: string }) {
  const route = routeOf(where), draftKey = draftKeyOf(where)
  const [state, setState] = useState<State>({ saved: null, draft: null, latest: null, editing: false, saving: false, message: '', error: '' })
  const mutation = useRef(0)
  const dirty = changed(state)

  useEffect(() => {
    let current = true, loading = false
    async function load() {
      if (loading || mutation.current % 2 || window.document.visibilityState === 'hidden') return
      const generation = mutation.current
      loading = true
      try {
        let snapshot: Snapshot
        if (isDesktop) snapshot = await api<Snapshot>(route)
        else {
          const response = await fetch(baseUrl, { cache: 'no-store' })
          if (!response.ok) throw new Error('This tab is unavailable (' + response.status + ').')
          snapshot = { document: validateTabDraft(await response.json()), revision: '' }
        }
        if (!current || generation !== mutation.current) return
        setState(previous => {
          if (previous.saving || generation !== mutation.current) return previous
          if (!previous.saved) {
            let recovery: { document: TabDocument; revision: string } | null = null
            if (isDesktop) {
              try {
                const stored = JSON.parse(sessionStorage.getItem(draftKey) || 'null')
                if (stored?.document && typeof stored.revision === 'string') recovery = { document: validateTabDraft(stored.document), revision: stored.revision }
              } catch { /* A malformed recovery draft never replaces a valid source. */ }
            }
            return { ...previous, saved: recovery && recovery.revision !== snapshot.revision ? { ...snapshot, revision: recovery.revision } : snapshot, draft: recovery?.document || snapshot.document, latest: recovery && recovery.revision !== snapshot.revision ? snapshot : null, editing: !!recovery, message: recovery ? 'Recovered your unsaved draft.' : '', error: '' }
          }
          if (changed(previous)) return { ...previous, latest: snapshot.revision !== previous.saved.revision ? snapshot : null }
          return { ...previous, saved: snapshot, draft: snapshot.document, latest: null, error: '' }
        })
      } catch (error) { if (current && generation === mutation.current) setState(previous => ({ ...previous, error: errorText(error) })) }
      finally { loading = false }
    }
    void load()
    const timer = window.setInterval(() => void load(), 5000)
    const refresh = () => void load()
    window.addEventListener('focus', refresh)
    window.document.addEventListener('visibilitychange', refresh)
    const off = onServiceEvent(event => { if (event.type === 'workspace-changed') void load() })
    return () => { current = false; clearInterval(timer); window.removeEventListener('focus', refresh); window.document.removeEventListener('visibilitychange', refresh); off() }
  }, [route, baseUrl, draftKey])

  // A draft survives switching tabs and reloading the window; the file is still
  // the source of truth.
  useEffect(() => {
    if (!isDesktop || !state.saved) return
    try { if (dirty) sessionStorage.setItem(draftKey, JSON.stringify({ document: state.draft, revision: state.saved.revision })); else sessionStorage.removeItem(draftKey) } catch { /* Keep the live draft even if session storage is full. */ }
    const warn = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty, state.draft, state.saved, draftKey])

  const edit = (update: (document: TabDocument) => TabDocument) => setState(previous => previous.draft && !previous.saving ? { ...previous, draft: update(previous.draft), message: '', error: '' } : previous)
  const nodeEdit = (id: string, patch: Partial<CardBlock> & Partial<SectionBlock>) => edit(document => ({ ...document, nodes: document.nodes.map(node => node.id === id ? { ...node, ...patch } as typeof node : node) }))
  const addSection = () => edit(document => ({ ...document, nodes: [...document.nodes, { kind: 'section', id: uid('section'), title: 'New section', note: '' }] }))
  const addCard = () => edit(document => ({ ...document, nodes: [...document.nodes, { kind: 'card', id: uid('card'), title: 'Untitled card', body: '', status: 'idea' }] }))
  const remove = (id: string) => edit(document => ({ ...document, nodes: document.nodes.filter(node => node.id !== id) }))
  const move = (id: string, by: number) => edit(document => {
    const nodes = [...document.nodes], at = nodes.findIndex(node => node.id === id), to = at + by
    if (at < 0 || to < 0 || to >= nodes.length) return document
    nodes.splice(to, 0, nodes.splice(at, 1)[0])
    return { ...document, nodes }
  })

  async function upload(id: string, file: File) {
    setState(previous => ({ ...previous, message: 'Uploading…', error: '' }))
    try {
      const value = await uploadTabImage(where.boardId, where.pageId, where.tabId, file)
      nodeEdit(id, { image: value.image })
      setState(previous => ({ ...previous, message: 'Image added. Save to keep it.' }))
    } catch (error) { setState(previous => ({ ...previous, error: errorText(error) })) }
  }

  function save(document = state.draft): Promise<boolean> {
    if (!document || !state.saved || state.saving) return Promise.resolve(false)
    mutation.current++
    setState(previous => ({ ...previous, saving: true, message: '', error: '' }))
    return api<Snapshot>(route, { revision: state.saved.revision, document }, 'PUT').then(value => {
      setState(previous => ({ ...previous, saved: value, draft: value.document, latest: null, saving: false, editing: false, message: value.warning || 'Saved.' }))
      return true
    }).catch((error: unknown) => {
      setState(previous => ({ ...previous, saving: false, error: errorText(error) }))
      return false
    })
  }

  function cancel() {
    if (!state.saved) return
    setState(previous => ({ ...previous, draft: previous.saved!.document, editing: false, latest: null, message: 'Draft discarded.', error: '' }))
    try { sessionStorage.removeItem(draftKey) } catch { /* The draft is gone anyway. */ }
  }

  const document = state.draft
  if (state.error && !document) return <div className="report-error"><strong>{tab.name}</strong><p>{state.error}</p></div>
  if (!document) return <div className="report-loading">Opening tab…</div>

  const cards = document.nodes.filter(node => node.kind === 'card').length
  // A document layout scrolls on its own; the editor's scroller would
  // otherwise scroll it a second time.
  const isDocument = isDocumentLayout(document.layout)

  return <div className={'tab-editor' + (isDocument ? ' is-document' : '')}>
    <div className="tab-editor-bar">
      <span className="tab-editor-count">{cards} {cards === 1 ? 'card' : 'cards'} · {document.nodes.length - cards} heading{document.nodes.length - cards === 1 ? '' : 's'}</span>
      <span className="tab-editor-message" role="status">{state.error ? '' : state.message}</span>
      {state.latest && <span className="tab-editor-warn">The file changed on disk. <button type="button" onClick={() => setState(previous => ({ ...previous, draft: previous.latest!.document, saved: previous.latest, latest: null, message: 'Loaded the latest version.' }))}>Load latest</button></span>}
      {isDesktop && !state.editing && <button type="button" className="card-primary" onClick={() => setState(previous => ({ ...previous, editing: true, message: '', error: '' }))}>Edit</button>}
      {state.editing && <>
        <button type="button" onClick={cancel} disabled={state.saving}>Cancel</button>
        <button type="button" className="card-primary" onClick={() => void save()} disabled={state.saving || !dirty}>{state.saving ? 'Saving…' : 'Save'}</button>
      </>}
    </div>
    {state.error && <p className="card-error" role="alert">{state.error}</p>}

    {!state.editing ? <TabContent document={document} baseUrl={baseUrl} title={tab.name} where={where} onSave={isDesktop ? save : undefined} /> : <div className="tab-edit-body">
      <div className="tab-editor-fields">
        <label className="tab-editor-field"><span>Layout</span>
          <select value={document.layout} onChange={event => edit(value => ({ ...value, layout: event.target.value as TabDocument['layout'] }))}>
            <optgroup label="Cards">
              {tabLayouts.filter(value => !isDocumentLayout(value)).map(value => <option key={value} value={value}>{layoutLabels[value]}</option>)}
            </optgroup>
            <optgroup label="Documents">
              {tabLayouts.filter(value => isDocumentLayout(value)).map(value => <option key={value} value={value}>{layoutLabels[value]}</option>)}
            </optgroup>
          </select>
        </label>
        <label className="tab-editor-field tab-editor-wide"><span>Introduction <em>Markdown supported</em></span>
          <textarea rows={3} value={document.summary || ''} onChange={event => edit(value => ({ ...value, summary: event.target.value }))} />
        </label>
      </div>

      <div className="tab-editor-add">
        <button type="button" onClick={addSection}>+ Heading</button>
        <button type="button" onClick={addCard}>+ Card</button>
      </div>

      <ol className="tab-blocks">
        {document.nodes.map((node, index) => node.kind === 'section' ? <li className="tab-block tab-block-section" key={node.id}>
          <div className="tab-block-head">
            <span>Heading</span>
            <div className="tab-editor-actions">
              <button type="button" aria-label="Move up" disabled={index === 0} onClick={() => move(node.id, -1)}>↑</button>
              <button type="button" aria-label="Move down" disabled={index === document.nodes.length - 1} onClick={() => move(node.id, 1)}>↓</button>
              <button type="button" aria-label="Remove heading" onClick={() => remove(node.id)}>×</button>
            </div>
          </div>
          <label className="tab-editor-field"><span>Heading</span><input value={node.title} onChange={event => nodeEdit(node.id, { title: event.target.value })} /></label>
          <label className="tab-editor-field tab-editor-wide"><span>Note <em>Markdown supported</em></span><textarea rows={2} value={node.note || ''} onChange={event => nodeEdit(node.id, { note: event.target.value })} /></label>
        </li> : <li className="tab-block tab-block-card" key={node.id}>
          <div className="tab-block-head">
            <span>Card</span>
            <div className="tab-editor-actions">
              <button type="button" aria-label="Move up" disabled={index === 0} onClick={() => move(node.id, -1)}>↑</button>
              <button type="button" aria-label="Move down" disabled={index === document.nodes.length - 1} onClick={() => move(node.id, 1)}>↓</button>
              <button type="button" aria-label="Remove card" onClick={() => remove(node.id)}>×</button>
            </div>
          </div>
          <label className="tab-editor-field"><span>Card title</span><input value={node.title} onChange={event => nodeEdit(node.id, { title: event.target.value })} /></label>
          <label className="tab-editor-field tab-editor-wide"><span>Notes <em>Markdown supported</em></span><textarea rows={3} value={node.body || ''} onChange={event => nodeEdit(node.id, { body: event.target.value })} /></label>
          <div className="tab-editor-fields">
            <label className="tab-editor-field"><span>Status</span>
              <select value={node.status || ''} onChange={event => nodeEdit(node.id, { status: event.target.value ? event.target.value as CardBlock['status'] : undefined })}>
                <option value="">No status</option>
                {(Object.keys(statusLabels) as Array<CardBlock['status'] & string>).map(value => <option key={value} value={value}>{statusLabels[value]}</option>)}
              </select>
            </label>
            <label className="tab-editor-field"><span>Image</span>
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={event => { const file = event.target.files?.[0]; if (file) void upload(node.id, file) }} />
            </label>
            {node.image && <span className="tab-editor-image">{node.image.split('/').pop()} <button type="button" onClick={() => nodeEdit(node.id, { image: undefined })}>remove</button></span>}
          </div>
          <div className="tab-editor-fields">
            <label className="tab-editor-field"><span>Source URL</span><input value={node.url || ''} placeholder="https://…" onChange={event => nodeEdit(node.id, { url: event.target.value })} /></label>
            <label className="tab-editor-field"><span>Link label</span><input value={node.linkLabel || ''} onChange={event => nodeEdit(node.id, { linkLabel: event.target.value })} /></label>
          </div>
          <label className="tab-editor-field tab-editor-wide"><span>Prompt <em>saved beside the card</em></span><textarea rows={2} value={node.prompt || ''} onChange={event => nodeEdit(node.id, { prompt: event.target.value })} /></label>
          <label className="tab-editor-check"><input type="checkbox" checked={!!node.wide} onChange={event => nodeEdit(node.id, { wide: event.target.checked })} /> Wide card in the Gallery</label>
        </li>)}
      </ol>
      {!document.nodes.length && <p className="card-empty">No blocks yet. Add a heading, then a card.</p>}
    </div>}
  </div>
}
