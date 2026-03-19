import type { LocalizedString } from '../i18n/types'
import type { AgentId, SkillCategory, QuestVisibility } from '../../../shared/types'

export type { AgentId, SkillCategory }

export interface AgentDef {
  readonly id: AgentId
  readonly name: LocalizedString
  readonly sprite: string
  readonly spriteFrame: number
  readonly location: { readonly map: string; readonly x: number; readonly y: number }
  readonly skills?: readonly SkillCategory[]
}

export interface GameEvents {
  'npc:interact': { agentId: AgentId; npcPosition: { x: number; y: number } }
  'npc:proximity': { agentId: AgentId; inRange: boolean }
  'player:moved': { x: number; y: number; map: string }
  'zone:entered': { zoneId: string; zoneName: string }
  'dialogue:closed': { agentId: AgentId }
  'npc:speech-bubble': { agentId: AgentId; style: 'streaming' | 'ready' | 'permission' | false }
  'npc:spawn': { agent: AgentDef }
  'npc:remove': { agentId: AgentId }
  'camera:focus': { x: number; y: number }
  'xp:gained': { category: SkillCategory; amount: number; newTotal: number; agentId: AgentId }
  'level:up': { category: SkillCategory; newLevel: number; overallLevel: number }
  'quest:completed': { questDefId: string; title: LocalizedString; xpReward: number }
  'quest:discovered': { questDefId: string; visibility: QuestVisibility }
  'title:changed': { newTitle: LocalizedString }
  'noticeboard:interact': Record<string, never>
  'skills-panel:toggle': Record<string, never>
  'backpack:toggle': Record<string, never>
  'achievement:unlocked': {
    achievementDefId: string
    title: LocalizedString
    cosmeticReward?: { id: string; title: LocalizedString; type: 'overlay' | 'decoration' }
  }
  'cosmetic:unlocked': { cosmeticDefId: string; title: LocalizedString }
  'cosmetic:equipped': { cosmeticDefId: string; layer: 'hat' | 'cape' | 'aura' }
  'cosmetic:unequipped': { layer: 'hat' | 'cape' | 'aura' }
  'scene:changed': { sceneName: string; fromScene?: string }
  'zone:visited': { zoneId: string }
  'home:decorate-mode': { active: boolean }
}
