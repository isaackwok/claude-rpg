import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { WebContents } from 'electron'

vi.mock('./api-key', () => ({
  getApiKey: vi.fn()
}))

vi.mock('./agents/system-prompts', () => ({
  getAgentConfig: vi.fn()
}))

// Mock the Anthropic SDK
const mockOn = vi.fn()
const mockFinalMessage = vi.fn()
const mockStream = vi.fn(() => ({
  on: mockOn,
  finalMessage: mockFinalMessage
}))

vi.mock('@anthropic-ai/sdk', () => {
  const MockAnthropic = vi.fn(function () {
    return { messages: { stream: mockStream } }
  })
  return { default: MockAnthropic }
})

import { handleSendMessage, cancelStream } from './chat'
import { getApiKey } from './api-key'
import { getAgentConfig } from './agents/system-prompts'

const mockedGetApiKey = vi.mocked(getApiKey)
const mockedGetAgentConfig = vi.mocked(getAgentConfig)

function createMockWebContents() {
  return {
    send: vi.fn(),
    isDestroyed: vi.fn(() => false)
  } as unknown as WebContents
}

const VALID_AGENT_CONFIG = {
  systemPrompt: 'You are an NPC.',
  model: 'claude-sonnet-4-20250514',
  maxTokens: 1024,
  temperature: 0.7
}

