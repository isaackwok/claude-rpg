import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from './db/migrations'
import { SqlitePlayerRepository } from './db/player-repository'
import { SqliteXPRepository } from './db/xp-repository'
import { ProgressionEngine } from './progression-engine'

describe('ProgressionEngine', () => {
  let db: Database.Database
  let engine: ProgressionEngine

  beforeEach(() => {
    db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    runMigrations(db)
    new SqlitePlayerRepository(db).getOrCreate('player-1')
    const xpRepo = new SqliteXPRepository(db)
    const playerRepo = new SqlitePlayerRepository(db)
    engine = new ProgressionEngine(xpRepo, playerRepo, 'player-1')
  })

  afterEach(() => db.close())

  it('awards XP split across multiple categories', () => {
    const result = engine.awardXP('scribe', ['writing', 'communication'])
    expect(result.awards).toHaveLength(2)
    expect(result.awards[0]).toEqual({ category: 'writing', amount: 5, newTotal: 5 })
    expect(result.awards[1]).toEqual({ category: 'communication', amount: 5, newTotal: 5 })
  })

  it('awards 10 XP to a single category', () => {
    const result = engine.awardXP('scholar', ['research'])
    expect(result.awards).toHaveLength(1)
    expect(result.awards[0]).toEqual({ category: 'research', amount: 10, newTotal: 10 })
  })

  it('returns empty result for agents with no skills', () => {
    const result = engine.awardXP('bartender', [])
    expect(result.awards).toHaveLength(0)
    expect(result.levelUps).toHaveLength(0)
  })

  it('detects category level-up', () => {
    // Level 1 requires 50 XP = 5 interactions of 10 XP
    for (let i = 0; i < 4; i++) {
      engine.awardXP('scholar', ['research'])
    }
    const result = engine.awardXP('scholar', ['research']) // 50 XP total
    expect(result.levelUps).toEqual([{ category: 'research', newLevel: 1 }])
  })

  it('computes category level from XP', () => {
    expect(ProgressionEngine.computeCategoryLevel(0)).toBe(0)
    expect(ProgressionEngine.computeCategoryLevel(49)).toBe(0)
    expect(ProgressionEngine.computeCategoryLevel(50)).toBe(1)
    expect(ProgressionEngine.computeCategoryLevel(199)).toBe(1)
    expect(ProgressionEngine.computeCategoryLevel(200)).toBe(2)
    expect(ProgressionEngine.computeCategoryLevel(450)).toBe(3)
  })

  it('computes overall level from total XP', () => {
    expect(ProgressionEngine.computeOverallLevel(0)).toBe(0)
    expect(ProgressionEngine.computeOverallLevel(99)).toBe(0)
    expect(ProgressionEngine.computeOverallLevel(100)).toBe(1)
    expect(ProgressionEngine.computeOverallLevel(399)).toBe(1)
    expect(ProgressionEngine.computeOverallLevel(400)).toBe(2)
  })

  it('returns default title when fewer than 2 categories have XP', () => {
    const state = engine.getPlayerState()
    expect(state.title).toEqual({ 'zh-TW': '新手冒險者', en: 'Novice Adventurer' })
  })

  it('computes title from top 2 categories', () => {
    // Give XP to two categories
    for (let i = 0; i < 5; i++) engine.awardXP('scholar', ['research'])
    for (let i = 0; i < 3; i++) engine.awardXP('scribe', ['writing'])

    const state = engine.getPlayerState()
    // Primary = research (50 XP), secondary = writing (30 XP)
    // Title = writing adjective + research noun
    expect(state.title['zh-TW']).toBe('文雅求知者')
    expect(state.title['en']).toBe('Eloquent Seeker')
  })

  it('detects overall level-up', () => {
    // Overall level 1 requires 100 XP total = 10 interactions
    for (let i = 0; i < 9; i++) {
      engine.awardXP('scholar', ['research'])
    }
    const result = engine.awardXP('scholar', ['research']) // 100 XP total
    expect(result.overallLevelUp).toEqual({ newLevel: 1 })
  })

  it('returns full player state', () => {
    engine.awardXP('scholar', ['research'])
    engine.awardXP('scribe', ['writing'])

    const state = engine.getPlayerState()
    expect(state.id).toBe('player-1')
    expect(state.name).toBe('Isaac')
    expect(state.totalXP).toBe(20)
    expect(state.skills.research.xp).toBe(10)
    expect(state.skills.writing.xp).toBe(10)
    expect(state.skills.code.xp).toBe(0)
  })

  // ── awardBonusXP ──────────────────────────────────────

  describe('awardBonusXP', () => {
    it('returns empty result for zero amount', () => {
      const result = engine.awardBonusXP(0, ['research'], 'quest')
      expect(result.awards).toHaveLength(0)
      expect(result.levelUps).toHaveLength(0)
    })

    it('returns empty result for empty categories', () => {
      const result = engine.awardBonusXP(100, [], 'quest')
      expect(result.awards).toHaveLength(0)
    })

    it('awards bonus XP to a single category', () => {
      const result = engine.awardBonusXP(30, ['research'], 'quest')
      expect(result.awards).toHaveLength(1)
      expect(result.awards[0]).toEqual({ category: 'research', amount: 30, newTotal: 30 })
    })

    it('splits bonus XP across multiple categories with remainder', () => {
      const result = engine.awardBonusXP(100, ['research', 'writing', 'code'], 'quest')
      expect(result.awards).toHaveLength(3)
      // 100 / 3 = 33 base, remainder 1 → first category gets 34
      expect(result.awards[0]).toEqual({ category: 'research', amount: 34, newTotal: 34 })
      expect(result.awards[1]).toEqual({ category: 'writing', amount: 33, newTotal: 33 })
      expect(result.awards[2]).toEqual({ category: 'code', amount: 33, newTotal: 33 })
    })

    it('detects category level-up from bonus XP', () => {
      // Level 1 requires 50 XP
      const result = engine.awardBonusXP(50, ['research'], 'quest')
      expect(result.levelUps).toEqual([{ category: 'research', newLevel: 1 }])
    })

    it('detects overall level-up from bonus XP', () => {
      // Overall level 1 requires 100 total XP
      const result = engine.awardBonusXP(100, ['research'], 'quest')
      expect(result.overallLevelUp).toEqual({ newLevel: 1 })
    })

    it('detects title change from bonus XP', () => {
      // Give initial XP to 2 categories so we have a title
      for (let i = 0; i < 5; i++) engine.awardXP('scholar', ['research']) // 50 XP
      for (let i = 0; i < 3; i++) engine.awardXP('scribe', ['writing']) // 30 XP
      const oldState = engine.getPlayerState()
      expect(oldState.title['en']).toBe('Eloquent Seeker')

      // Award enough bonus XP to writing to flip primary/secondary
      const result = engine.awardBonusXP(100, ['writing'], 'quest')
      // writing now 130 XP > research 50 XP → primary=writing, secondary=research
      expect(result.titleChanged).toBeDefined()
      expect(result.titleChanged!['en']).toContain('Wordsmith')
    })

    it('returns no title change when title stays the same', () => {
      for (let i = 0; i < 5; i++) engine.awardXP('scholar', ['research']) // 50 XP
      for (let i = 0; i < 3; i++) engine.awardXP('scribe', ['writing']) // 30 XP

      // Small bonus that doesn't change rankings
      const result = engine.awardBonusXP(5, ['research'], 'quest')
      expect(result.titleChanged).toBeUndefined()
    })
  })

  // ── computeTitle tier prefixes ──────────────────────────────────────

  describe('computeTitle tier prefixes', () => {
    it('returns no prefix when overallLevel is undefined', () => {
      const skills = {
        writing: 100,
        research: 60,
        data: 0,
        visual: 0,
        code: 0,
        organization: 0,
        communication: 0
      }
      const title = ProgressionEngine.computeTitle(skills, undefined)
      expect(title['en']).toBe('Learned Wordsmith')
      expect(title['zh-TW']).toBe('博學文匠')
    })

    it('returns no prefix when overallLevel < 5', () => {
      const skills = {
        writing: 100,
        research: 60,
        data: 0,
        visual: 0,
        code: 0,
        organization: 0,
        communication: 0
      }
      const title = ProgressionEngine.computeTitle(skills, 4)
      expect(title['en']).toBe('Learned Wordsmith')
    })

    it('returns Apprentice prefix at overallLevel 5', () => {
      const skills = {
        writing: 100,
        research: 60,
        data: 0,
        visual: 0,
        code: 0,
        organization: 0,
        communication: 0
      }
      const title = ProgressionEngine.computeTitle(skills, 5)
      expect(title['en']).toBe('Apprentice Learned Wordsmith')
      expect(title['zh-TW']).toBe('見習・博學文匠')
    })

    it('returns Skilled prefix at overallLevel 10', () => {
      const skills = {
        writing: 100,
        research: 60,
        data: 0,
        visual: 0,
        code: 0,
        organization: 0,
        communication: 0
      }
      const title = ProgressionEngine.computeTitle(skills, 10)
      expect(title['en']).toBe('Skilled Learned Wordsmith')
      expect(title['zh-TW']).toBe('熟練・博學文匠')
    })

    it('returns Veteran prefix at overallLevel 15', () => {
      const skills = {
        writing: 100,
        research: 60,
        data: 0,
        visual: 0,
        code: 0,
        organization: 0,
        communication: 0
      }
      const title = ProgressionEngine.computeTitle(skills, 15)
      expect(title['en']).toBe('Veteran Learned Wordsmith')
      expect(title['zh-TW']).toBe('資深・博學文匠')
    })

    it('returns Legendary prefix at overallLevel 20', () => {
      const skills = {
        writing: 100,
        research: 60,
        data: 0,
        visual: 0,
        code: 0,
        organization: 0,
        communication: 0
      }
      const title = ProgressionEngine.computeTitle(skills, 20)
      expect(title['en']).toBe('Legendary Learned Wordsmith')
      expect(title['zh-TW']).toBe('傳奇・博學文匠')
    })

    it('returns Legendary prefix at overallLevel above 20', () => {
      const skills = {
        writing: 100,
        research: 60,
        data: 0,
        visual: 0,
        code: 0,
        organization: 0,
        communication: 0
      }
      const title = ProgressionEngine.computeTitle(skills, 25)
      expect(title['en']).toBe('Legendary Learned Wordsmith')
    })
  })
})
