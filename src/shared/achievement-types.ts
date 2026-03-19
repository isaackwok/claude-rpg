import type { LocalizedString, SkillCategory, ToolName } from './types'

// ── Achievement types (Phase 3C) ──────────────────────────────────────

export type AchievementCategory = 'progression' | 'exploration' | 'tool_use'

export type ToolGroup = 'file' | 'search' | 'command'

export const TOOL_GROUP_MAP: Record<ToolGroup, ToolName[]> = {
  file: ['read_file', 'write_file', 'edit_file', 'list_files'],
  search: ['web_search'],
  command: ['run_command']
}

export type AchievementTrigger =
  | { type: 'overall_level'; level: number }
  | { type: 'category_level'; category: SkillCategory; level: number }
  | { type: 'any_category_level'; level: number }
  | { type: 'tier_unlock'; tier: string }
  | { type: 'zones_visited'; count: number }
  | { type: 'all_zones_visited' }
  | { type: 'all_npcs_interacted' }
  | { type: 'all_quests_discovered' }
  | { type: 'tool_used'; toolType: ToolName }
  | { type: 'tool_group_used'; group: ToolGroup }
  | { type: 'all_tool_groups_used' }

export interface AchievementDefinition {
  id: string
  title: LocalizedString
  description: LocalizedString
  icon: string
  category: AchievementCategory
  trigger: AchievementTrigger
  cosmeticReward?: string
  xpReward?: number
}

export interface PlayerAchievement {
  achievementDefId: string
  unlocked: boolean
  unlockedAt?: number
  definition: AchievementDefinition
}

export interface AchievementCheckResult {
  unlocked: {
    achievementDefId: string
    title: LocalizedString
    cosmeticReward?: string
    xpReward?: number
  }[]
  achievements: PlayerAchievement[]
}
