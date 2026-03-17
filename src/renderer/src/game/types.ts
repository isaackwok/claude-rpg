import type { LocalizedString } from '../i18n/types'
import type { AgentId } from '../../../shared/types'

export type { AgentId }

export type SkillCategory =
  | 'writing'
  | 'data'
  | 'visual'
  | 'code'
  | 'research'
  | 'organization'
  | 'communication'

export interface AgentDef {
  id: AgentId
  name: LocalizedString
  sprite: string
  spriteFrame: number
  location: { map: string; x: number; y: number }
  skills?: SkillCategory[]
}

export interface GameEvents {
  'npc:interact': { agentId: AgentId; npcPosition: { x: number; y: number } }
  'npc:proximity': { agentId: AgentId; inRange: boolean }
  'player:moved': { x: number; y: number; map: string }
  'zone:entered': { zoneId: string; zoneName: string }
  'dialogue:closed': { agentId: AgentId }
  'npc:speech-bubble': { agentId: AgentId; style: 'streaming' | 'ready' | false }
  'npc:spawn': { agent: AgentDef }
  'npc:remove': { agentId: AgentId }
  'camera:focus': { x: number; y: number }
  'xp:gained': { category: SkillCategory; amount: number; newTotal: number }
  'level:up': { category: SkillCategory; newLevel: number }
  'quest:completed': { questId: string; title: LocalizedString }
  'title:changed': { newTitle: LocalizedString }
}
