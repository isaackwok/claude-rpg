import type {
  AgentId,
  QuestCheckResult,
  PlayerQuest,
  QuestBoardSuggestion,
  QuestPrecondition,
  QuestVisibility,
  SkillCategory,
  LocalizedString
} from '../shared/types'
import { SKILL_CATEGORIES } from '../shared/types'
import { QUEST_DEFINITIONS, getQuestDefinition } from './quest-definitions'
import type { SqliteQuestRepository } from './db/quest-repository'

// NPC names must match canonical data in src/renderer/src/game/data/npcs.ts
const SKILL_TO_NPC: Record<SkillCategory, { name: LocalizedString; agentId: AgentId }> = {
  writing: { name: { 'zh-TW': '書記官 雷文', en: 'Scribe Raven' }, agentId: 'scribe' },
  research: { name: { 'zh-TW': '學者 索菲亞', en: 'Scholar Sophia' }, agentId: 'scholar' },
  code: { name: { 'zh-TW': '巫師 瑪琳', en: 'Wizard Merlin' }, agentId: 'wizard' },
  data: { name: { 'zh-TW': '商人 馬可', en: 'Merchant Marco' }, agentId: 'merchant' },
  communication: {
    name: { 'zh-TW': '傳令使 娜歐蜜', en: 'Herald Naomi' },
    agentId: 'herald'
  },
  organization: {
    name: { 'zh-TW': '指揮官 乃歐', en: 'Commander Neo' },
    agentId: 'commander'
  },
  visual: { name: { 'zh-TW': '匠師 艾瑞絲', en: 'Artisan Iris' }, agentId: 'artisan' }
}

const SKILL_NAMES: Record<SkillCategory, Record<string, string>> = {
  writing: { 'zh-TW': '寫作', en: 'Writing' },
  data: { 'zh-TW': '數據', en: 'Data' },
  visual: { 'zh-TW': '視覺', en: 'Visual' },
  code: { 'zh-TW': '程式', en: 'Code' },
  research: { 'zh-TW': '研究', en: 'Research' },
  organization: { 'zh-TW': '組織', en: 'Organization' },
  communication: { 'zh-TW': '溝通', en: 'Communication' }
}

export class QuestEngine {
  constructor(private questRepo: SqliteQuestRepository) {}

  /** Seed initially-visible quests for the given player. Idempotent — safe to call on every startup. */
  seedStarterQuests(playerId: string): void {
    const existing = this.questRepo.getByPlayer(playerId)
    const existingDefIds = new Set(existing.map((q) => q.questDefId))

    for (const def of QUEST_DEFINITIONS) {
      if (def.initialVisibility === 'visible' && !existingDefIds.has(def.id)) {
        this.questRepo.upsert({
          id: crypto.randomUUID(),
          playerId,
          questDefId: def.id,
          visibility: 'visible',
          status: 'active',
          repeatCount: 0,
          discoveredAt: Date.now(),
          completedAt: null
        })
      }
    }
  }

  /**
   * Evaluate all quest definitions against current player progress.
   * Discovers hidden quests whose preconditions are met, completes active quests
   * whose triggers are satisfied, and resets repeatable quests.
   * Returns a summary of all changes.
   */
  checkQuests(playerId: string): QuestCheckResult {
    const existing = this.questRepo.getByPlayer(playerId)

    // Gather counter data once
    const counts = this.questRepo.getConversationCounts(playerId)
    const dailyCount = this.questRepo.getDailyConversationCount(playerId)
    const distinctCategories = this.questRepo.getDistinctCategoryCount(playerId)
    const maxCategoryCount = this.questRepo.getMaxCategoryCount(playerId)
    const totalConversations = Object.values(counts).reduce((a, b) => a + b, 0)

    const discovered: QuestCheckResult['discovered'] = []
    const completed: QuestCheckResult['completed'] = []
    // Track quests completed in this pass to prevent repeatable quests from
    // re-triggering immediately after reset
    const justCompleted = new Set<string>()

    for (const def of QUEST_DEFINITIONS) {
      const row = existing.find((q) => q.questDefId === def.id)

      // Check hidden -> hinted/visible promotion
      if (!row && def.initialVisibility === 'hidden' && def.precondition) {
        if (this.checkPrecondition(def.precondition, maxCategoryCount, distinctCategories)) {
          const visibility: QuestVisibility = def.hintText ? 'hinted' : 'visible'
          this.questRepo.upsert({
            id: crypto.randomUUID(),
            playerId,
            questDefId: def.id,
            visibility,
            status: 'active',
            repeatCount: 0,
            discoveredAt: Date.now(),
            completedAt: null
          })
          discovered.push({ questDefId: def.id, visibility })
        }
        continue
      }

      // Check completion for active quests (skip quests just completed in this pass)
      if (row && row.status === 'active' && !justCompleted.has(def.id)) {
        const triggerMet = this.checkTrigger(
          def.trigger,
          counts,
          dailyCount,
          distinctCategories,
          maxCategoryCount,
          totalConversations
        )
        if (triggerMet) {
          this.questRepo.complete(row.id, Date.now())
          completed.push({
            questDefId: def.id,
            title: def.name,
            xpReward: def.xpReward
          })
          justCompleted.add(def.id)

          // Reset repeatable quests for next evaluation cycle
          if (def.repeatable) {
            this.questRepo.resetForRepeat(row.id)
          }
        }
      }
    }

    return {
      discovered,
      completed,
      quests: this.getPlayerQuests(playerId)
    }
  }

