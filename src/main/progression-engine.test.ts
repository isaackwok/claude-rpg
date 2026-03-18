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
})
