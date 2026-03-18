import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from './db/migrations'
import { SqliteQuestRepository } from './db/quest-repository'
import { SqliteXPRepository } from './db/xp-repository'
import { QuestEngine } from './quest-engine'

describe('QuestEngine', () => {
  let db: Database.Database
  let questRepo: SqliteQuestRepository
  let xpRepo: SqliteXPRepository
  let engine: QuestEngine
  const PLAYER_ID = 'player-1'

  beforeEach(() => {
    db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    runMigrations(db)
    db.prepare('INSERT INTO players (id, name, locale, created_at) VALUES (?, ?, ?, ?)').run(
      PLAYER_ID,
      'Isaac',
      'zh-TW',
      Date.now()
    )
    questRepo = new SqliteQuestRepository(db)
    xpRepo = new SqliteXPRepository(db)
    engine = new QuestEngine(questRepo)
  })

  afterEach(() => db.close())

  it('seeds visible starter quests for new player', () => {
    engine.seedStarterQuests(PLAYER_ID)
    const quests = engine.getPlayerQuests(PLAYER_ID)
    const visible = quests.filter((q) => q.visibility === 'visible')
    expect(visible).toHaveLength(3) // first-contact, knowledge-collector, daily-adventurer
  })

  it('does not duplicate starter quests on re-seed', () => {
    engine.seedStarterQuests(PLAYER_ID)
    engine.seedStarterQuests(PLAYER_ID)
    const quests = engine.getPlayerQuests(PLAYER_ID)
    expect(quests.filter((q) => q.visibility === 'visible')).toHaveLength(3)
  })

  it('completes first-contact after 1 conversation', () => {
    engine.seedStarterQuests(PLAYER_ID)
    // Simulate 1 conversation (1 XP entry)
    xpRepo.award(PLAYER_ID, 'research', 10, 'scholar')

    const result = engine.checkQuests(PLAYER_ID)
    expect(result.completed).toHaveLength(1)
    expect(result.completed[0].questDefId).toBe('first-contact')
    expect(result.completed[0].xpReward).toBe(20)
  })

  it('discovers hidden quest when precondition met', () => {
    engine.seedStarterQuests(PLAYER_ID)
    // 3 conversations in research — triggers diligent-apprentice precondition
    xpRepo.award(PLAYER_ID, 'research', 10, 'scholar')
    xpRepo.award(PLAYER_ID, 'research', 10, 'scholar')
    xpRepo.award(PLAYER_ID, 'research', 10, 'scholar')

    const result = engine.checkQuests(PLAYER_ID)
    expect(result.discovered.some((d) => d.questDefId === 'diligent-apprentice')).toBe(true)
  })

  it('discovers renaissance quest when 2 categories used', () => {
    engine.seedStarterQuests(PLAYER_ID)
    xpRepo.award(PLAYER_ID, 'research', 10, 'scholar')
    xpRepo.award(PLAYER_ID, 'writing', 10, 'scribe')

    const result = engine.checkQuests(PLAYER_ID)
    expect(result.discovered.some((d) => d.questDefId === 'renaissance')).toBe(true)
  })

  it('does not re-discover already discovered quests', () => {
    engine.seedStarterQuests(PLAYER_ID)
    xpRepo.award(PLAYER_ID, 'research', 10, 'scholar')
    xpRepo.award(PLAYER_ID, 'writing', 10, 'scribe')

    engine.checkQuests(PLAYER_ID) // first check — discovers
    const result = engine.checkQuests(PLAYER_ID) // second check
    expect(result.discovered).toHaveLength(0)
  })

  it('does not re-complete already completed non-repeatable quests', () => {
    engine.seedStarterQuests(PLAYER_ID)
    xpRepo.award(PLAYER_ID, 'research', 10, 'scholar')

    engine.checkQuests(PLAYER_ID) // completes first-contact
    xpRepo.award(PLAYER_ID, 'writing', 10, 'scribe')
    const result = engine.checkQuests(PLAYER_ID)
    expect(result.completed.find((c) => c.questDefId === 'first-contact')).toBeUndefined()
  })

  it('computes progress for visible quests', () => {
    engine.seedStarterQuests(PLAYER_ID)
    xpRepo.award(PLAYER_ID, 'research', 10, 'scholar')
    xpRepo.award(PLAYER_ID, 'research', 10, 'scholar')

    const quests = engine.getPlayerQuests(PLAYER_ID)
    const kc = quests.find((q) => q.questDefId === 'knowledge-collector')!
    expect(kc.progress).toBe(2)
    expect(kc.target).toBe(3)
  })

  it('returns quest board suggestion for weakest skill', () => {
    xpRepo.award(PLAYER_ID, 'research', 50, 'scholar')
    xpRepo.award(PLAYER_ID, 'writing', 30, 'scribe')
    // All other skills at 0 — picks one of the zero-XP skills

    const suggestion = engine.getQuestBoardSuggestion(PLAYER_ID)
    expect(suggestion).not.toBeNull()
    expect(suggestion!.weakestSkill).toBeDefined()
    expect(suggestion!.agentId).toBeDefined()
  })
})
