import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../game/EventBus', () => ({
  EventBus: {
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn()
  }
}))

import { conversationManager } from './ConversationManager'
import { EventBus } from '../game/EventBus'

const mockedEmit = vi.mocked(EventBus.emit)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ConversationManager', () => {
  describe('getOrCreateConversation', () => {
    it('creates a new conversation with correct defaults', () => {
      const conv = conversationManager.getOrCreateConversation('agent-create-1')
      expect(conv).toEqual({
        agentId: 'agent-create-1',
        messages: [],
        streamingState: 'idle',
        hasUnread: false
      })
    })

    it('returns existing conversation on second call', () => {
      const first = conversationManager.getOrCreateConversation('agent-create-2')
      first.messages.push({ role: 'user', content: 'hello', timestamp: 1 })
      const second = conversationManager.getOrCreateConversation('agent-create-2')
      expect(second.messages).toHaveLength(1)
      expect(second).toBe(first)
    })
  })

  describe('getConversation', () => {
    it('returns null for unknown agentId', () => {
      expect(conversationManager.getConversation('agent-unknown-999')).toBeNull()
    })

    it('returns existing conversation', () => {
      conversationManager.getOrCreateConversation('agent-get-1')
      const result = conversationManager.getConversation('agent-get-1')
      expect(result).not.toBeNull()
      expect(result!.agentId).toBe('agent-get-1')
    })
  })

  describe('appendMessage', () => {
    it('adds message to conversation and increments version', () => {
      const vBefore = conversationManager.getVersion()
      const msg = { role: 'user' as const, content: 'hi', timestamp: 100 }
      conversationManager.appendMessage('agent-append-1', msg)

      const conv = conversationManager.getConversation('agent-append-1')
      expect(conv!.messages).toHaveLength(1)
      expect(conv!.messages[0]).toEqual(msg)
      expect(conversationManager.getVersion()).toBeGreaterThan(vBefore)
    })

    it('creates conversation if it does not exist', () => {
      conversationManager.appendMessage('agent-append-2', {
        role: 'user',
        content: 'test',
        timestamp: 200
      })
      expect(conversationManager.getConversation('agent-append-2')).not.toBeNull()
    })
  })

  describe('appendStreamChunk', () => {
    it('first chunk creates assistant message and sets state to streaming', () => {
      conversationManager.getOrCreateConversation('agent-chunk-1')
      conversationManager.appendStreamChunk('agent-chunk-1', 'Hello')

      const conv = conversationManager.getConversation('agent-chunk-1')!
      expect(conv.streamingState).toBe('streaming')
      expect(conv.messages).toHaveLength(1)
      expect(conv.messages[0].role).toBe('assistant')
      expect(conv.messages[0].content).toBe('Hello')
    })

    it('subsequent chunks append to existing assistant message', () => {
      conversationManager.getOrCreateConversation('agent-chunk-2')
      conversationManager.appendStreamChunk('agent-chunk-2', 'Hi ')
      conversationManager.appendStreamChunk('agent-chunk-2', 'there')

      const conv = conversationManager.getConversation('agent-chunk-2')!
      expect(conv.messages).toHaveLength(1)
      expect(conv.messages[0].content).toBe('Hi there')
    })
  })

  describe('finalizeStream', () => {
    it('sets state back to idle', () => {
      conversationManager.getOrCreateConversation('agent-finalize-1')
      conversationManager.appendStreamChunk('agent-finalize-1', 'response')
      expect(conversationManager.getStreamingState('agent-finalize-1')).toBe('streaming')

      conversationManager.finalizeStream('agent-finalize-1')
      expect(conversationManager.getStreamingState('agent-finalize-1')).toBe('idle')
    })

    it('emits ready speech bubble if dialogue is not active for this agent', () => {
      // Ensure active dialogue is set to a different agent
      conversationManager.setActiveDialogue('agent-other-finalize')

      conversationManager.getOrCreateConversation('agent-finalize-2')
      conversationManager.appendStreamChunk('agent-finalize-2', 'data')
      mockedEmit.mockClear()

      conversationManager.finalizeStream('agent-finalize-2')

      expect(mockedEmit).toHaveBeenCalledWith('npc:speech-bubble', {
        agentId: 'agent-finalize-2',
        style: 'ready'
      })
    })

    it('does not emit ready speech bubble if dialogue is active for this agent', () => {
      conversationManager.getOrCreateConversation('agent-finalize-3')
      conversationManager.appendStreamChunk('agent-finalize-3', 'data')
      conversationManager.setActiveDialogue('agent-finalize-3')
      mockedEmit.mockClear()

      conversationManager.finalizeStream('agent-finalize-3')

      expect(mockedEmit).not.toHaveBeenCalledWith('npc:speech-bubble', {
        agentId: 'agent-finalize-3',
        style: 'ready'
      })
    })
  })

  describe('markStreamError', () => {
    it('sets state to error', () => {
      conversationManager.getOrCreateConversation('agent-error-1')
      conversationManager.appendStreamChunk('agent-error-1', 'partial')
      conversationManager.markStreamError('agent-error-1')

      expect(conversationManager.getStreamingState('agent-error-1')).toBe('error')
    })
  })

  describe('markWaiting', () => {
    it('sets state to waiting', () => {
      conversationManager.getOrCreateConversation('agent-waiting-1')
      conversationManager.markWaiting('agent-waiting-1')

      expect(conversationManager.getStreamingState('agent-waiting-1')).toBe('waiting')
    })

    it('creates conversation if it does not exist', () => {
      conversationManager.markWaiting('agent-waiting-2')
      expect(conversationManager.getConversation('agent-waiting-2')).not.toBeNull()
      expect(conversationManager.getStreamingState('agent-waiting-2')).toBe('waiting')
    })
  })

  describe('prepareRetry', () => {
    it('resets state to idle and removes last assistant message', () => {
      conversationManager.getOrCreateConversation('agent-retry-1')
      conversationManager.appendMessage('agent-retry-1', {
        role: 'user',
        content: 'question',
        timestamp: 1
      })
      conversationManager.appendStreamChunk('agent-retry-1', 'partial response')
      conversationManager.markStreamError('agent-retry-1')

      conversationManager.prepareRetry('agent-retry-1')

      const conv = conversationManager.getConversation('agent-retry-1')!
      expect(conv.streamingState).toBe('idle')
      expect(conv.messages).toHaveLength(1)
      expect(conv.messages[0].role).toBe('user')
    })

    it('does not remove last message if it is a user message', () => {
      conversationManager.getOrCreateConversation('agent-retry-2')
      conversationManager.appendMessage('agent-retry-2', {
        role: 'user',
        content: 'question',
        timestamp: 1
      })
      conversationManager.markStreamError('agent-retry-2')

      conversationManager.prepareRetry('agent-retry-2')

      const conv = conversationManager.getConversation('agent-retry-2')!
      expect(conv.messages).toHaveLength(1)
      expect(conv.messages[0].role).toBe('user')
    })
  })

  describe('subscribe and getVersion', () => {
    it('calls listener on changes', () => {
      const listener = vi.fn()
      const unsub = conversationManager.subscribe(listener)

      conversationManager.appendMessage('agent-sub-1', {
        role: 'user',
        content: 'test',
        timestamp: 1
      })

      expect(listener).toHaveBeenCalledTimes(1)
      unsub()
    })

    it('version increments on each change', () => {
      const v1 = conversationManager.getVersion()
      conversationManager.appendMessage('agent-sub-2', {
        role: 'user',
        content: 'a',
        timestamp: 1
      })
      const v2 = conversationManager.getVersion()
      conversationManager.appendMessage('agent-sub-2', {
        role: 'user',
        content: 'b',
        timestamp: 2
      })
      const v3 = conversationManager.getVersion()

      expect(v2).toBe(v1 + 1)
      expect(v3).toBe(v2 + 1)
    })

    it('unsubscribe stops notifications', () => {
      const listener = vi.fn()
      const unsub = conversationManager.subscribe(listener)
      unsub()

      conversationManager.appendMessage('agent-sub-3', {
        role: 'user',
        content: 'ignored',
        timestamp: 1
      })

      expect(listener).not.toHaveBeenCalled()
    })
  })

  describe('setActiveDialogue', () => {
    it('clears hasUnread and emits speech bubble false', () => {
      conversationManager.setActiveDialogue(null) // reset
      conversationManager.getOrCreateConversation('agent-active-1')
      // Generate unread by streaming while dialogue is not active
      conversationManager.appendStreamChunk('agent-active-1', 'hello')
      const conv = conversationManager.getConversation('agent-active-1')!
      expect(conv.hasUnread).toBe(true)

      mockedEmit.mockClear()
      conversationManager.setActiveDialogue('agent-active-1')

      expect(conv.hasUnread).toBe(false)
      expect(mockedEmit).toHaveBeenCalledWith('npc:speech-bubble', {
        agentId: 'agent-active-1',
        style: false
      })
    })
  })

  describe('speech bubble events', () => {
    it('emits streaming style when chunks arrive for background NPC', () => {
      conversationManager.setActiveDialogue(null)
      conversationManager.getOrCreateConversation('agent-bubble-1')
      mockedEmit.mockClear()

      conversationManager.appendStreamChunk('agent-bubble-1', 'data')

      expect(mockedEmit).toHaveBeenCalledWith('npc:speech-bubble', {
        agentId: 'agent-bubble-1',
        style: 'streaming'
      })
    })

    it('emits ready on finalize for background NPC', () => {
      conversationManager.setActiveDialogue(null)
      conversationManager.getOrCreateConversation('agent-bubble-2')
      conversationManager.appendStreamChunk('agent-bubble-2', 'data')
      mockedEmit.mockClear()

      conversationManager.finalizeStream('agent-bubble-2')

      expect(mockedEmit).toHaveBeenCalledWith('npc:speech-bubble', {
        agentId: 'agent-bubble-2',
        style: 'ready'
      })
    })

    it('does not emit speech bubble when chunks arrive for active dialogue NPC', () => {
      conversationManager.getOrCreateConversation('agent-bubble-3')
      conversationManager.setActiveDialogue('agent-bubble-3')
      mockedEmit.mockClear()

      conversationManager.appendStreamChunk('agent-bubble-3', 'data')

      expect(mockedEmit).not.toHaveBeenCalledWith('npc:speech-bubble', {
        agentId: 'agent-bubble-3',
        style: 'streaming'
      })
    })
  })

  describe('getStreamingState', () => {
    it('returns idle for unknown agent', () => {
      expect(conversationManager.getStreamingState('agent-noexist-999')).toBe('idle')
    })
  })
})
