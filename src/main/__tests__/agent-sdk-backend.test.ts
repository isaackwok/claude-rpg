import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ChatOpts, StreamEvent } from '../chat/types'

// Mock the Agent SDK module
const mockQuery = vi.fn()
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: (...args: unknown[]) => mockQuery(...args)
}))

// Import after mock is set up
import { AgentSdkBackend } from '../chat/agent-sdk-backend'

function makeChatOpts(overrides: Partial<ChatOpts> = {}): ChatOpts {
  return {
    agentId: 'wizard',
    systemPrompt: 'You are a wizard.',
    tools: [],
    model: 'claude-sonnet-4-5-20250929',
    maxTokens: 1024,
    temperature: 0.7,
    allowedToolNames: ['Read', 'Write', 'Edit'],
    ...overrides
  }
}

/** Helper: create an async generator from an array of SDK messages */
async function* fakeQueryStream(
  messages: Record<string, unknown>[]
): AsyncGenerator<Record<string, unknown>> {
  for (const msg of messages) {
    yield msg
  }
}

/** Wrap an async generator to also have Query interface stubs (interrupt, close, etc.) */
function makeFakeQuery(
  messages: Record<string, unknown>[]
): AsyncGenerator<Record<string, unknown>> {
  return fakeQueryStream(messages)
}

beforeEach(() => {
  mockQuery.mockReset()
})

