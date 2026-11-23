export const CATEGORY_ICONS: Record<string, string> = {
  'image-gen': '\u{1F3A8}',
  'analytics': '\u{1F4CA}',
  'research': '\u{1F50D}',
  'lead-magnet': '\u{1F9F2}',
  'game': '\u{1F3AE}',
  'dev': '\u{1F6E0}\u{FE0F}',
}

export function categoryIcon(category: string): string {
  return CATEGORY_ICONS[category] ?? '\u{1F4C1}'
}

/* The words the Vault shows for a tag: the filter group, the tag
   chip and the pills that assign another one all read the same. */
const CATEGORY_LABELS: Record<string, string> = {
  'image-gen': 'Image gen',
  'lead-magnet': 'Lead magnet',
}

export function categoryLabel(category: string): string {
  if (!category) return 'Other'
  return CATEGORY_LABELS[category] ?? category.charAt(0).toUpperCase() + category.slice(1)
}
