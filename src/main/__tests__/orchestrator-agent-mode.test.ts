import { describe, it, expect } from 'vitest'
import { ChatOrchestrator } from '../chat/orchestrator'
import type { IChatBackend, ChatOpts, StreamEvent, ToolResult } from '../chat/types'

// Minimal mock backend that records ChatOpts
class MockBackend implements IChatBackend {
  managesTools = true
  lastOpts: ChatOpts | null = null
  async *sendMessage(opts: ChatOpts, _message: string): AsyncIterable<StreamEvent> {
    this.lastOpts = opts
    yield { type: 'end' }
  }
  supplyToolResults(_agentId: string, _results: ToolResult[]): void {}
  cancelStream(): void {}
  clearHistory(): void {}
}

describe('ChatOrchestrator per-agent mode', () => {
  it('returns default mode when no agent mode is set', () => {
    const orchestrator = new ChatOrchestrator(new MockBackend())
    expect(orchestrator.getAgentMode('wizard')).toBe('default')
  })

  it('stores and retrieves per-agent mode', () => {
    const orchestrator = new ChatOrchestrator(new MockBackend())
    orchestrator.setAgentMode('wizard', 'plan')
    expect(orchestrator.getAgentMode('wizard')).toBe('plan')
    expect(orchestrator.getAgentMode('scribe')).toBe('default')
  })

  it('uses global fallback when provided', () => {
    const orchestrator = new ChatOrchestrator(new MockBackend())
    orchestrator.setGlobalModeFallback(() => 'auto')
    expect(orchestrator.getAgentMode('wizard')).toBe('auto')
    orchestrator.setAgentMode('wizard', 'plan')
    expect(orchestrator.getAgentMode('wizard')).toBe('plan')
  })
})