describe('AgentSdkBackend', () => {
  it('has managesTools set to true', () => {
    const backend = new AgentSdkBackend('acceptEdits')
    expect(backend.managesTools).toBe(true)
  })

  it('streams text from partial messages (stream_event)', async () => {
    mockQuery.mockReturnValue(
      makeFakeQuery([
        { type: 'system', subtype: 'init', session_id: 'sess-1', tools: [], mcp_servers: [] },
        {
          type: 'stream_event',
          event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello ' } },
          parent_tool_use_id: null,
          session_id: 'sess-1'
        },
        {
          type: 'stream_event',
          event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'world!' } },
          parent_tool_use_id: null,
          session_id: 'sess-1'
        },
        { type: 'result', subtype: 'success', session_id: 'sess-1', result: 'Hello world!' }
      ])
    )

    const backend = new AgentSdkBackend('acceptEdits')
    const events: StreamEvent[] = []
    for await (const event of backend.sendMessage(makeChatOpts(), 'hello')) {
      events.push(event)
    }

    expect(events).toEqual([
      { type: 'text', chunk: 'Hello ' },
      { type: 'text', chunk: 'world!' },
      { type: 'end' }
    ])
  })

  it('falls back to assistant message text when no partial messages seen', async () => {
    mockQuery.mockReturnValue(
      makeFakeQuery([
        { type: 'system', subtype: 'init', session_id: 'sess-1', tools: [], mcp_servers: [] },
        {
          type: 'assistant',
          message: {
            content: [
              { type: 'text', text: 'Full response' },
              { type: 'tool_use', id: 'tu-1', name: 'Read', input: {} }
            ]
          },
          parent_tool_use_id: null,
          session_id: 'sess-1'
        },
        { type: 'result', subtype: 'success', session_id: 'sess-1', result: 'Full response' }
      ])
    )

    const backend = new AgentSdkBackend('acceptEdits')
    const events: StreamEvent[] = []
    for await (const event of backend.sendMessage(makeChatOpts(), 'hello')) {
      events.push(event)
    }

    expect(events).toEqual([{ type: 'text', chunk: 'Full response' }, { type: 'end' }])
  })

  it('skips assistant message text when partial messages were already seen', async () => {
    mockQuery.mockReturnValue(
      makeFakeQuery([
        { type: 'system', subtype: 'init', session_id: 'sess-1', tools: [], mcp_servers: [] },
        {
          type: 'stream_event',
          event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Streamed' } },
          parent_tool_use_id: null,
          session_id: 'sess-1'
        },
        {
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'Streamed' }] },
          parent_tool_use_id: null,
          session_id: 'sess-1'
        },
        { type: 'result', subtype: 'success', session_id: 'sess-1', result: 'Streamed' }
      ])
    )

    const backend = new AgentSdkBackend('acceptEdits')
    const events: StreamEvent[] = []
    for await (const event of backend.sendMessage(makeChatOpts(), 'hello')) {
      events.push(event)
    }

    // Only one text event from stream_event, not duplicated from assistant
    expect(events).toEqual([{ type: 'text', chunk: 'Streamed' }, { type: 'end' }])
  })

  it('yields error event on SDK error result', async () => {
    mockQuery.mockReturnValue(
      makeFakeQuery([
        { type: 'system', subtype: 'init', session_id: 'sess-1', tools: [], mcp_servers: [] },
        {
          type: 'result',
          subtype: 'error_during_execution',
          session_id: 'sess-1',
          errors: ['Something went wrong', 'Another error']
        }
      ])
    )

    const backend = new AgentSdkBackend('acceptEdits')
    const events: StreamEvent[] = []
    for await (const event of backend.sendMessage(makeChatOpts(), 'hello')) {
      events.push(event)
    }

    expect(events).toEqual([{ type: 'error', error: 'Something went wrong; Another error' }])
  })

  it('calls onToolProgress callback for tool_progress messages', async () => {
    const onToolProgress = vi.fn()
    mockQuery.mockReturnValue(
      makeFakeQuery([
        { type: 'system', subtype: 'init', session_id: 'sess-1', tools: [], mcp_servers: [] },
        {
          type: 'tool_progress',
          tool_use_id: 'tu-1',
          tool_name: 'Read',
          parent_tool_use_id: null,
          elapsed_time_seconds: 1,
          session_id: 'sess-1'
        },
        { type: 'result', subtype: 'success', session_id: 'sess-1', result: '' }
      ])
    )

    const backend = new AgentSdkBackend('acceptEdits')
    const events: StreamEvent[] = []
    for await (const event of backend.sendMessage(
      makeChatOpts({ onToolProgress }),
      'read a file'
    )) {
      events.push(event)
    }

    expect(onToolProgress).toHaveBeenCalledWith('Read')
    expect(events).toEqual([{ type: 'end' }])
  })

  it('captures session ID and resumes on subsequent calls', async () => {
    // First call — init provides session ID
    mockQuery.mockReturnValue(
      makeFakeQuery([
        { type: 'system', subtype: 'init', session_id: 'sess-abc', tools: [], mcp_servers: [] },
        { type: 'result', subtype: 'success', session_id: 'sess-abc', result: 'ok' }
      ])
    )

    const backend = new AgentSdkBackend('acceptEdits')
    // Drain first call
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _msg of backend.sendMessage(makeChatOpts(), 'first')) {
      /* consume */
    }

    // Second call should pass resume option
    mockQuery.mockReturnValue(
      makeFakeQuery([{ type: 'result', subtype: 'success', session_id: 'sess-abc', result: 'ok' }])
    )
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _msg of backend.sendMessage(makeChatOpts(), 'second')) {
      /* consume */
    }

    const secondCallOpts = mockQuery.mock.calls[1][0].options
    expect(secondCallOpts.resume).toBe('sess-abc')
  })

  it('clearHistory removes session ID so next call starts fresh', async () => {
    mockQuery.mockReturnValue(
      makeFakeQuery([
        { type: 'system', subtype: 'init', session_id: 'sess-abc', tools: [], mcp_servers: [] },
        { type: 'result', subtype: 'success', session_id: 'sess-abc', result: 'ok' }
      ])
    )

    const backend = new AgentSdkBackend('acceptEdits')
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _msg of backend.sendMessage(makeChatOpts(), 'first')) {
      /* consume */
    }

    backend.clearHistory('wizard')

    // Next call should NOT have resume
    mockQuery.mockReturnValue(
      makeFakeQuery([
        { type: 'system', subtype: 'init', session_id: 'sess-def', tools: [], mcp_servers: [] },
        { type: 'result', subtype: 'success', session_id: 'sess-def', result: 'ok' }
      ])
    )
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _msg of backend.sendMessage(makeChatOpts(), 'after clear')) {
      /* consume */
    }

    const callOpts = mockQuery.mock.calls[1][0].options
    expect(callOpts.resume).toBeUndefined()
  })

  it('supplyToolResults is a no-op', () => {
    const backend = new AgentSdkBackend('acceptEdits')
    expect(() => backend.supplyToolResults('wizard', [])).not.toThrow()
  })

  it('cancelStream does not throw when no active query', () => {
    const backend = new AgentSdkBackend('acceptEdits')
    expect(() => backend.cancelStream('wizard')).not.toThrow()
  })

  it('passes permissionMode and allowedTools to SDK options', async () => {
    mockQuery.mockReturnValue(
      makeFakeQuery([
        { type: 'system', subtype: 'init', session_id: 'sess-1', tools: [], mcp_servers: [] },
        { type: 'result', subtype: 'success', session_id: 'sess-1', result: '' }
      ])
    )

    const backend = new AgentSdkBackend('bypassPermissions')
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _msg of backend.sendMessage(
      makeChatOpts({ allowedToolNames: ['Read', 'Bash'] }),
      'test'
    )) {
      /* consume */
    }

    const opts = mockQuery.mock.calls[0][0].options
    expect(opts.permissionMode).toBe('bypassPermissions')
    expect(opts.allowedTools).toEqual(['Read', 'Bash'])
    expect(opts.systemPrompt).toBe('You are a wizard.')
    expect(opts.includePartialMessages).toBe(true)
  })

  it('yields end on abort error', async () => {
    mockQuery.mockImplementation(() => {
      // eslint-disable-next-line require-yield
      return (async function* () {
        throw Object.assign(new Error('aborted'), { name: 'AbortError' })
      })()
    })

    const backend = new AgentSdkBackend('acceptEdits')
    const events: StreamEvent[] = []
    for await (const event of backend.sendMessage(makeChatOpts(), 'hello')) {
      events.push(event)
    }

    expect(events).toEqual([{ type: 'end' }])
  })

  it('yields error on non-abort exception', async () => {
    mockQuery.mockImplementation(() => {
      // eslint-disable-next-line require-yield
      return (async function* () {
        throw new Error('network failure')
      })()
    })

    const backend = new AgentSdkBackend('acceptEdits')
    const events: StreamEvent[] = []
    for await (const event of backend.sendMessage(makeChatOpts(), 'hello')) {
      events.push(event)
    }

    expect(events).toEqual([{ type: 'error', error: 'network failure' }])
  })
})
