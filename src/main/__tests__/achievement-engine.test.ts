import { describe, it, expect, vi } from 'vitest'
import type { SqliteAchievementRepository } from '../db/achievement-repository'
import type { ProgressionEngine } from '../progression-engine'
import type { PlayerState } from '../../shared/types'
import { AchievementEngine } from '../achievement-engine'

// ── Helpers ────────────────────────────────────────────────────────────────

function makePlayerState(overrides: Partial<PlayerState> = {}): PlayerState {
  const skillLevel = (level: number) => ({ xp: level * level * 50, level })
  return {
    id: 'player-1',
    name: 'Isaac',
    locale: 'zh-TW',
    overallLevel: 0,
    totalXP: 0,
    title: { 'zh-TW': '新手冒險者', en: 'Novice Adventurer' },
    skills: {
      writing: skillLevel(0),
      research: skillLevel(0),
      code: skillLevel(0),
      data: skillLevel(0),
      communication: skillLevel(0),
      organization: skillLevel(0),
      visual: skillLevel(0)
    },
    ...overrides
  }
}

function makeRepo(
  overrides: Partial<Record<keyof SqliteAchievementRepository, unknown>> = {}
): SqliteAchievementRepository {
  return {
    unlock: vi.fn(),
    getUnlocked: vi.fn().mockReturnValue([]),
    recordZoneVisit: vi.fn(),
    getZoneVisitCount: vi.fn().mockReturnValue(0),
    getVisitedZones: vi.fn().mockReturnValue([]),
    recordToolUse: vi.fn(),
    getUsedToolTypes: vi.fn().mockReturnValue([]),
    getInteractedNpcCount: vi.fn().mockReturnValue(0),
    getDiscoveredQuestCount: vi.fn().mockReturnValue(0),
    ...overrides
  } as unknown as SqliteAchievementRepository
}

