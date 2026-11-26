export type BoardTag = 'research' | 'game-project' | 'gallery' | 'app-project';
export type PageTag = 'game-mechanics' | 'game-idea' | 'ui' | 'sound' | '3d' | '2d' | 'animation';
export type TabLayout = 'gallery' | 'workbench' | 'pinboard';
export type CardStatus = 'idea' | 'in-progress' | 'review' | 'done';
export type BoardStatus = 'active' | 'done' | 'archived';
export type TabViewer = 'report' | 'compare3d';

export interface SectionBlock {
  kind: 'section';
  id: string;
  title: string;
  /** A sentence under the heading, before the cards it introduces. */
  note?: string;
}

export interface CardBlock {
  kind: 'card';
  id: string;
  title: string;
  body?: string;
  image?: string;
  alt?: string;
  prompt?: string;
  url?: string;
  linkLabel?: string;
  status?: CardStatus;
  /** What the user wants the agent to change about this card. */
  feedback?: string;
  /** The picture with the user's marks drawn over it, inside the page folder. */
  annotation?: string;
  /** A card that takes two columns in the Gallery. */
  wide?: boolean;
}

export type TabBlock = SectionBlock | CardBlock;

export interface TabDocument {
  format: 'pko-tab';
  version: 1;
  layout: TabLayout;
  summary?: string;
  nodes: TabBlock[];
}

export interface WorkspaceTab {
  id: string;
  name: string;
  path: string;
  /** Absent means a tab document; report and compare3d override the renderer. */
  viewer?: TabViewer;
}

export interface WorkspacePage {
  id: string;
  title: string;
  description?: string;
  tags: PageTag[];
  created: string;
  updated?: string;
  icon?: string;
  tabs: WorkspaceTab[];
}

export interface BoardChat {
  chatId?: string;
  agent?: string;
  name?: string;
}

export interface WorkspaceBoard {
  id: string;
  title: string;
  description?: string;
  tags: BoardTag[];
  created: string;
  updated?: string;
  folder: string;
  status: BoardStatus;
  pinned?: boolean;
  sample?: boolean;
  icon?: string;
  agent?: BoardChat;
  pages: WorkspacePage[];
}

export interface VaultRegistry {
  format: 'pko-vault';
  version: 2;
  boards: WorkspaceBoard[];
}

export const VAULT_FORMAT: 'pko-vault';
export const VAULT_VERSION: 2;
export const TAB_FORMAT: 'pko-tab';
export const TAB_VERSION: 1;
export const TAB_MAX_BYTES: number;
export const TAB_MAX_BLOCKS: number;
export const TAB_MAX_IMAGE_BYTES: number;
export const boardTags: BoardTag[];
export const pageTags: PageTag[];
export const boardTagLabels: Record<BoardTag, string>;
export const pageTagLabels: Record<PageTag, string>;
export const tabLayouts: TabLayout[];
export const layoutLabels: Record<TabLayout, string>;
export const layoutNotes: Record<TabLayout, string>;
export const boardStatuses: BoardStatus[];
export const cardStatuses: CardStatus[];
export const ID_PATTERN: RegExp;
export function localDay(date?: Date): string;
export function slugify(value: unknown, fallback?: string): string;
export function folderFor(title: string, day: string): string;
export function localPath(value: unknown): boolean;
export function sourceUrl(value: unknown): string | undefined;
export function validateRegistry(value: unknown): VaultRegistry;
export function validateTabDocument(value: unknown): TabDocument;
export function validateTabDraft(value: unknown): TabDocument;
export function isLegacyRegistry(value: unknown): boolean;
export function tabText(value: TabDocument): string;
export function emptyDocument(layout?: TabLayout): TabDocument;
