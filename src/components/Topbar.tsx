import type { Board, Page, Tab } from '../types'
import { boardHash } from '../lib/route'
import { isDesktop } from '../desktop/client'
import BrowserSettings from './BrowserSettings'
import { EntityStatusButton } from './EntityControls'
import NewTab from './NewTab'

interface TopbarProps {
  board: Board | null
  page: Page | null
  tab: Tab | null
  onTab: (tabId: string) => void
  onHome: () => void
  reportUrl: string | null
  // The tab's own facts — how many cards, and the button that edits them —
  // belong on this row, at the right of the breadcrumb. The editor draws
  // them and hands them over; the topbar only holds the space.
  slotRef?: (node: HTMLDivElement | null) => void
}

export default function Topbar({ board, page, tab, onTab, onHome, reportUrl, slotRef }: TopbarProps) {
  return (
    <div className="topbar">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <button className="crumb-link" onClick={onHome}>Vaultspace</button>
        {board && (
          <>
            <span className="crumb-sep">/</span>
            {page ? <a className="crumb-link" href={boardHash(board.id)}>{board.title}</a> : <span className="crumb-current">{board.title}</span>}
            <EntityStatusButton entity={board} />
          </>
        )}
        {page && <><span className="crumb-sep">/</span><span className="crumb-current">{page.title}</span></>}
        {!isDesktop && <BrowserSettings />}
      </nav>

      {page && (
        <div className="topbar-right">
          {page.tabs.length > 1 && (
            <div className="step-tabs" role="tablist">
              {page.tabs.map(item => (
                <button
                  key={item.id}
                  role="tab"
                  aria-selected={item.id === tab?.id}
                  className={'step-tab' + (item.id === tab?.id ? ' active' : '')}
                  onClick={() => onTab(item.id)}
                  title={item.name}
                >
                  {item.name}
                </button>
              ))}
            </div>
          )}
          {reportUrl && tab?.viewer === 'report' && (
            <a className="open-ext" href={reportUrl} target="_blank" rel="noreferrer" title="Open report in a new tab">↗</a>
          )}
          {isDesktop && <NewTab boardId={board!.id} pageId={page.id} />}
        </div>
      )}
      <div className="topbar-slot" ref={slotRef} />
    </div>
  )
}
