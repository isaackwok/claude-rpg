import type { SkillCategory, LocalizedString, XPAwardResult, SkillMap } from '../shared/types'
import { SKILL_CATEGORIES } from '../shared/types'
import type { SqliteXPRepository } from './db/xp-repository'
import type { SqlitePlayerRepository } from './db/player-repository'

const titleNouns: Record<string, Record<SkillCategory, string>> = {
  'zh-TW': {
    writing: '文匠',
    data: '煉金師',
    visual: '法師',
    code: '巫師',
    research: '求知者',
    organization: '統帥',
    communication: '使者'
  },
  en: {
    writing: 'Wordsmith',
    data: 'Alchemist',
    visual: 'Mage',
    code: 'Sorcerer',
    research: 'Seeker',
    organization: 'Commander',
    communication: 'Diplomat'
  }
}

const titleAdjectives: Record<string, Record<SkillCategory, string>> = {
  'zh-TW': {
    writing: '文雅',
    data: '精算',
    visual: '幻象',
    code: '奧術',
    research: '博學',
    organization: '戰略',
    communication: '親和'
  },
  en: {
    writing: 'Eloquent',
    data: 'Analytical',
    visual: 'Arcane',
    code: 'Mystic',
    research: 'Learned',
    organization: 'Strategic',
    communication: 'Charismatic'
  }
}

const DEFAULT_TITLE: LocalizedString = { 'zh-TW': '新手冒險者', en: 'Novice Adventurer' }
const XP_PER_INTERACTION = 10

export const TITLE_TIERS: { minLevel: number; zhTW: string; en: string }[] = [
  { minLevel: 20, zhTW: '傳奇', en: 'Legendary' },
  { minLevel: 15, zhTW: '資深', en: 'Veteran' },
  { minLevel: 10, zhTW: '熟練', en: 'Skilled' },
  { minLevel: 5, zhTW: '見習', en: 'Apprentice' }
]

export class ProgressionEngine {
  constructor(
    private xpRepo: SqliteXPRepository,
    private playerRepo: SqlitePlayerRepository,
    private playerId: string
  ) {}

  /** Award bonus XP (e.g. quest rewards), divided across given categories with remainder going to the first N. */
  awardBonusXP(
    totalAmount: number,
    skillCategories: readonly SkillCategory[],
    agentId: string,
    source: 'quest_bonus' | 'achievement_bonus' = 'quest_bonus'
  ): XPAwardResult {
    if (skillCategories.length === 0 || totalAmount <= 0) {
      return { awards: [], levelUps: [] }
    }

    const oldTotals = this.xpRepo.getSkillTotals(this.playerId)
    const oldOverallXP = Object.values(oldTotals).reduce((a, b) => a + b, 0)
    const oldOverallLevel = ProgressionEngine.computeOverallLevel(oldOverallXP)
    const oldTitle = ProgressionEngine.computeTitle(oldTotals, oldOverallLevel)

    const base = Math.floor(totalAmount / skillCategories.length)
    const remainder = totalAmount % skillCategories.length

    for (let i = 0; i < skillCategories.length; i++) {
      const amount = base + (i < remainder ? 1 : 0)
      this.xpRepo.award(this.playerId, skillCategories[i], amount, agentId, source)
    }

    const newTotals = this.xpRepo.getSkillTotals(this.playerId)
    const awards: XPAwardResult['awards'] = []
    for (let i = 0; i < skillCategories.length; i++) {
      awards.push({
        category: skillCategories[i],
        amount: base + (i < remainder ? 1 : 0),
        newTotal: newTotals[skillCategories[i]]
      })
    }

    const levelUps: XPAwardResult['levelUps'] = []
    for (const category of skillCategories) {
      const oldLevel = ProgressionEngine.computeCategoryLevel(oldTotals[category])
      const newLevel = ProgressionEngine.computeCategoryLevel(newTotals[category])
      if (newLevel > oldLevel) {
        levelUps.push({ category, newLevel })
      }
    }

    const newOverallXP = Object.values(newTotals).reduce((a, b) => a + b, 0)
    const newOverallLevel = ProgressionEngine.computeOverallLevel(newOverallXP)
    const overallLevelUp =
      newOverallLevel > oldOverallLevel ? { newLevel: newOverallLevel } : undefined

    const newTitle = ProgressionEngine.computeTitle(newTotals, newOverallLevel)
    const titleChanged =
      JSON.stringify(newTitle) !== JSON.stringify(oldTitle) ? newTitle : undefined

    return { awards, levelUps, overallLevelUp, titleChanged }
  }