describe('chat', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFinalMessage.mockResolvedValue({})
    // Default: mockOn does nothing (no text events emitted)
    mockOn.mockReturnThis()
  })

  describe('handleSendMessage', () => {
    it('sends stream-error with no-api-key when API key is missing', async () => {
      mockedGetApiKey.mockReturnValue(null)
      const wc = createMockWebContents()

      handleSendMessage('scribe', 'hello', 'zh-TW', wc)
      // executeStream is async but not awaited by handleSendMessage — give it a tick
      await vi.waitFor(() => {
        expect(wc.send).toHaveBeenCalledWith('chat:stream-error', {
          agentId: 'scribe',
          error: 'no-api-key'
        })
      })
    })

    it('sends stream-error when agent config is unknown', async () => {
      mockedGetApiKey.mockReturnValue('sk-test-key')
      mockedGetAgentConfig.mockReturnValue(undefined as never)
      const wc = createMockWebContents()

      handleSendMessage('nonexistent', 'hello', 'zh-TW', wc)
      await vi.waitFor(() => {
        expect(wc.send).toHaveBeenCalledWith('chat:stream-error', {
          agentId: 'nonexistent',
          error: 'Unknown agent: nonexistent'
        })
      })
    })

    it('calls Anthropic SDK stream with correct params for valid agent', async () => {
      mockedGetApiKey.mockReturnValue('sk-test-key')
      mockedGetAgentConfig.mockReturnValue(VALID_AGENT_CONFIG as never)
      const wc = createMockWebContents()

      handleSendMessage('scribe', 'hello', 'zh-TW', wc)
      await vi.waitFor(() => {
        expect(mockStream).toHaveBeenCalledWith(
          expect.objectContaining({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1024,
            temperature: 0.7,
            system: 'You are an NPC.',
            messages: [{ role: 'user', content: 'hello' }]
          }),
          expect.objectContaining({ signal: expect.any(AbortSignal) })
        )
      })
    })

    it('appends English instruction to system prompt when locale is en', async () => {
      mockedGetApiKey.mockReturnValue('sk-test-key')
      mockedGetAgentConfig.mockReturnValue(VALID_AGENT_CONFIG as never)
      const wc = createMockWebContents()

      handleSendMessage('scribe', 'hello', 'en', wc)
      await vi.waitFor(() => {
        expect(mockStream).toHaveBeenCalledWith(
          expect.objectContaining({
            system: 'You are an NPC.\n\nThe player is using English. Respond in English.'
          }),
          expect.anything()
        )
      })
    })

    it('sends stream-end on successful completion', async () => {
      mockedGetApiKey.mockReturnValue('sk-test-key')
      mockedGetAgentConfig.mockReturnValue(VALID_AGENT_CONFIG as never)
      const wc = createMockWebContents()

      handleSendMessage('scribe', 'hello', 'zh-TW', wc)
      await vi.waitFor(() => {
        expect(wc.send).toHaveBeenCalledWith('chat:stream-end', { agentId: 'scribe' })
      })
    })

    it('sends stream-chunk when text events arrive', async () => {
      mockedGetApiKey.mockReturnValue('sk-test-key')
      mockedGetAgentConfig.mockReturnValue(VALID_AGENT_CONFIG as never)

      // Capture the 'text' callback and invoke it
      mockOn.mockImplementation(function (
        this: unknown,
        event: string,
        cb: (text: string) => void
      ) {
        if (event === 'text') {
          cb('chunk1')
          cb('chunk2')
        }
        return this
      })

      const wc = createMockWebContents()
      handleSendMessage('scribe', 'hello', 'zh-TW', wc)

      await vi.waitFor(() => {
        expect(wc.send).toHaveBeenCalledWith('chat:stream-chunk', {
          agentId: 'scribe',
          chunk: 'chunk1'
        })
        expect(wc.send).toHaveBeenCalledWith('chat:stream-chunk', {
          agentId: 'scribe',
          chunk: 'chunk2'
        })
      })
    })

    it('does not send to destroyed webContents', async () => {
      mockedGetApiKey.mockReturnValue('sk-test-key')
      mockedGetAgentConfig.mockReturnValue(VALID_AGENT_CONFIG as never)

      const wc = createMockWebContents()
      ;(wc.isDestroyed as ReturnType<typeof vi.fn>).mockReturnValue(true)

      handleSendMessage('scribe', 'hello', 'zh-TW', wc)
      await vi.waitFor(() => {
        expect(mockStream).toHaveBeenCalled()
      })
      // stream-end should NOT be sent to destroyed webContents
      expect(wc.send).not.toHaveBeenCalledWith('chat:stream-end', expect.anything())
    })

    it('sends stream-error when SDK throws', async () => {
      mockedGetApiKey.mockReturnValue('sk-test-key')
      mockedGetAgentConfig.mockReturnValue(VALID_AGENT_CONFIG as never)
      mockFinalMessage.mockRejectedValueOnce(new Error('rate limit exceeded'))
      const wc = createMockWebContents()

      handleSendMessage('scribe', 'hello', 'zh-TW', wc)
      await vi.waitFor(() => {
        expect(wc.send).toHaveBeenCalledWith('chat:stream-error', {
          agentId: 'scribe',
          error: 'rate limit exceeded'
        })
      })
    })

    it('queues requests when MAX_CONCURRENT_STREAMS is reached', async () => {
      mockedGetApiKey.mockReturnValue('sk-test-key')
      mockedGetAgentConfig.mockReturnValue(VALID_AGENT_CONFIG as never)

      // Make the first 3 streams hang by never resolving finalMessage
      let resolvers: Array<() => void> = []
      mockFinalMessage.mockImplementation(
        () => new Promise<void>((resolve) => resolvers.push(resolve))
      )

      const wc = createMockWebContents()

      // Fill all 3 slots with unique agent IDs (activeStreams is keyed by agentId)
      handleSendMessage('agent-1', 'msg1', 'zh-TW', wc)
      handleSendMessage('agent-2', 'msg2', 'zh-TW', wc)
      handleSendMessage('agent-3', 'msg3', 'zh-TW', wc)

      // Wait for 3 streams to start
      await vi.waitFor(() => {
        expect(mockStream).toHaveBeenCalledTimes(3)
      })

      // 4th should be queued, not immediately started
      handleSendMessage('agent-4', 'msg4', 'zh-TW', wc)
      // Give a tick for any async work
      await Promise.resolve()
      expect(mockStream).toHaveBeenCalledTimes(3)

      // Resolve one stream — queued request should start
      resolvers[0]()
      await vi.waitFor(() => {
        expect(mockStream).toHaveBeenCalledTimes(4)
      })

      // Clean up remaining
      resolvers.slice(1).forEach((r) => r())
    })
  })

  describe('cancelStream', () => {
    it('aborts the active stream controller', async () => {
      mockedGetApiKey.mockReturnValue('sk-test-key')
      mockedGetAgentConfig.mockReturnValue(VALID_AGENT_CONFIG as never)

      // Hold the stream open
      let resolver: () => void
      mockFinalMessage.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolver = resolve
          })
      )

      const wc = createMockWebContents()
      handleSendMessage('scribe', 'hello', 'zh-TW', wc)

      // Wait for stream to start
      await vi.waitFor(() => {
        expect(mockStream).toHaveBeenCalled()
      })

      // The signal passed to stream should not yet be aborted
      const signal = mockStream.mock.calls[0][1].signal as AbortSignal
      expect(signal.aborted).toBe(false)

      cancelStream('scribe')
      expect(signal.aborted).toBe(true)

      // Clean up
      resolver!()
    })

    it('is a no-op for unknown agentId', () => {
      // Should not throw
      cancelStream('nonexistent-agent')
    })
  })

  describe('trimHistory (indirect)', () => {
    it('trims long histories to MAX_HISTORY_MESSAGES starting on a user boundary', async () => {
      mockedGetApiKey.mockReturnValue('sk-test-key')
      mockedGetAgentConfig.mockReturnValue(VALID_AGENT_CONFIG as never)

      const wc = createMockWebContents()

      // Send 30 exchanges (60 messages) to exceed the 50-message limit.
      // Each handleSendMessage adds a user message and (after stream) an assistant message.
      // We simulate the assistant response via mockOn.
      mockOn.mockImplementation(function (
        this: unknown,
        event: string,
        cb: (text: string) => void
      ) {
        if (event === 'text') cb('reply')
        return this
      })

      const uniqueAgent = 'trim-test-agent'
      for (let i = 0; i < 30; i++) {
        handleSendMessage(uniqueAgent, `msg-${i}`, 'zh-TW', wc)
        await vi.waitFor(() => {
          expect(mockStream).toHaveBeenCalledTimes(i + 1)
        })
      }

      // After 30 exchanges: 60 messages in history.
      // trimHistory should slice to <= 50 messages, starting on a user boundary.
      const lastCall = mockStream.mock.calls[29]
      const messages = lastCall[0].messages as Array<{ role: string }>
      expect(messages.length).toBeLessThanOrEqual(50)
      expect(messages[0].role).toBe('user')
    })
  })
})
