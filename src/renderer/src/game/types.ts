import type { LocalizedString } from '../i18n/types'
import type { AgentId, SkillCategory } from '../../../shared/types'

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
  'quest:completed': { questId: string; title: LocalizedString }
  'title:changed': { newTitle: LocalizedString }
  'noticeboard:interact': Record<string, never>
  'skills-panel:toggle': Record<string, never>
}
