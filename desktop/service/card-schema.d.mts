export type CardTemplate = 'gallery' | 'workbench';
export type CardStatus = 'idea' | 'in-progress' | 'review' | 'done';
export type BoardCategory = 'project' | 'research' | 'dev' | 'image-gen';
export interface CardItem {
  id: string; title: string; body?: string; image?: string; alt?: string;
  prompt?: string; url?: string; linkLabel?: string; status?: CardStatus;
}
export interface CardDocument {
  format: 'mrmak-card'; version: 1; template: CardTemplate;
  title: string; summary?: string; items: CardItem[];
}
export const CARD_FORMAT: 'mrmak-card';
export const CARD_VERSION: 1;
export const CARD_MAX_BYTES: number;
export const CARD_MAX_ITEMS: number;
export const cardTemplates: CardTemplate[];
export const legacyCardTemplates: Record<string, CardTemplate>;
export const cardTemplateLabels: Record<CardTemplate, string>;
export const cardViewTabLabels: Record<string, CardTemplate>;
export const cardStatuses: CardStatus[];
export const boardCategories: BoardCategory[];
export function localDay(date?: Date): string;
export function folderSlug(title: string, fallback: string): string;
export function localCardPath(value: unknown): boolean;
export function validateCard(value: unknown): CardDocument;
export function validateCardDraft(value: unknown): CardDocument;
export function cardSourceUrl(value: unknown): string | undefined;
export function cardText(value: CardDocument): string;
