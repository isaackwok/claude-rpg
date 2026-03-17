import { describe, it, expect } from 'vitest'
import { getAgentConfig, getAllAgentConfigs, AgentConfig } from './system-prompts'

describe('getAgentConfig', () => {
  it('returns correct config for known IDs', () => {
    const elder = getAgentConfig('elder')
    expect(elder).toBeDefined()
    expect(elder!.id).toBe('elder')
    expect(elder!.systemPrompt).toContain('長老')

    const wizard = getAgentConfig('wizard')
    expect(wizard).toBeDefined()
    expect(wizard!.id).toBe('wizard')
    expect(wizard!.systemPrompt).toContain('巫師')
  })

  it('returns undefined for unknown IDs', () => {
    expect(getAgentConfig('nonexistent')).toBeUndefined()
    expect(getAgentConfig('')).toBeUndefined()
  })
})

describe('getAllAgentConfigs', () => {
  it('returns all 10 agents', () => {
    const agents = getAllAgentConfigs()
    expect(agents).toHaveLength(10)
  })

  it('has unique agent IDs', () => {
    const agents = getAllAgentConfigs()
    const ids = agents.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every agent has required fields', () => {
    const agents = getAllAgentConfigs()
    for (const agent of agents) {
      expect(agent.id).toBeTruthy()
      expect(agent.systemPrompt).toBeTruthy()
      expect(agent.model).toBeTruthy()
      expect(agent.maxTokens).toBeGreaterThan(0)
      expect(agent.temperature).toBeGreaterThanOrEqual(0)
      expect(agent.temperature).toBeLessThanOrEqual(1)
    }
  })
})
