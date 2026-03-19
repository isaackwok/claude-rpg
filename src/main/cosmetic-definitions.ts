import type { CosmeticDefinition } from '../shared/cosmetic-types'

export const COSMETIC_DEFINITIONS: readonly CosmeticDefinition[] = [
  // ── Overlays — Hat layer ────────────────────────────────────────────────
  {
    id: 'apprentice-hat',
    title: { 'zh-TW': '學徒帽', en: 'Apprentice Hat' },
    description: {
      'zh-TW': '踏上旅途的學徒所戴的帽子',
      en: 'A hat worn by apprentices who have just begun their journey'
    },
    icon: '🎩',
    type: 'overlay',
    spriteSheet: 'cosmetics/apprentice-hat',
    layer: 'hat'
  },
  {
    id: 'champion-hat',
    title: { 'zh-TW': '大師帽', en: 'Champion Hat' },
    description: {
      'zh-TW': '技藝精通者所配戴的榮耀帽冠',
      en: 'A crown worn by those who have mastered their craft'
    },
    icon: '👑',
    type: 'overlay',
    spriteSheet: 'cosmetics/champion-hat',
    layer: 'hat'
  },

  // ── Overlays — Cape layer ───────────────────────────────────────────────
  {
    id: 'veteran-cape',
    title: { 'zh-TW': '資深披風', en: 'Veteran Cape' },
    description: {
      'zh-TW': '老練冒險者所披掛的榮耀披風',
      en: 'A cape that marks a seasoned adventurer'
    },
    icon: '🧣',
    type: 'overlay',
    spriteSheet: 'cosmetics/veteran-cape',
    layer: 'cape'
  },

  // ── Overlays — Aura layer ───────────────────────────────────────────────
  {
    id: 'legendary-aura',
    title: { 'zh-TW': '傳奇光環', en: 'Legendary Aura' },
    description: {
      'zh-TW': '傳奇英雄身上散發出的神秘光環',
      en: 'A mysterious aura that radiates from legendary heroes'
    },
    icon: '✨',
    type: 'overlay',
    spriteSheet: 'cosmetics/legendary-aura',
    layer: 'aura'
  },

  // ── Decorations ─────────────────────────────────────────────────────────
  {
    id: 'town-banner',
    title: { 'zh-TW': '城鎮旗幟', en: 'Town Banner' },
    description: {
      'zh-TW': '探索全城後獲得的城鎮旗幟，可放置於家中',
      en: 'A banner earned by exploring every corner of town'
    },
    icon: '🏴',
    type: 'decoration',
    tileSprite: 'cosmetics/town-banner',
    tileSize: { width: 32, height: 32 }
  },
  {
    id: 'npc-statue',
    title: { 'zh-TW': 'NPC雕像', en: 'NPC Statue' },
    description: {
      'zh-TW': '與所有 NPC 對話後獲得的紀念雕像',
      en: 'A statue commemorating your friendships with every NPC'
    },
    icon: '🗿',
    type: 'decoration',
    tileSprite: 'cosmetics/npc-statue',
    tileSize: { width: 32, height: 32 }
  },
  {
    id: 'garden-item',
    title: { 'zh-TW': '花園裝飾', en: 'Garden Item' },
    description: {
      'zh-TW': '掌握所有工具後獲得的花園裝飾品',
      en: 'A garden ornament earned by mastering every tool type'
    },
    icon: '🌺',
    type: 'decoration',
    tileSprite: 'cosmetics/garden-item',
    tileSize: { width: 32, height: 32 }
  }
]

export function getCosmeticDefinition(id: string): CosmeticDefinition | undefined {
  return COSMETIC_DEFINITIONS.find((c) => c.id === id)
}
