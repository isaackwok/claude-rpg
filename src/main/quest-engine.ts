import type {
  QuestCheckResult,
  PlayerQuest,
  QuestBoardSuggestion,
  QuestVisibility,
  SkillCategory,
  LocalizedString
} from '../shared/types'
import { SKILL_CATEGORIES } from '../shared/types'
import { QUEST_DEFINITIONS, getQuestDefinition } from './quest-definitions'
import type { SqliteQuestRepository } from './db/quest-repository'

const SKILL_TO_NPC: Record<SkillCategory, { name: LocalizedString; agentId: string }> = {
  writing: { name: { 'zh-TW': '書記官雷文', en: 'Scribe Raven' }, agentId: 'scribe' },
  research: { name: { 'zh-TW': '學者索菲亞', en: 'Scholar Sofia' }, agentId: 'scholar' },
  code: { name: { 'zh-TW': '法師瑪琳', en: 'Wizard Merlin' }, agentId: 'wizard' },
  data: { name: { 'zh-TW': '商人馬可', en: 'Merchant Marco' }, agentId: 'merchant' },
  communication: {
    name: { 'zh-TW': '傳令官娜歐蜜', en: 'Herald Naomi' },
    agentId: 'herald'
  },
  organization: {
    name: { 'zh-TW': '指揮官乃歐', en: 'Commander Neo' },
    agentId: 'commander'
  },
  visual: { name: { 'zh-TW': '工匠艾瑞絲', en: 'Artisan Iris' }, agentId: 'artisan' }
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

  /** Seed visible starter quests for a new player. Idempotent. */
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

  /** Check all quests after a conversation. Returns discoveries and completions. */
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

      // Check completion for active quests
      if (row && row.status === 'active') {
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

          // Reset repeatable quests
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

    return rows.map((row) => {
      const def = getQuestDefinition(row.questDefId)!
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
  }

  /** Get quest board suggestion based on weakest skill. */
  getQuestBoardSuggestion(playerId: string): QuestBoardSuggestion | null {
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
    pre: { type: string; threshold: number },
    maxCategoryCount: number,
    distinctCategories: number
  ): boolean {
    switch (pre.type) {
      case 'max_category_count':
        return maxCategoryCount >= pre.threshold
      case 'category_coverage':
        return distinctCategories >= pre.threshold
      default:
        return false
    }
  }

  private checkTrigger(
    trigger: { type: string; skillCategory?: string; threshold: number },
    counts: Record<string, number>,
    dailyCount: number,
    distinctCategories: number,
    maxCategoryCount: number,
    totalConversations: number
  ): boolean {
    switch (trigger.type) {
      case 'conversation_count':
        return totalConversations >= trigger.threshold
      case 'category_count':
        return (counts[trigger.skillCategory!] ?? 0) >= trigger.threshold
      case 'max_category_count':
        return maxCategoryCount >= trigger.threshold
      case 'daily_count':
        return dailyCount >= trigger.threshold
      case 'category_coverage':
        return distinctCategories >= trigger.threshold
      default:
        return false
    }
  }

  private computeProgress(
    trigger: { type: string; skillCategory?: string; threshold: number },
    counts: Record<string, number>,
    dailyCount: number,
    distinctCategories: number,
    maxCategoryCount: number,
    totalConversations: number
  ): number {
    switch (trigger.type) {
      case 'conversation_count':
        return Math.min(totalConversations, trigger.threshold)
      case 'category_count':
        return Math.min(counts[trigger.skillCategory!] ?? 0, trigger.threshold)
      case 'max_category_count':
        return Math.min(maxCategoryCount, trigger.threshold)
      case 'daily_count':
        return Math.min(dailyCount, trigger.threshold)
      case 'category_coverage':
        return Math.min(distinctCategories, trigger.threshold)
      default:
        return 0
    }
  }
}
