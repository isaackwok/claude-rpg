import type { AgentId } from '../../shared/types'
import type { PermissionMode as SdkPermissionMode } from '@anthropic-ai/claude-agent-sdk'
import type { IChatBackend, ChatOpts, StreamEvent, ToolResult } from './types'

/**
 * IChatBackend powered by the Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`).
 * Replaces the old ClaudeCliChatBackend that spawned `claude --print`.
 *
 * The SDK handles tool execution internally — supplyToolResults() is a no-op.
 * Session continuity is managed via the SDK's `resume` option with per-NPC session IDs.
 */
export class AgentSdkBackend implements IChatBackend {
  readonly managesTools = true

  private sessionIds = new Map<AgentId, string>()
  private activeAborts = new Map<AgentId, AbortController>()

  async *sendMessage(opts: ChatOpts, message: string): AsyncIterable<StreamEvent> {
    // Dynamic import — the SDK is ESM-only and spawns a child process,
    // so we import lazily to avoid issues with electron-vite's CJS bundling.
    const { query } = await import('@anthropic-ai/claude-agent-sdk')

    const abortController = new AbortController()
    this.activeAborts.set(opts.agentId, abortController)

    let hasSeenPartialMessages = false

    const sdkOptions = {
      systemPrompt: opts.systemPrompt,
      model: opts.model,
      permissionMode: (opts.permissionMode ?? 'acceptEdits') as SdkPermissionMode,
      allowedTools: opts.allowedToolNames ?? [],
      includePartialMessages: true,
      abortController,
      persistSession: true,
      ...(this.sessionIds.has(opts.agentId) ? { resume: this.sessionIds.get(opts.agentId)! } : {}),
      ...(opts.projectDirectory ? { cwd: opts.projectDirectory } : {})
    }

    try {
      for await (const msg of query({ prompt: message, options: sdkOptions })) {
        // Capture session ID from init message
        if (msg.type === 'system' && 'subtype' in msg && msg.subtype === 'init') {
          this.sessionIds.set(opts.agentId, msg.session_id)
          continue
        }

        // Streaming text deltas (partial messages)
        if (msg.type === 'stream_event') {
          hasSeenPartialMessages = true
          const event = msg.event
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            yield { type: 'text', chunk: event.delta.text }
          }
          continue
        }

        // Full assistant message — only emit text if we didn't get partials
        if (msg.type === 'assistant' && !hasSeenPartialMessages) {
          const content = msg.message?.content
          if (Array.isArray(content)) {
            const textParts: string[] = []
            for (const block of content) {
              if (block.type === 'text') {
                textParts.push(block.text)
              }
            }
            const text = textParts.join('')
            if (text) yield { type: 'text', chunk: text }
          }
          continue
        }

        // Tool progress → informational callback
        if (msg.type === 'tool_progress') {
          opts.onToolProgress?.(msg.tool_name)
          continue
        }

        // Result — end or error
        if (msg.type === 'result') {
          this.sessionIds.set(opts.agentId, msg.session_id)
          if (msg.subtype === 'success') {
            yield { type: 'end' }
          } else {
            const errorMsg =
              'errors' in msg && Array.isArray(msg.errors)
                ? (msg.errors as string[]).join('; ')
                : msg.subtype
            yield { type: 'error', error: errorMsg }
          }
          continue
        }
      }
    } catch (err) {
      const isAbort =
        err instanceof Error && (err.name === 'AbortError' || err.message.includes('abort'))
      if (isAbort) {
        yield { type: 'end' }
      } else {
        const error = err instanceof Error ? err.message : String(err)
        console.error(`[AgentSdkBackend] Error for agent ${opts.agentId}:`, err)
        yield { type: 'error', error }
      }
    } finally {
      this.activeAborts.delete(opts.agentId)
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  supplyToolResults(_agentId: AgentId, _results: ToolResult[]): void {
    // No-op: the Agent SDK executes tools internally
  }

  cancelStream(agentId: AgentId): void {
    this.activeAborts.get(agentId)?.abort()
  }

  clearHistory(agentId: AgentId): void {
    this.sessionIds.delete(agentId)
  }
}