function makeProgressionEngine(playerState: PlayerState): ProgressionEngine {
  return {
    getPlayerState: vi.fn().mockReturnValue(playerState)
  } as unknown as ProgressionEngine
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('AchievementEngine', () => {
  const PLAYER_ID = 'player-1'

  describe('checkProgression()', () => {
    it('unlocks first-steps when overall level >= 5', () => {
      const playerState = makePlayerState({ overallLevel: 5 })
      const repo = makeRepo()
      const progressionEngine = makeProgressionEngine(playerState)
      const engine = new AchievementEngine(repo, progressionEngine)

      const result = engine.checkProgression(PLAYER_ID)

      expect(result.unlocked.some((u) => u.achievementDefId === 'first-steps')).toBe(true)
      expect(repo.unlock).toHaveBeenCalledWith(PLAYER_ID, 'first-steps')
    })

    it('unlocks skill-master when any category level >= 10', () => {
      const playerState = makePlayerState({
        skills: {
          writing: { xp: 5000, level: 10 },
          research: { xp: 0, level: 0 },
          code: { xp: 0, level: 0 },
          data: { xp: 0, level: 0 },
          communication: { xp: 0, level: 0 },
          organization: { xp: 0, level: 0 },
          visual: { xp: 0, level: 0 }
        }
      })
      const repo = makeRepo()
      const progressionEngine = makeProgressionEngine(playerState)
      const engine = new AchievementEngine(repo, progressionEngine)

      const result = engine.checkProgression(PLAYER_ID)

      expect(result.unlocked.some((u) => u.achievementDefId === 'skill-master')).toBe(true)
      expect(repo.unlock).toHaveBeenCalledWith(PLAYER_ID, 'skill-master')
    })

    it('does not re-unlock already-unlocked achievements', () => {
      const playerState = makePlayerState({ overallLevel: 5 })
      // first-steps is already unlocked
      const repo = makeRepo({ getUnlocked: vi.fn().mockReturnValue(['first-steps']) })
      const progressionEngine = makeProgressionEngine(playerState)
      const engine = new AchievementEngine(repo, progressionEngine)

      const result = engine.checkProgression(PLAYER_ID)

      expect(result.unlocked.some((u) => u.achievementDefId === 'first-steps')).toBe(false)
      expect(repo.unlock).not.toHaveBeenCalledWith(PLAYER_ID, 'first-steps')
    })

    it('does not unlock when level is below threshold', () => {
      const playerState = makePlayerState({ overallLevel: 4 })
      const repo = makeRepo()
      const progressionEngine = makeProgressionEngine(playerState)
      const engine = new AchievementEngine(repo, progressionEngine)

      const result = engine.checkProgression(PLAYER_ID)

      expect(result.unlocked.some((u) => u.achievementDefId === 'first-steps')).toBe(false)
    })
  })

  describe('checkExploration()', () => {
    it('unlocks town-explorer when 3 zones visited', () => {
      const repo = makeRepo({ getZoneVisitCount: vi.fn().mockReturnValue(3) })
      const progressionEngine = makeProgressionEngine(makePlayerState())
      const engine = new AchievementEngine(repo, progressionEngine)

      const result = engine.checkExploration(PLAYER_ID)

      expect(result.unlocked.some((u) => u.achievementDefId === 'town-explorer')).toBe(true)
      expect(repo.unlock).toHaveBeenCalledWith(PLAYER_ID, 'town-explorer')
    })

    it('does not unlock town-explorer when fewer than 3 zones visited', () => {
      const repo = makeRepo({ getZoneVisitCount: vi.fn().mockReturnValue(2) })
      const progressionEngine = makeProgressionEngine(makePlayerState())
      const engine = new AchievementEngine(repo, progressionEngine)

      const result = engine.checkExploration(PLAYER_ID)

      expect(result.unlocked.some((u) => u.achievementDefId === 'town-explorer')).toBe(false)
    })

    it('unlocks cartographer when all zones visited', () => {
      const TOTAL_ZONES = 6
      const repo = makeRepo({ getZoneVisitCount: vi.fn().mockReturnValue(TOTAL_ZONES) })
      const progressionEngine = makeProgressionEngine(makePlayerState())
      const engine = new AchievementEngine(repo, progressionEngine, { totalZones: TOTAL_ZONES })

      const result = engine.checkExploration(PLAYER_ID)

      expect(result.unlocked.some((u) => u.achievementDefId === 'cartographer')).toBe(true)
    })

    it('unlocks social-butterfly when all NPCs interacted', () => {
      const TOTAL_NPCS = 7
      const repo = makeRepo({ getInteractedNpcCount: vi.fn().mockReturnValue(TOTAL_NPCS) })
      const progressionEngine = makeProgressionEngine(makePlayerState())
      const engine = new AchievementEngine(repo, progressionEngine, { totalNpcs: TOTAL_NPCS })

      const result = engine.checkExploration(PLAYER_ID)

      expect(result.unlocked.some((u) => u.achievementDefId === 'social-butterfly')).toBe(true)
    })

    it('unlocks quest-seeker when all quests discovered', () => {
      const TOTAL_QUESTS = 5
      const repo = makeRepo({ getDiscoveredQuestCount: vi.fn().mockReturnValue(TOTAL_QUESTS) })
      const progressionEngine = makeProgressionEngine(makePlayerState())
      const engine = new AchievementEngine(repo, progressionEngine, { totalQuests: TOTAL_QUESTS })

      const result = engine.checkExploration(PLAYER_ID)

      expect(result.unlocked.some((u) => u.achievementDefId === 'quest-seeker')).toBe(true)
    })

    it('does not re-unlock already-unlocked exploration achievements', () => {
      const repo = makeRepo({
        getZoneVisitCount: vi.fn().mockReturnValue(3),
        getUnlocked: vi.fn().mockReturnValue(['town-explorer'])
      })
      const progressionEngine = makeProgressionEngine(makePlayerState())
      const engine = new AchievementEngine(repo, progressionEngine)

      const result = engine.checkExploration(PLAYER_ID)

      expect(result.unlocked.some((u) => u.achievementDefId === 'town-explorer')).toBe(false)
      expect(repo.unlock).not.toHaveBeenCalledWith(PLAYER_ID, 'town-explorer')
    })
  })

  describe('checkToolUse()', () => {
    it('unlocks tool-initiate when any file tool used', () => {
      const repo = makeRepo({ getUsedToolTypes: vi.fn().mockReturnValue(['read_file']) })
      const progressionEngine = makeProgressionEngine(makePlayerState())
      const engine = new AchievementEngine(repo, progressionEngine)

      const result = engine.checkToolUse(PLAYER_ID)

      expect(result.unlocked.some((u) => u.achievementDefId === 'tool-initiate')).toBe(true)
      expect(repo.unlock).toHaveBeenCalledWith(PLAYER_ID, 'tool-initiate')
    })

    it('unlocks tool-initiate with any file group tool (write_file)', () => {
      const repo = makeRepo({ getUsedToolTypes: vi.fn().mockReturnValue(['write_file']) })
      const progressionEngine = makeProgressionEngine(makePlayerState())
      const engine = new AchievementEngine(repo, progressionEngine)

      const result = engine.checkToolUse(PLAYER_ID)

      expect(result.unlocked.some((u) => u.achievementDefId === 'tool-initiate')).toBe(true)
    })

    it('unlocks tech-savvy when all 3 tool groups used', () => {
      const repo = makeRepo({
        getUsedToolTypes: vi.fn().mockReturnValue(['read_file', 'web_search', 'run_command'])
      })
      const progressionEngine = makeProgressionEngine(makePlayerState())
      const engine = new AchievementEngine(repo, progressionEngine)

      const result = engine.checkToolUse(PLAYER_ID)

      expect(result.unlocked.some((u) => u.achievementDefId === 'tech-savvy')).toBe(true)
      expect(repo.unlock).toHaveBeenCalledWith(PLAYER_ID, 'tech-savvy')
    })

    it('does not unlock tech-savvy when only 2 tool groups used', () => {
      const repo = makeRepo({
        getUsedToolTypes: vi.fn().mockReturnValue(['read_file', 'web_search'])
      })
      const progressionEngine = makeProgressionEngine(makePlayerState())
      const engine = new AchievementEngine(repo, progressionEngine)

      const result = engine.checkToolUse(PLAYER_ID)

      expect(result.unlocked.some((u) => u.achievementDefId === 'tech-savvy')).toBe(false)
    })

    it('does not re-unlock already-unlocked tool achievements', () => {
      const repo = makeRepo({
        getUsedToolTypes: vi.fn().mockReturnValue(['read_file']),
        getUnlocked: vi.fn().mockReturnValue(['tool-initiate'])
      })
      const progressionEngine = makeProgressionEngine(makePlayerState())
      const engine = new AchievementEngine(repo, progressionEngine)

      const result = engine.checkToolUse(PLAYER_ID)

      expect(result.unlocked.some((u) => u.achievementDefId === 'tool-initiate')).toBe(false)
      expect(repo.unlock).not.toHaveBeenCalledWith(PLAYER_ID, 'tool-initiate')
    })
  })

  describe('getAchievements()', () => {
    it('returns all definitions with unlock status', () => {
      const repo = makeRepo({ getUnlocked: vi.fn().mockReturnValue(['first-steps']) })
      const progressionEngine = makeProgressionEngine(makePlayerState())
      const engine = new AchievementEngine(repo, progressionEngine)

      const result = engine.getAchievements(PLAYER_ID)

      expect(result.length).toBeGreaterThan(0)
      const firstSteps = result.find((a) => a.achievementDefId === 'first-steps')
      expect(firstSteps).toBeDefined()
      expect(firstSteps!.unlocked).toBe(true)
      expect(firstSteps!.definition).toBeDefined()
      expect(firstSteps!.definition.id).toBe('first-steps')

      const skillMaster = result.find((a) => a.achievementDefId === 'skill-master')
      expect(skillMaster).toBeDefined()
      expect(skillMaster!.unlocked).toBe(false)
    })

    it('returns all 12 achievement definitions', () => {
      const repo = makeRepo()
      const progressionEngine = makeProgressionEngine(makePlayerState())
      const engine = new AchievementEngine(repo, progressionEngine)

      const result = engine.getAchievements(PLAYER_ID)

      expect(result).toHaveLength(12)
    })

    it('marks multiple unlocked achievements correctly', () => {
      const repo = makeRepo({
        getUnlocked: vi.fn().mockReturnValue(['first-steps', 'town-explorer', 'tool-initiate'])
      })
      const progressionEngine = makeProgressionEngine(makePlayerState())
      const engine = new AchievementEngine(repo, progressionEngine)

      const result = engine.getAchievements(PLAYER_ID)

      const unlocked = result.filter((a) => a.unlocked)
      expect(unlocked).toHaveLength(3)
      expect(unlocked.map((a) => a.achievementDefId)).toContain('first-steps')
      expect(unlocked.map((a) => a.achievementDefId)).toContain('town-explorer')
      expect(unlocked.map((a) => a.achievementDefId)).toContain('tool-initiate')
    })
  })
})
