import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { WebContents } from 'electron'

vi.mock('./api-key', () => ({
  getApiKey: vi.fn()
}))

vi.mock('./agents/system-prompts', () => ({
  getAgentConfig: vi.fn(),
  getAgentToolContext: vi.fn(() => '')
}))

vi.mock('./tools/tool-definitions', () => ({
  getToolsForAgent: vi.fn(() => [])
}))

vi.mock('./tools/tool-executor', () => ({
  executeTool: vi.fn()
}))

vi.mock('./folder-manager', () => ({
  getApprovedFolders: vi.fn(() => []),
  addApprovedFolder: vi.fn(),
  isPathApproved: vi.fn(() => false)
}))

vi.mock('./tools/path-utils', () => ({
  getParentFolder: vi.fn((p: string) => p)
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

import Anthropic from '@anthropic-ai/sdk'
import { handleSendMessage, cancelStream, handleToolApproved, handleToolDenied } from './chat'
import { getApiKey } from './api-key'
import { getAgentConfig } from './agents/system-prompts'
import { getToolsForAgent } from './tools/tool-definitions'
import { executeTool } from './tools/tool-executor'
import { isPathApproved, getApprovedFolders } from './folder-manager'

const MockAnthropic = vi.mocked(Anthropic)
const mockedGetApiKey = vi.mocked(getApiKey)
const mockedGetAgentConfig = vi.mocked(getAgentConfig)

/** Helper to extract SDK call args from mockStream — avoids TS tuple indexing errors */
function getStreamCallMessages(callIndex: number): Array<{ role: string; content: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (mockStream.mock.calls as any[][])[callIndex][0].messages
}

function createMockWebContents() {
  return {
    send: vi.fn(),
    isDestroyed: vi.fn(() => false)
  } as unknown as WebContents
}

const VALID_AGENT_CONFIG = {
  systemPrompt: 'You are an NPC.',
  model: 'claude-sonnet-4-5-20250929',
  maxTokens: 1024,
  temperature: 0.7
}

describe('chat', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default finalMessage returns end_turn with empty content blocks (no tool use)
    mockFinalMessage.mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: '' }]
    })
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

      // Hold stream open so we can inspect the messages array at call time
      // (before the assistant response is pushed to the shared history)
      let resolveStream: () => void
      mockFinalMessage.mockImplementation(
        () =>
          new Promise<{ stop_reason: string; content: unknown[] }>((resolve) => {
            resolveStream = () =>
              resolve({ stop_reason: 'end_turn', content: [{ type: 'text', text: '' }] })
          })
      )

      const wc = createMockWebContents()
      handleSendMessage('scribe', 'hello', 'zh-TW', wc)
      await vi.waitFor(() => {
        expect(mockStream).toHaveBeenCalled()
      })

      // Snapshot messages at call time (stream still open, so history hasn't been mutated)
      const callArgs = (mockStream.mock.calls as unknown[][])[0][0] as Record<string, unknown>
      expect(callArgs.model).toBe('claude-sonnet-4-5-20250929')
      expect(callArgs.max_tokens).toBe(1024)
      expect(callArgs.temperature).toBe(0.7)
      expect(callArgs.system).toBe('You are an NPC.')

      const messages = callArgs.messages as Array<{ role: string; content: string }>
      expect(messages).toEqual([{ role: 'user', content: 'hello' }])

      // Clean up
      resolveStream!()
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

      handleSendMessage('error-agent-1', 'hello', 'zh-TW', wc)
      await vi.waitFor(() => {
        expect(wc.send).toHaveBeenCalledWith('chat:stream-error', {
          agentId: 'error-agent-1',
          error: 'rate limit exceeded'
        })
      })
    })

    it('pops orphaned user message from history on error (no assistant response)', async () => {
      mockedGetApiKey.mockReturnValue('sk-test-key')
      mockedGetAgentConfig.mockReturnValue(VALID_AGENT_CONFIG as never)
      mockFinalMessage.mockRejectedValueOnce(new Error('network error'))
      const wc = createMockWebContents()

      // First message errors — user message should be popped
      handleSendMessage('alt-agent-1', 'hello', 'zh-TW', wc)
      await vi.waitFor(() => {
        expect(wc.send).toHaveBeenCalledWith('chat:stream-error', expect.anything())
      })

      // Second message should work and start fresh (not have duplicate user message)
      // Hold stream open so we can inspect messages at call time
      let resolveRetry: () => void
      mockFinalMessage.mockImplementation(
        () =>
          new Promise<{ stop_reason: string; content: unknown[] }>((resolve) => {
            resolveRetry = () =>
              resolve({ stop_reason: 'end_turn', content: [{ type: 'text', text: '' }] })
          })
      )
      handleSendMessage('alt-agent-1', 'retry', 'zh-TW', wc)
      await vi.waitFor(() => {
        expect(mockStream).toHaveBeenCalledTimes(2)
      })
      // The messages sent to SDK should only contain the new user message
      const messages = getStreamCallMessages(1)
      expect(messages).toEqual([{ role: 'user', content: 'retry' }])

      // Clean up
      resolveRetry!()
    })

    it('sends stream-end (not error) when stream is aborted', async () => {
      mockedGetApiKey.mockReturnValue('sk-test-key')
      mockedGetAgentConfig.mockReturnValue(VALID_AGENT_CONFIG as never)

      const abortError = new Error('Request was aborted.')
      abortError.name = 'AbortError'
      mockFinalMessage.mockRejectedValueOnce(abortError)
      const wc = createMockWebContents()

      handleSendMessage('abort-agent-1', 'hello', 'zh-TW', wc)
      await vi.waitFor(() => {
        expect(wc.send).toHaveBeenCalledWith('chat:stream-end', { agentId: 'abort-agent-1' })
      })
      // Should NOT have sent stream-error
      expect(wc.send).not.toHaveBeenCalledWith('chat:stream-error', expect.anything())
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

  describe('duplicate message prevention on retry', () => {
    it('does not push duplicate user message when retrying the same text', async () => {
      mockedGetApiKey.mockReturnValue('sk-test-key')
      mockedGetAgentConfig.mockReturnValue(VALID_AGENT_CONFIG as never)

      // First call succeeds with a response
      mockOn.mockImplementation(function (
        this: unknown,
        event: string,
        cb: (text: string) => void
      ) {
        if (event === 'text') cb('response')
        return this
      })
      mockFinalMessage.mockResolvedValueOnce({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'response' }]
      })

      const wc = createMockWebContents()
      handleSendMessage('dedup-agent', 'hello', 'zh-TW', wc)
      await vi.waitFor(() => {
        expect(mockStream).toHaveBeenCalledTimes(1)
      })

      // Second call with same message (retry scenario) — should not duplicate the user message
      mockOn.mockReturnThis()
      // Hold stream open so we can inspect messages at call time
      let resolveSecond: () => void
      mockFinalMessage.mockImplementation(
        () =>
          new Promise<{ stop_reason: string; content: unknown[] }>((resolve) => {
            resolveSecond = () =>
              resolve({ stop_reason: 'end_turn', content: [{ type: 'text', text: '' }] })
          })
      )
      handleSendMessage('dedup-agent', 'hello', 'zh-TW', wc)
      await vi.waitFor(() => {
        expect(mockStream).toHaveBeenCalledTimes(2)
      })

      // History should be: user "hello", assistant (content blocks), user "hello" (not duplicated)
      const messages = getStreamCallMessages(1)
      expect(messages).toHaveLength(3)
      expect(messages[0]).toEqual({ role: 'user', content: 'hello' })
      expect(messages[1].role).toBe('assistant')
      expect(messages[2]).toEqual({ role: 'user', content: 'hello' })

      // Clean up
      resolveSecond!()
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const signal = (mockStream.mock.calls as any[][])[0][1].signal as AbortSignal
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

  describe('client caching', () => {
    it('reuses the same client when API key is unchanged', async () => {
      mockedGetApiKey.mockReturnValue('sk-same-key')
      mockedGetAgentConfig.mockReturnValue(VALID_AGENT_CONFIG as never)
      const wc = createMockWebContents()

      handleSendMessage('cache-agent-1', 'msg1', 'zh-TW', wc)
      await vi.waitFor(() => {
        expect(mockStream).toHaveBeenCalledTimes(1)
      })

      handleSendMessage('cache-agent-2', 'msg2', 'zh-TW', wc)
      await vi.waitFor(() => {
        expect(mockStream).toHaveBeenCalledTimes(2)
      })

      // Anthropic constructor should only be called once for the same key
      // (first call creates, second reuses)
      const constructorCalls = MockAnthropic.mock.calls.filter(
        (c) => (c[0] as { apiKey: string }).apiKey === 'sk-same-key'
      )
      expect(constructorCalls).toHaveLength(1)
    })

    it('creates a new client when API key changes', async () => {
      mockedGetAgentConfig.mockReturnValue(VALID_AGENT_CONFIG as never)
      const wc = createMockWebContents()

      mockedGetApiKey.mockReturnValue('sk-key-A')
      handleSendMessage('cache-agent-3', 'msg1', 'zh-TW', wc)
      await vi.waitFor(() => {
        expect(mockStream).toHaveBeenCalledTimes(1)
      })

      mockedGetApiKey.mockReturnValue('sk-key-B')
      handleSendMessage('cache-agent-4', 'msg2', 'zh-TW', wc)
      await vi.waitFor(() => {
        expect(mockStream).toHaveBeenCalledTimes(2)
      })

      // Should have created two different clients
      expect(MockAnthropic).toHaveBeenCalledWith({ apiKey: 'sk-key-A' })
      expect(MockAnthropic).toHaveBeenCalledWith({ apiKey: 'sk-key-B' })
    })
  })

  describe('error with partial response preserves history', () => {
    it('keeps both user and partial assistant messages when error occurs mid-stream', async () => {
      mockedGetApiKey.mockReturnValue('sk-test-key')
      mockedGetAgentConfig.mockReturnValue(VALID_AGENT_CONFIG as never)

      // Simulate: text chunk arrives, then error
      mockOn.mockImplementation(function (
        this: unknown,
        event: string,
        cb: (text: string) => void
      ) {
        if (event === 'text') cb('partial response')
        return this
      })
      mockFinalMessage.mockRejectedValueOnce(new Error('connection reset'))
      const wc = createMockWebContents()

      handleSendMessage('partial-agent-1', 'question', 'zh-TW', wc)
      await vi.waitFor(() => {
        expect(wc.send).toHaveBeenCalledWith('chat:stream-error', expect.anything())
      })

      // Now send another message — history should still contain the partial exchange
      mockOn.mockReturnThis()
      // Hold the second stream open so we can inspect messages at call time
      let resolveSecond: () => void
      mockFinalMessage.mockImplementation(
        () =>
          new Promise<{ stop_reason: string; content: unknown[] }>((resolve) => {
            resolveSecond = () =>
              resolve({ stop_reason: 'end_turn', content: [{ type: 'text', text: '' }] })
          })
      )
      handleSendMessage('partial-agent-1', 'retry', 'zh-TW', wc)
      await vi.waitFor(() => {
        expect(mockStream).toHaveBeenCalledTimes(2)
      })

      // History at the time of the second SDK call should contain the partial exchange
      const messages = getStreamCallMessages(1)
      expect(messages).toHaveLength(3)
      expect(messages[0]).toEqual({ role: 'user', content: 'question' })
      expect(messages[1]).toEqual({ role: 'assistant', content: 'partial response' })
      expect(messages[2]).toEqual({ role: 'user', content: 'retry' })

      // Clean up
      resolveSecond!()
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

      // Each finalMessage must return proper content blocks
      for (let i = 0; i < 30; i++) {
        mockFinalMessage.mockResolvedValueOnce({
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: 'reply' }]
        })
      }

      const uniqueAgent = 'trim-test-agent'
      for (let i = 0; i < 30; i++) {
        handleSendMessage(uniqueAgent, `msg-${i}`, 'zh-TW', wc)
        await vi.waitFor(() => {
          expect(mockStream).toHaveBeenCalledTimes(i + 1)
        })
      }

      // After 30 exchanges: 60 messages in history.
      // trimHistory should slice to <= 50 messages, starting on a user boundary.
      const messages = getStreamCallMessages(29)
      expect(messages.length).toBeLessThanOrEqual(50)
      expect(messages[0].role).toBe('user')
    })
  })

  describe('tool-use loop', () => {
    const mockedGetToolsForAgent = vi.mocked(getToolsForAgent)
    const mockedExecuteTool = vi.mocked(executeTool)
    const mockedIsPathApproved = vi.mocked(isPathApproved)
    const mockedGetApprovedFolders = vi.mocked(getApprovedFolders)

    const TOOL_CONFIG = {
      ...VALID_AGENT_CONFIG,
      maxTokens: 4096
    }

    function setupToolUseAgent(_agentId: string): void {
      mockedGetApiKey.mockReturnValue('sk-test-key')
      mockedGetAgentConfig.mockReturnValue(TOOL_CONFIG as never)
      mockedGetToolsForAgent.mockReturnValue([
        { name: 'read_file', description: 'Read', input_schema: { type: 'object', properties: {} } }
      ] as never)
      mockedGetApprovedFolders.mockReturnValue([
        { path: '/home/user/project', label: 'project', addedAt: 1000 }
      ])
    }

    it('executes tool and continues loop when stop_reason is tool_use', async () => {
      const agentId = 'tool-loop-agent-1'
      setupToolUseAgent(agentId)
      mockedIsPathApproved.mockReturnValue(true)
      mockedExecuteTool.mockResolvedValue({
        success: true,
        content: 'file content here',
        summary: '讀取 file.txt'
      })

      let callCount = 0
      mockOn.mockReturnThis()
      mockFinalMessage.mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          // First call: return tool_use
          return Promise.resolve({
            stop_reason: 'tool_use',
            content: [
              {
                type: 'tool_use',
                id: 'tool_1',
                name: 'read_file',
                input: { path: '/home/user/project/file.txt' }
              }
            ]
          })
        }
        // Second call: return end_turn
        return Promise.resolve({
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: 'I read the file.' }]
        })
      })

      const wc = createMockWebContents()
      handleSendMessage(agentId, 'read the file', 'zh-TW', wc)

      await vi.waitFor(() => {
        expect(mockStream).toHaveBeenCalledTimes(2)
      })
      await vi.waitFor(() => {
        expect(wc.send).toHaveBeenCalledWith('chat:stream-end', { agentId })
      })

      // Verify executeTool was called
      expect(mockedExecuteTool).toHaveBeenCalledWith(
        'read_file',
        { path: '/home/user/project/file.txt' },
        ['/home/user/project']
      )

      // Verify tool_result was sent in second SDK call's messages
      const secondCallMessages = getStreamCallMessages(1)
      const toolResultMsg = secondCallMessages.find((m: { role: string }) => m.role === 'user')
      expect(toolResultMsg).toBeDefined()
    })

    it('sends tool-executing indicator when auto-approving', async () => {
      const agentId = 'tool-exec-indicator-1'
      setupToolUseAgent(agentId)
      mockedIsPathApproved.mockReturnValue(true)
      mockedExecuteTool.mockResolvedValue({
        success: true,
        content: 'ok',
        summary: 'done'
      })

      let callCount = 0
      mockOn.mockReturnThis()
      mockFinalMessage.mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          return Promise.resolve({
            stop_reason: 'tool_use',
            content: [
              {
                type: 'tool_use',
                id: 'tool_x',
                name: 'read_file',
                input: { path: '/home/user/project/x' }
              }
            ]
          })
        }
        return Promise.resolve({ stop_reason: 'end_turn', content: [{ type: 'text', text: '' }] })
      })

      const wc = createMockWebContents()
      handleSendMessage(agentId, 'test', 'zh-TW', wc)

      await vi.waitFor(() => {
        expect(wc.send).toHaveBeenCalledWith('chat:tool-executing', {
          agentId,
          toolName: 'read_file'
        })
      })
    })

    it('always requires confirmation for run_command regardless of folder approval', async () => {
      const agentId = 'run-cmd-confirm-1'
      setupToolUseAgent(agentId)
      // Even though path is "approved", run_command should NOT auto-approve
      mockedIsPathApproved.mockReturnValue(true)

      mockOn.mockReturnThis()
      mockFinalMessage.mockResolvedValueOnce({
        stop_reason: 'tool_use',
        content: [
          {
            type: 'tool_use',
            id: 'cmd_1',
            name: 'run_command',
            input: { command: 'ls', cwd: '/home/user/project' }
          }
        ]
      })

      const wc = createMockWebContents()
      handleSendMessage(agentId, 'run ls', 'zh-TW', wc)

      // Should receive a tool-confirm IPC (not auto-execute)
      await vi.waitFor(() => {
        expect(wc.send).toHaveBeenCalledWith(
          'chat:tool-confirm',
          expect.objectContaining({
            agentId,
            toolCallId: 'cmd_1',
            toolName: 'run_command'
          })
        )
      })

      // Verify executeTool was NOT called (waiting for confirmation)
      expect(mockedExecuteTool).not.toHaveBeenCalled()

      // Deny to clean up
      handleToolDenied(agentId, 'cmd_1')
    })

    it('sends denied tool_result when user denies a tool call', async () => {
      const agentId = 'tool-deny-1'
      setupToolUseAgent(agentId)
      mockedIsPathApproved.mockReturnValue(false)

      let callCount = 0
      mockOn.mockReturnThis()
      mockFinalMessage.mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          return Promise.resolve({
            stop_reason: 'tool_use',
            content: [
              { type: 'tool_use', id: 'deny_1', name: 'read_file', input: { path: '/etc/secret' } }
            ]
          })
        }
        return Promise.resolve({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] })
      })

      const wc = createMockWebContents()
      handleSendMessage(agentId, 'read secret', 'zh-TW', wc)

      // Wait for tool-confirm to be sent
      await vi.waitFor(() => {
        expect(wc.send).toHaveBeenCalledWith(
          'chat:tool-confirm',
          expect.objectContaining({ toolCallId: 'deny_1' })
        )
      })

      // User denies the tool call
      handleToolDenied(agentId, 'deny_1')

      // Should continue to second API call and finish
      await vi.waitFor(() => {
        expect(mockStream).toHaveBeenCalledTimes(2)
      })
      await vi.waitFor(() => {
        expect(wc.send).toHaveBeenCalledWith('chat:stream-end', { agentId })
      })

      // executeTool should NOT have been called
      expect(mockedExecuteTool).not.toHaveBeenCalled()
    })

    it('approves tool call and executes when user approves', async () => {
      const agentId = 'tool-approve-1'
      setupToolUseAgent(agentId)
      mockedIsPathApproved.mockReturnValue(false)
      mockedExecuteTool.mockResolvedValue({
        success: true,
        content: 'secret content',
        summary: '讀取成功'
      })

      let callCount = 0
      mockOn.mockReturnThis()
      mockFinalMessage.mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          return Promise.resolve({
            stop_reason: 'tool_use',
            content: [
              {
                type: 'tool_use',
                id: 'approve_1',
                name: 'read_file',
                input: { path: '/tmp/file.txt' }
              }
            ]
          })
        }
        return Promise.resolve({ stop_reason: 'end_turn', content: [{ type: 'text', text: '' }] })
      })

      const wc = createMockWebContents()
      handleSendMessage(agentId, 'read it', 'zh-TW', wc)

      await vi.waitFor(() => {
        expect(wc.send).toHaveBeenCalledWith(
          'chat:tool-confirm',
          expect.objectContaining({ toolCallId: 'approve_1' })
        )
      })

      // User approves
      handleToolApproved(agentId, 'approve_1')

      await vi.waitFor(() => {
        expect(mockedExecuteTool).toHaveBeenCalled()
      })
      await vi.waitFor(() => {
        expect(wc.send).toHaveBeenCalledWith('chat:stream-end', { agentId })
      })
    })

    it('breaks loop after MAX_TOOL_ROUNDS (20) iterations', async () => {
      const agentId = 'tool-loop-limit-1'
      setupToolUseAgent(agentId)
      mockedIsPathApproved.mockReturnValue(true)
      mockedExecuteTool.mockResolvedValue({
        success: true,
        content: 'ok',
        summary: 'done'
      })

      // Always return tool_use to force an infinite loop
      mockOn.mockReturnThis()
      mockFinalMessage.mockImplementation(() =>
        Promise.resolve({
          stop_reason: 'tool_use',
          content: [
            {
              type: 'tool_use',
              id: `loop_${Date.now()}_${Math.random()}`,
              name: 'read_file',
              input: { path: '/home/user/project/x' }
            }
          ]
        })
      )

      const wc = createMockWebContents()
      handleSendMessage(agentId, 'loop forever', 'zh-TW', wc)

      await vi.waitFor(
        () => {
          expect(wc.send).toHaveBeenCalledWith('chat:stream-end', { agentId })
        },
        { timeout: 10000 }
      )

      // Should have been called exactly 21 times (20 tool rounds + 1 that triggers the break)
      // Actually: the guard fires at round 21, so 20 successful rounds = 20 stream calls,
      // plus the 21st that hits the guard and breaks before calling stream.
      // So mockStream should be called 20 times.
      expect(mockStream.mock.calls.length).toBeLessThanOrEqual(21)
      expect(mockStream.mock.calls.length).toBeGreaterThanOrEqual(20)

      // Should have sent the limit warning message
      expect(wc.send).toHaveBeenCalledWith(
        'chat:stream-chunk',
        expect.objectContaining({
          agentId,
          chunk: expect.stringContaining('工具使用次數已達上限')
        })
      )
    }, 15000)
  })

  describe('handleToolApproved / handleToolDenied', () => {
    it('handleToolApproved is a no-op for unknown toolCallId', () => {
      // Should not throw
      handleToolApproved('any-agent', 'nonexistent-id')
    })

    it('handleToolDenied is a no-op for unknown toolCallId', () => {
      // Should not throw
      handleToolDenied('any-agent', 'nonexistent-id')
    })
  })
})