  /** Get all player quests with computed progress. */
  getPlayerQuests(playerId: string): PlayerQuest[] {
    const rows = this.questRepo.getByPlayer(playerId)
    const counts = this.questRepo.getConversationCounts(playerId)
    const dailyCount = this.questRepo.getDailyConversationCount(playerId)
    const distinctCategories = this.questRepo.getDistinctCategoryCount(playerId)
    const maxCategoryCount = this.questRepo.getMaxCategoryCount(playerId)
    const totalConversations = Object.values(counts).reduce((a, b) => a + b, 0)

    return rows
      .map((row) => {
        const def = getQuestDefinition(row.questDefId)
        if (!def) {
          console.warn(
            `[quest-engine] Unknown quest definition "${row.questDefId}" in player data — skipping`
          )
          return null
        }
        return {
          id: row.id,
          questDefId: row.questDefId,
          visibility: row.visibility,
          status: row.status,
          repeatCount: row.repeatCount,
          discoveredAt: row.discoveredAt,
          completedAt: row.completedAt,
          definition: def,
          progress: this.computeProgress(
            def.trigger,
            counts,
            dailyCount,
            distinctCategories,
            maxCategoryCount,
            totalConversations
          ),
          target: def.trigger.threshold
        }
      })
      .filter((q): q is PlayerQuest => q !== null)
  }

  getQuestDef(id: string): import('../shared/types').QuestDefinition | undefined {
    return getQuestDefinition(id)
  }

  /** Get quest board suggestion based on weakest skill. When tied, picks first in SKILL_CATEGORIES order. */
  getQuestBoardSuggestion(playerId: string): QuestBoardSuggestion {
    const counts = this.questRepo.getConversationCounts(playerId)
    let weakest: SkillCategory = SKILL_CATEGORIES[0]
    let minCount = Infinity

    for (const cat of SKILL_CATEGORIES) {
      const count = counts[cat] ?? 0
      if (count < minCount) {
        minCount = count
        weakest = cat
      }
    }

    const npc = SKILL_TO_NPC[weakest]
    return {
      weakestSkill: weakest,
      npcName: npc.name,
      agentId: npc.agentId,
      message: {
        'zh-TW': `你的${SKILL_NAMES[weakest]['zh-TW']}技能看起來還有很大的成長空間——試著找${npc.name['zh-TW']}聊聊吧！`,
        en: `Your ${SKILL_NAMES[weakest].en} skill has room to grow — try talking to ${npc.name.en}!`
      }
    }
  }

  private checkPrecondition(
    pre: QuestPrecondition,
    maxCategoryCount: number,
    distinctCategories: number
  ): boolean {
    switch (pre.type) {
      case 'max_category_count':
        return maxCategoryCount >= pre.threshold
      case 'category_coverage':
        return distinctCategories >= pre.threshold
    }
  }

  /** Resolve the current counter value for a given trigger type. */
  private resolveCurrentValue(
    trigger: import('../shared/types').QuestTrigger,
    counts: Record<string, number>,
    dailyCount: number,
    distinctCategories: number,
    maxCategoryCount: number,
    totalConversations: number
  ): number {
    switch (trigger.type) {
      case 'conversation_count':
        return totalConversations
      case 'category_count':
        return counts[trigger.skillCategory] ?? 0
      case 'max_category_count':
        return maxCategoryCount
      case 'daily_count':
        return dailyCount
      case 'category_coverage':
        return distinctCategories
    }
  }

  private checkTrigger(
    trigger: import('../shared/types').QuestTrigger,
    counts: Record<string, number>,
    dailyCount: number,
    distinctCategories: number,
    maxCategoryCount: number,
    totalConversations: number
  ): boolean {
    return (
      this.resolveCurrentValue(
        trigger,
        counts,
        dailyCount,
        distinctCategories,
        maxCategoryCount,
        totalConversations
      ) >= trigger.threshold
    )
  }

  private computeProgress(
    trigger: import('../shared/types').QuestTrigger,
    counts: Record<string, number>,
    dailyCount: number,
    distinctCategories: number,
    maxCategoryCount: number,
    totalConversations: number
  ): number {
    return Math.min(
      this.resolveCurrentValue(
        trigger,
        counts,
        dailyCount,
        distinctCategories,
        maxCategoryCount,
        totalConversations
      ),
      trigger.threshold
    )
  }
}