  awardXP(agentId: string, skillCategories: readonly SkillCategory[]): XPAwardResult {
    if (skillCategories.length === 0) {
      return { awards: [], levelUps: [] }
    }

    // Get current state before awarding
    const oldTotals = this.xpRepo.getSkillTotals(this.playerId)
    const oldOverallXP = Object.values(oldTotals).reduce((a, b) => a + b, 0)
    const oldOverallLevel = ProgressionEngine.computeOverallLevel(oldOverallXP)
    const oldTitle = ProgressionEngine.computeTitle(oldTotals, oldOverallLevel)

    // Split XP evenly across categories, distribute remainder to first N
    const base = Math.floor(XP_PER_INTERACTION / skillCategories.length)
    const remainder = XP_PER_INTERACTION % skillCategories.length
    const awards: XPAwardResult['awards'] = []

    for (let i = 0; i < skillCategories.length; i++) {
      const amount = base + (i < remainder ? 1 : 0)
      this.xpRepo.award(this.playerId, skillCategories[i], amount, agentId)
    }

    // Get new totals after awarding
    const newTotals = this.xpRepo.getSkillTotals(this.playerId)

    for (let i = 0; i < skillCategories.length; i++) {
      const category = skillCategories[i]
      awards.push({
        category,
        amount: base + (i < remainder ? 1 : 0),
        newTotal: newTotals[category]
      })
    }

    // Check for category level-ups
    const levelUps: XPAwardResult['levelUps'] = []
    for (const category of skillCategories) {
      const oldLevel = ProgressionEngine.computeCategoryLevel(oldTotals[category])
      const newLevel = ProgressionEngine.computeCategoryLevel(newTotals[category])
      if (newLevel > oldLevel) {
        levelUps.push({ category, newLevel })
      }
    }

    // Check for overall level-up
    const newOverallXP = Object.values(newTotals).reduce((a, b) => a + b, 0)
    const newOverallLevel = ProgressionEngine.computeOverallLevel(newOverallXP)
    const overallLevelUp =
      newOverallLevel > oldOverallLevel ? { newLevel: newOverallLevel } : undefined

    // Check for title change
    const newTitle = ProgressionEngine.computeTitle(newTotals, newOverallLevel)
    const titleChanged =
      JSON.stringify(newTitle) !== JSON.stringify(oldTitle) ? newTitle : undefined

    return { awards, levelUps, overallLevelUp, titleChanged }
  }

  getPlayerState(): import('../shared/types').PlayerState {
    const player = this.playerRepo.getOrCreate(this.playerId)
    const totals = this.xpRepo.getSkillTotals(this.playerId)
    const totalXP = Object.values(totals).reduce((a, b) => a + b, 0)

    const skills = {} as SkillMap
    for (const cat of SKILL_CATEGORIES) {
      skills[cat] = {
        xp: totals[cat],
        level: ProgressionEngine.computeCategoryLevel(totals[cat])
      }
    }

    return {
      id: player.id,
      name: player.name,
      locale: player.locale,
      overallLevel: ProgressionEngine.computeOverallLevel(totalXP),
      title: ProgressionEngine.computeTitle(totals, ProgressionEngine.computeOverallLevel(totalXP)),
      totalXP,
      skills
    }
  }

  /** Category level from XP: level N requires 50 * N² XP */
  static computeCategoryLevel(xp: number): number {
    return Math.floor(Math.sqrt(xp / 50))
  }

  /** Overall level from total XP: level N requires 100 * N² XP */
  static computeOverallLevel(totalXP: number): number {
    return Math.floor(Math.sqrt(totalXP / 100))
  }

  /**
   * Compute title from the top 2 skill categories by XP.
   * - Primary category determines the noun (e.g., "Wordsmith")
   * - Secondary category determines the adjective (e.g., "Learned")
   * - Returns DEFAULT_TITLE if fewer than 2 categories have XP
   * - Prepends tier prefix (Apprentice/Skilled/Veteran/Legendary) when overallLevel >= 5
   */
  static computeTitle(
    skills: Record<SkillCategory, number>,
    overallLevel?: number
  ): LocalizedString {
    const withXP = Object.entries(skills)
      .filter(([, xp]) => xp > 0)
      .sort(([, a], [, b]) => b - a)

    if (withXP.length < 2) {
      return DEFAULT_TITLE
    }

    const [primary] = withXP[0]
    const [secondary] = withXP[1]

    const baseZhTW =
      titleAdjectives['zh-TW'][secondary as SkillCategory] +
      titleNouns['zh-TW'][primary as SkillCategory]
    const baseEn =
      titleAdjectives['en'][secondary as SkillCategory] +
      ' ' +
      titleNouns['en'][primary as SkillCategory]

    // Add tier prefix based on overall level
    const tier =
      overallLevel !== undefined ? TITLE_TIERS.find((t) => overallLevel >= t.minLevel) : undefined

    if (!tier) {
      return { 'zh-TW': baseZhTW, en: baseEn }
    }

    return {
      'zh-TW': `${tier.zhTW}・${baseZhTW}`,
      en: `${tier.en} ${baseEn}`
    }
  }
}
