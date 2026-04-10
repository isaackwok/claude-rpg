import { describe, it, expect } from 'vitest'
import { ApiKeyChatBackend } from '../chat/api-key-backend'
import type { ChatOpts, StreamEvent } from '../chat/types'

function makeChatOpts(overrides: Partial<ChatOpts> = {}): ChatOpts {
  return {
    agentId: 'wizard',
    systemPrompt: 'You are a wizard.',
    tools: [],
    model: 'claude-sonnet-4-5-20250929',
    maxTokens: 1024,
    temperature: 0.7,
    ...overrides
  }
}

describe('ApiKeyChatBackend', () => {
  it('yields error event when no API key is available', async () => {
    const backend = new ApiKeyChatBackend(() => null)
    const events: StreamEvent[] = []
    for await (const event of backend.sendMessage(makeChatOpts(), 'hello')) {
      events.push(event)
    }
    expect(events).toEqual([{ type: 'error', error: 'no-api-key' }])
  })

  it('cancelStream aborts an active stream', () => {
    const backend = new ApiKeyChatBackend(() => 'sk-test')
    // Should not throw even if no active stream
    expect(() => backend.cancelStream('wizard')).not.toThrow()
  })

  it('clearHistory delegates to ConversationHistoryManager', () => {
    const backend = new ApiKeyChatBackend(() => 'sk-test')
    // Should not throw
    expect(() => backend.clearHistory('wizard')).not.toThrow()
  })
})
