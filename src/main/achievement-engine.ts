import type { AchievementCheckResult, AchievementTrigger, PlayerAchievement } from '../shared/achievement-types'
import { TOOL_GROUP_MAP } from '../shared/achievement-types'
import { ACHIEVEMENT_DEFINITIONS } from './achievement-definitions'
import type { SqliteAchievementRepository } from './db/achievement-repository'
import { TITLE_TIERS, type ProgressionEngine } from './progression-engine'

interface AchievementEngineConfig {
  totalZones?: number
  totalNpcs?: number
  totalQuests?: number
}

const DEFAULT_CONFIG: Required<AchievementEngineConfig> = {
  totalZones: 6,
  totalNpcs: 7,
  totalQuests: 5
}

export class AchievementEngine {
  private config: Required<AchievementEngineConfig>

  constructor(
    private repo: SqliteAchievementRepository,
    private progressionEngine: ProgressionEngine,
    config?: AchievementEngineConfig
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Check and unlock any progression-category achievements whose triggers are met.
   * Returns the newly-unlocked achievements and the full achievement list.
   */
  checkProgression(playerId: string): AchievementCheckResult {
    const alreadyUnlocked = new Set(this.repo.getUnlocked(playerId))
    const playerState = this.progressionEngine.getPlayerState()

    const newlyUnlocked: AchievementCheckResult['unlocked'] = []

    for (const def of ACHIEVEMENT_DEFINITIONS) {
      if (def.category !== 'progression') continue
      if (alreadyUnlocked.has(def.id)) continue

      if (this.evaluateTrigger(def.trigger, playerId, playerState)) {
        this.repo.unlock(playerId, def.id)
        newlyUnlocked.push({
          achievementDefId: def.id,
          title: def.title,
          cosmeticReward: def.cosmeticReward,
          xpReward: def.xpReward
        })
      }
    }

    return {
      unlocked: newlyUnlocked,
      achievements: this.getAchievements(playerId)
    }
  }

  /**
   * Check and unlock any exploration-category achievements whose triggers are met.
   * Returns the newly-unlocked achievements and the full achievement list.
   */
  checkExploration(playerId: string): AchievementCheckResult {
    const alreadyUnlocked = new Set(this.repo.getUnlocked(playerId))
    const playerState = this.progressionEngine.getPlayerState()

    const newlyUnlocked: AchievementCheckResult['unlocked'] = []

    for (const def of ACHIEVEMENT_DEFINITIONS) {
      if (def.category !== 'exploration') continue
      if (alreadyUnlocked.has(def.id)) continue

      if (this.evaluateTrigger(def.trigger, playerId, playerState)) {
        this.repo.unlock(playerId, def.id)
        newlyUnlocked.push({
          achievementDefId: def.id,
          title: def.title,
          cosmeticReward: def.cosmeticReward,
          xpReward: def.xpReward
        })
      }
    }

    return {
      unlocked: newlyUnlocked,
      achievements: this.getAchievements(playerId)
    }
  }

  /**
   * Check and unlock any tool_use-category achievements whose triggers are met.
   * Returns the newly-unlocked achievements and the full achievement list.
   */
  checkToolUse(playerId: string): AchievementCheckResult {
    const alreadyUnlocked = new Set(this.repo.getUnlocked(playerId))
    const playerState = this.progressionEngine.getPlayerState()

    const newlyUnlocked: AchievementCheckResult['unlocked'] = []

    for (const def of ACHIEVEMENT_DEFINITIONS) {
      if (def.category !== 'tool_use') continue
      if (alreadyUnlocked.has(def.id)) continue

      if (this.evaluateTrigger(def.trigger, playerId, playerState)) {
        this.repo.unlock(playerId, def.id)
        newlyUnlocked.push({
          achievementDefId: def.id,
          title: def.title,
          cosmeticReward: def.cosmeticReward,
          xpReward: def.xpReward
        })
      }
    }

    return {
      unlocked: newlyUnlocked,
      achievements: this.getAchievements(playerId)
    }
  }

  /**
   * Returns all achievement definitions merged with the player's unlock status.
   */
  getAchievements(playerId: string): PlayerAchievement[] {
    const unlocked = new Set(this.repo.getUnlocked(playerId))

    return ACHIEVEMENT_DEFINITIONS.map((def) => ({
      achievementDefId: def.id,
      unlocked: unlocked.has(def.id),
      definition: def
    }))
  }

  private evaluateTrigger(
    trigger: AchievementTrigger,
    playerId: string,
    playerState: ReturnType<ProgressionEngine['getPlayerState']>
  ): boolean {
    switch (trigger.type) {
      case 'overall_level':
        return playerState.overallLevel >= trigger.level

      case 'category_level':
        return playerState.skills[trigger.category].level >= trigger.level

      case 'any_category_level':
        return Object.values(playerState.skills).some((s) => s.level >= trigger.level)

      case 'tier_unlock': {
        const tier = TITLE_TIERS.find((t) => t.en === trigger.tier)
        if (!tier) return false
        return playerState.overallLevel >= tier.minLevel
      }

      case 'zones_visited':
        return this.repo.getZoneVisitCount(playerId) >= trigger.count

      case 'all_zones_visited':
        return this.repo.getZoneVisitCount(playerId) >= this.config.totalZones

      case 'all_npcs_interacted':
        return this.repo.getInteractedNpcCount(playerId) >= this.config.totalNpcs

      case 'all_quests_discovered':
        return this.repo.getDiscoveredQuestCount(playerId) >= this.config.totalQuests

      case 'tool_used': {
        const usedTools = this.repo.getUsedToolTypes(playerId)
        return usedTools.includes(trigger.toolType)
      }

      case 'tool_group_used': {
        const usedTools = new Set(this.repo.getUsedToolTypes(playerId))
        const groupTools = TOOL_GROUP_MAP[trigger.group]
        return groupTools.some((t) => usedTools.has(t))
      }

      case 'all_tool_groups_used': {
        const usedTools = new Set(this.repo.getUsedToolTypes(playerId))
        return Object.values(TOOL_GROUP_MAP).every((tools) => tools.some((t) => usedTools.has(t)))
      }

      default:
        return false
    }
  }
}
