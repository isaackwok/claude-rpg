import type { LocalizedString } from '../i18n/types'

export type SkillCategory =
  | 'writing'
  | 'data'
  | 'visual'
  | 'code'
  | 'research'
  | 'organization'
  | 'communication'

export interface AgentDef {
  id: string
  name: LocalizedString
  sprite: string
  spriteFrame: number
  location: { map: string; x: number; y: number }
  skills?: SkillCategory[]
}

export interface GameEvents {
  'npc:interact': { agentId: string; npcPosition: { x: number; y: number } }
  'npc:proximity': { agentId: string; inRange: boolean }
  'player:moved': { x: number; y: number; map: string }
  'zone:entered': { zoneId: string; zoneName: string }
  'dialogue:closed': { agentId: string }
  'npc:speech-bubble': { agentId: string; style: 'streaming' | 'ready' | false }
  'npc:spawn': { agent: AgentDef }
  'npc:remove': { agentId: string }
  'camera:focus': { x: number; y: number }
  'xp:gained': { category: SkillCategory; amount: number; newTotal: number }
  'level:up': { category: SkillCategory; newLevel: number }
  'quest:completed': { questId: string; title: LocalizedString }
  'title:changed': { newTitle: LocalizedString }
}
