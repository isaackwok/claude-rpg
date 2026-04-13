// src/main/__tests__/orchestrator.test.ts
import { describe, it, expect, vi } from 'vitest'

// Mock modules that require runtime initialization (SQLite repos, Electron dialog, etc.)
vi.mock('../chat/tool-confirm', () => ({
  checkAndApproveMessagePaths: vi.fn((_agentId: string, message: string) =>
    Promise.resolve(message)
  ),
  requestToolConfirmation: vi.fn(),
  getToolTargetPath: vi.fn(() => null),
  buildToolSummary: vi.fn(() => ''),
  oneTimeApprovedPaths: new Set<string>()
}))

vi.mock('../agents/system-prompts', () => ({
  getAgentConfig: vi.fn((agentId: string) => ({
    id: agentId,
    systemPrompt: 'Test prompt',
    model: 'claude-sonnet-4-5-20250929',
    maxTokens: 1024,
    temperature: 0.7,
    skills: ['writing'] as const
  })),
  getAgentToolContext: vi.fn(() => '')
}))

vi.mock('../tools/tool-definitions', () => ({
  getToolsForAgent: vi.fn(() => []),
  AGENT_TOOLS: {}
}))

vi.mock('../tools/tool-executor', () => ({
  executeTool: vi.fn(() => Promise.resolve({ success: true, content: 'ok', summary: '' }))
}))

vi.mock('../project-directory', () => ({
  getProjectDirectory: vi.fn(() => '/tmp/project'),
  isPathInProject: vi.fn(() => true)
}))

vi.mock('../tools/path-utils', () => ({
  getParentFolder: vi.fn((p: string) => p)
}))

vi.mock('../cosmetic-definitions', () => ({
  getCosmeticDefinition: vi.fn(() => undefined)
}))

import { ChatOrchestrator } from '../chat/orchestrator'
import type { IChatBackend, ChatOpts, StreamEvent } from '../chat/types'

/** Minimal mock backend that yields configurable events */
function mockBackend(events: StreamEvent[]): IChatBackend {
  return {
    async *sendMessage(_opts: ChatOpts, _message: string) {
      for (const e of events) {
        yield e
      }
    },
    supplyToolResults: vi.fn(),
    cancelStream: vi.fn(),
    clearHistory: vi.fn()
  }
}

/** Minimal mock WebContents */
function mockWebContents() {
  return {
    isDestroyed: vi.fn(() => false),
    send: vi.fn()
  } as unknown as import('electron').WebContents
}

describe('ChatOrchestrator', () => {
  it('forwards text events to webContents via IPC', async () => {
    const backend = mockBackend([{ type: 'text', chunk: 'Hello adventurer!' }, { type: 'end' }])
    const orchestrator = new ChatOrchestrator(backend)
    const wc = mockWebContents()

    await orchestrator.handleSendMessage('elder', 'hi', 'zh-TW', wc)

    expect(wc.send).toHaveBeenCalledWith('chat:stream-chunk', {
      agentId: 'elder',
      chunk: 'Hello adventurer!'
    })
    expect(wc.send).toHaveBeenCalledWith('chat:stream-end', { agentId: 'elder' })
  })

  it('forwards error events to webContents', async () => {
    const backend = mockBackend([{ type: 'error', error: 'no-api-key' }])
    const orchestrator = new ChatOrchestrator(backend)
    const wc = mockWebContents()

    await orchestrator.handleSendMessage('wizard', 'cast spell', 'zh-TW', wc)

    expect(wc.send).toHaveBeenCalledWith('chat:stream-error', {
      agentId: 'wizard',
      error: 'no-api-key'
    })
  })

  it('cancelStream delegates to backend', () => {
    const backend = mockBackend([])
    const orchestrator = new ChatOrchestrator(backend)

    orchestrator.cancelStream('wizard')

    expect(backend.cancelStream).toHaveBeenCalledWith('wizard')
  })
})
