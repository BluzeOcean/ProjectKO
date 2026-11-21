import type { ThemePreference } from '../../desktop/service/appearance.mjs'

export type AgentId = 'codex' | 'claude' | 'antigravity' | 'opencode' | 'kimi' | 'dsh' | 'shell'
export type Effort = 'medium' | 'high' | 'xhigh' | 'max'
export type PermissionMode = 'read-only' | 'workspace-write' | 'danger-full-access'
export interface AgentInfo { id: AgentId; label: string; color: string; available: boolean; subscription: boolean }
export interface ChatSession {
  id: string; name: string; agent: AgentId; cwd: string; bypass: boolean
  effort?: Effort
  status: 'starting' | 'running' | 'stopped' | 'exited'; createdAt: string
  lastOutputAt: string | null; lastInputAt: string | null; nativeId: string | null
  attention: boolean; cols: number; rows: number; exitCode?: number | null
  activity: 'idle' | 'working' | 'waiting'; unread: boolean; completionVersion: number
  tabOrder: number; tabColor: string | null; group: string | null
  open: boolean; pinned: boolean; updatedAt: string; preview?: string; hasConversation?: boolean; restoreError?: string | null
  contextUsage?: ContextUsage
  usage?: ChatUsage | null
  permissionMode?: PermissionMode | null
}
// What a chat has spent, as the harness reports it: the footer's four facts.
export interface ChatUsage {
  turns: number; steps: number; tokens: number; cost: number; cacheHit: number
  model: string | null; limit: number | null; contextUsed: number
  contextPercent: number | null; updatedAt: string | null
}
export interface ContextUsage {
  usedTokens: number | null; limitTokens: number | null; source: AgentId | 'dsh'
  updatedAt: string | null; reason: 'waiting' | 'compacted' | 'unavailable'
}
export interface RecentProject { path: string; name: string; sources: ('workspace' | 'mrmak' | 'claude' | 'codex')[]; pinned: boolean; lastUsedAt: string | null }
export interface Handoff { status: 'summarizing' | 'opening' | 'done' | 'failed'; error?: string | null; sessionId?: string | null; file?: string | null; at: string }
export interface Notice { id: string; sessionId: string; name: string; kind: string; text: string; at: string }
export interface Operation { id: string; text: string; status: string; result?: string; at: string; images?: string[] }
export interface Settings { defaultAgent: AgentId; transcribeProvider?: 'local' | 'openai' | 'openrouter' | 'off'; defaultBypass: boolean; defaultEffort?: Effort; terminalFontSize?: number; terminalAppearance?: 'focus' | 'original'; workspaceTheme?: ThemePreference; chatTheme?: ThemePreference; workspaceRoute?: string | null; selectedId?: string | null; coordinatorEffort?: 'medium' | 'high'; voiceName?: string; voiceStyle?: string; handoffAfter?: number; quotaRefreshMinutes?: number; readAloudSpeed?: number; readAloudVoice?: string; dshPermissionMode?: PermissionMode; terminalOptionMeta?: boolean; collapsedGroups?: string[]; groupColors?: Record<string, string>; systemEvents?: SystemEventsMode; hexShortcut?: boolean }
export type SystemEventsMode = 'full' | 'compact' | 'hidden'
export interface VoiceOwner { clientId: string; surface: 'chats' | 'workspace' }
export interface FileEntry { name: string; path: string; directory: boolean; size: number; modifiedAt: string | null }
export interface Folder { path: string; parent: string; entries: FileEntry[]; truncated: boolean; mode: string }
export interface Preview { path: string; name: string; size: number; kind: 'document' | 'image' | 'video' | 'audio' | 'text' | 'unsupported'; url?: string; text?: string; revision?: string; reason?: string }
/** Which program answers as Mr. KO: Claude Code, or Codex when it is not installed. */
export interface CoordinatorEngine { name: 'claude' | 'codex'; label: string; note: string }
export interface DesktopState {
  ready: boolean; connected: boolean; error: string | null; repo: string; contentBase: string
  agents: AgentInfo[]; sessions: ChatSession[]; selectedId: string | null; notices: Notice[]
  settings: Settings; coordinator: string; coordinatorEngine: CoordinatorEngine; voice: { configured: boolean; owner: VoiceOwner | null }
  operations: Operation[]; preview: Preview | null
  voiceHistory: { id: string; at: string; captions: { role: 'user' | 'assistant'; text: string; start: number; end: number }[] }[]
}
export interface ServiceEvent {
  type: string; id?: string; data?: string; sequence?: number; session?: ChatSession; sessions?: ChatSession[]
  selectedId?: string; sessionId?: string; state?: string; error?: string; notice?: Notice
  operation?: Operation; settings?: Settings; owner?: VoiceOwner | null; window?: string; route?: string; preview?: Preview; handoff?: Handoff
  coordinatorEngine?: CoordinatorEngine
  /** The entry the user chose in a Pinboard. The service holds it; the wall only shows it. */
  selection?: { boardId: string; boardTitle: string; step: number; entryId: string; title: string; fileName: string | null } | null
}
