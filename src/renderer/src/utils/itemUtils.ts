import { BUILT_IN_NPCS } from '../game/data/npcs'

/** Skill category → display color mapping. Shared across all inventory/quest UI. */
export const CATEGORY_COLORS: Record<string, string> = {
  writing: '#e8b44c',
  research: '#5bb5e8',
  code: '#a78bfa',
  data: '#4ade80',
  communication: '#f472b6',
  organization: '#fb923c',
  visual: '#c084fc',
  general: '#888'
}

/** i18n keys for skill categories */
const CATEGORY_I18N: Record<string, string> = {
  writing: 'items.categoryWriting',
  research: 'items.categoryResearch',
  code: 'items.categoryCode',
  data: 'items.categoryData',
  communication: 'items.categoryCommunication',
  organization: 'items.categoryOrganization',
  visual: 'items.categoryVisual',
  general: 'items.categoryGeneral'
}

/** Get the i18n-translated label for a skill category. */
export function categoryLabel(category: string, t: (key: string) => string): string {
  const key = CATEGORY_I18N[category]
  return key ? t(key) : category
}

/** Resolve an NPC's display name from agent ID + locale. */
export function resolveNpcName(agentId: string, locale: string): string {
  const npc = BUILT_IN_NPCS.find((n) => n.id === agentId)
  return npc?.name[locale] ?? npc?.name['zh-TW'] ?? agentId
}
