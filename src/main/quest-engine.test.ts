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
    // All other skills at 0 — picks first zero-XP skill in SKILL_CATEGORIES order (= 'data')
    // SKILL_CATEGORIES = ['writing', 'data', 'visual', 'code', 'research', 'organization', 'communication']
    // writing and research have XP, so first zero-XP category is 'data'

    const suggestion = engine.getQuestBoardSuggestion(PLAYER_ID)
    expect(suggestion.weakestSkill).toBe('data')
    expect(suggestion.agentId).toBe('merchant')
    expect(suggestion.npcName.en).toBe('Merchant Marco')
  })

  it('picks first SKILL_CATEGORIES entry when all skills are zero', () => {
    const suggestion = engine.getQuestBoardSuggestion(PLAYER_ID)
    // All zero — first in SKILL_CATEGORIES is 'writing'
    expect(suggestion.weakestSkill).toBe('writing')
    expect(suggestion.agentId).toBe('scribe')
  })

  // ── Repeatable quest lifecycle ──────────────────────────────────────

  describe('repeatable quest lifecycle', () => {
    it('completes daily-adventurer and resets it for future completion', () => {
      engine.seedStarterQuests(PLAYER_ID)
      // Simulate 3 daily conversations
      xpRepo.award(PLAYER_ID, 'research', 10, 'scholar')
      xpRepo.award(PLAYER_ID, 'writing', 10, 'scribe')
      xpRepo.award(PLAYER_ID, 'code', 10, 'wizard')

      const result = engine.checkQuests(PLAYER_ID)
      const dailyCompleted = result.completed.find((c) => c.questDefId === 'daily-adventurer')
      expect(dailyCompleted).toBeDefined()
      expect(dailyCompleted!.xpReward).toBe(30)

      // After completion + reset, the quest should appear as active in the quests list
      const dailyQuest = result.quests.find((q) => q.questDefId === 'daily-adventurer')!
      expect(dailyQuest.status).toBe('active')
      expect(dailyQuest.repeatCount).toBe(1)
    })

    it('does not re-trigger repeatable quest in the same checkQuests pass', () => {
      engine.seedStarterQuests(PLAYER_ID)
      // 3 daily conversations — enough to trigger daily-adventurer
      xpRepo.award(PLAYER_ID, 'research', 10, 'scholar')
      xpRepo.award(PLAYER_ID, 'writing', 10, 'scribe')
      xpRepo.award(PLAYER_ID, 'code', 10, 'wizard')

      const result = engine.checkQuests(PLAYER_ID)
      // Should only complete once, not double-count
      const dailyCompletions = result.completed.filter((c) => c.questDefId === 'daily-adventurer')
      expect(dailyCompletions).toHaveLength(1)
    })

    it('can re-complete repeatable quest on a subsequent checkQuests call with new data', () => {
      engine.seedStarterQuests(PLAYER_ID)
      // First 3 conversations
      xpRepo.award(PLAYER_ID, 'research', 10, 'scholar')
      xpRepo.award(PLAYER_ID, 'writing', 10, 'scribe')
      xpRepo.award(PLAYER_ID, 'code', 10, 'wizard')

      engine.checkQuests(PLAYER_ID) // completes + resets

      // 3 more conversations (6 total today)
      xpRepo.award(PLAYER_ID, 'data', 10, 'merchant')
      xpRepo.award(PLAYER_ID, 'organization', 10, 'commander')
      xpRepo.award(PLAYER_ID, 'communication', 10, 'herald')

      const result2 = engine.checkQuests(PLAYER_ID)
      // daily_count is now 6 >= threshold 3, so it should re-trigger
      const dailyCompleted = result2.completed.find((c) => c.questDefId === 'daily-adventurer')
      expect(dailyCompleted).toBeDefined()

      const dailyQuest = result2.quests.find((q) => q.questDefId === 'daily-adventurer')!
      expect(dailyQuest.repeatCount).toBe(2)
    })
  })

  // ── Unknown quest definition handling ──────────────────────────────────────

  it('silently skips quests with unknown definitions', () => {
    // Manually insert a quest row with a non-existent definition ID
    db.prepare(
      `INSERT INTO quests (id, player_id, quest_def_id, visibility, status, repeat_count, discovered_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run('orphan-1', PLAYER_ID, 'nonexistent-quest-def', 'visible', 'active', 0, Date.now(), null)

    const quests = engine.getPlayerQuests(PLAYER_ID)
    // Should not include the orphaned quest
    expect(quests.find((q) => q.questDefId === 'nonexistent-quest-def')).toBeUndefined()
    // But should not throw
  })
})
