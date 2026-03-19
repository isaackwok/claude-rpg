import type { LocalizedString } from './types'

// ── Cosmetic types (Phase 3C) ──────────────────────────────────────

export type CosmeticType = 'overlay' | 'decoration'

export type OverlayLayer = 'hat' | 'cape' | 'aura'

export interface CosmeticDefinition {
  id: string
  title: LocalizedString
  description: LocalizedString
  icon: string
  type: CosmeticType
  spriteSheet?: string
  layer?: OverlayLayer
  tileSprite?: string
  tileSize?: { width: number; height: number }
}

export interface PlayerCosmetic {
  cosmeticDefId: string
  unlocked: boolean
  unlockedAt?: number
  equipped: boolean
  definition: CosmeticDefinition
}

export interface HomePlacement {
  cosmeticDefId: string
  tileX: number
  tileY: number
}
