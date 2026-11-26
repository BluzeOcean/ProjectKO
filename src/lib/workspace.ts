import { useCallback, useEffect, useRef, useState } from 'react'
import type { Board, Page, VaultRegistry } from '../types'
import { api, isDesktop } from '../desktop/client'

const POLL_MS = 30_000
const ARCHIVE_DAYS = 7

export const emptyVault = (): VaultRegistry => ({ format: 'pko-vault', version: 2, boards: [] })

export type BoardPatch = Partial<Pick<Board, 'status' | 'pinned' | 'tags'>>
export type PagePatch = Partial<Pick<Page, 'title' | 'description' | 'tags'>>

const notify = () => window.dispatchEvent(new Event('mrmak-workspace-changed'))

export async function updateBoard(id: string, patch: BoardPatch) {
  if (!isDesktop) throw new Error('Open the desktop app to edit boards.')
  await api('/workspace/boards/' + encodeURIComponent(id), patch, 'PATCH')
  notify()
}

/** Removes a board from the Vault. The service takes the board's folder to the
 *  system trash with it. */
export async function deleteBoard(id: string) {
  if (!isDesktop) throw new Error('Open the desktop app to delete a board.')
  await api('/workspace/boards/' + encodeURIComponent(id), undefined, 'DELETE')
  notify()
}

export async function createBoard(values: { title: string; description?: string; tags?: string[] }) {
  if (!isDesktop) throw new Error('Open the desktop app to create a board.')
  const value = await api<{ board: Board }>('/workspace/boards', values)
  notify()
  return value.board
}

export async function createPage(boardId: string, values: { title: string; description?: string; tags?: string[] }) {
  if (!isDesktop) throw new Error('Open the desktop app to create a page.')
  const value = await api<{ page: Page }>('/workspace/boards/' + encodeURIComponent(boardId) + '/pages', values)
  notify()
  return value.page
}

export async function createTab(boardId: string, pageId: string, values: { name: string; layout?: string }) {
  if (!isDesktop) throw new Error('Open the desktop app to create tabs.')
  const value = await api<{ tab: { id: string; name: string; path: string } }>('/workspace/boards/' + encodeURIComponent(boardId) + '/pages/' + encodeURIComponent(pageId) + '/tabs', values)
  notify()
  return value.tab
}

export async function updatePage(boardId: string, pageId: string, patch: PagePatch) {
  if (!isDesktop) throw new Error('Open the desktop app to edit pages.')
  await api('/workspace/boards/' + encodeURIComponent(boardId) + '/pages/' + encodeURIComponent(pageId), patch, 'PATCH')
  notify()
}

/** Removes a page and its folder. The board, its other pages and the board's
 *  files stay where they are. */
export async function deletePage(boardId: string, pageId: string) {
  if (!isDesktop) throw new Error('Open the desktop app to delete a page.')
  await api('/workspace/boards/' + encodeURIComponent(boardId) + '/pages/' + encodeURIComponent(pageId), undefined, 'DELETE')
  notify()
}

export function archiveCutoff(): string {
  const d = new Date()
  d.setDate(d.getDate() - ARCHIVE_DAYS)
  return d.toISOString().slice(0, 10)
}

/**
 * Loads the Vault registry and keeps it fresh: refetch on window focus /
 * visibility and a light poll while the tab is visible. State only changes
 * when the file content actually changed, so re-renders are cheap. A failed
 * fetch (or a mid-write half-file from an agent) flips 'offline' and keeps the
 * last good data.
 */
export function useWorkspace() {
  const [workspace, setWorkspace] = useState<VaultRegistry | null>(null)
  const [offline, setOffline] = useState(false)
  const [lastSync, setLastSync] = useState<Date | null>(null)
  const rawRef = useRef('')

  const reload = useCallback(async () => {
    try {
      const res = isDesktop ? null : await fetch('/workspace/workspace.json', { cache: 'no-store' })
      if (res && !res.ok) throw new Error('HTTP ' + res.status)
      const text = res ? await res.text() : JSON.stringify(await api<VaultRegistry>('/workspace'))
      if (text !== rawRef.current) {
        const parsed = JSON.parse(text) as VaultRegistry
        rawRef.current = text
        setWorkspace(parsed)
      }
      setOffline(false)
      setLastSync(new Date())
    } catch {
      setOffline(true)
      setWorkspace(value => value ?? emptyVault())
    }
  }, [])

  useEffect(() => {
    // Initial fetch - every setState inside reload happens after an await,
    // never synchronously, so cascading-render concerns don't apply here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload()
    const refresh = () => {
      if (document.visibilityState === 'visible') reload()
    }
    window.addEventListener('focus', refresh)
    window.addEventListener('mrmak-workspace-changed', refresh)
    document.addEventListener('visibilitychange', refresh)
    const timer = window.setInterval(refresh, POLL_MS)
    return () => {
      window.removeEventListener('focus', refresh)
      window.removeEventListener('mrmak-workspace-changed', refresh)
      document.removeEventListener('visibilitychange', refresh)
      window.clearInterval(timer)
    }
  }, [reload])

  return { workspace, offline, lastSync, reload }
}
