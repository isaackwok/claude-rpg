import Anthropic from '@anthropic-ai/sdk'
import type { AgentId, ToolName } from '../../shared/types'
import type { IChatBackend, ChatOpts, StreamEvent, ToolSchema, ToolResult } from './types'
import { ConversationHistoryManager } from './history'

const MAX_TOOL_ROUNDS = 20

export class ApiKeyChatBackend implements IChatBackend {
  private history = new ConversationHistoryManager()
  private activeStreams = new Map<AgentId, AbortController>()
  private pendingToolResults = new Map<AgentId, { resolve: (results: ToolResult[]) => void }>()
  private getApiKey: () => string | null
  private cachedClient: { apiKey: string; client: Anthropic } | null = null

  constructor(getApiKey: () => string | null) {
    this.getApiKey = getApiKey
  }

  private getOrCreateClient(apiKey: string): Anthropic {
    if (this.cachedClient && this.cachedClient.apiKey === apiKey) {
      return this.cachedClient.client
    }
    const client = new Anthropic({ apiKey })
    this.cachedClient = { apiKey, client }
    return client
  }

  /** Convert provider-agnostic ToolSchema to Anthropic tool format */
  private toAnthropicTools(
    tools: ToolSchema[]
  ): (Anthropic.Messages.Tool | Anthropic.Messages.WebSearchTool20250305)[] {
    return tools.map((t) => {
      if (t.name === 'web_search') {
        return { type: 'web_search_20250305' as const, name: 'web_search' }
      }
      return {
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema as Anthropic.Messages.Tool.InputSchema
      }
    })
  }

  /** Convert provider-agnostic ToolResult to Anthropic ToolResultBlockParam */
  private toAnthropicToolResults(results: ToolResult[]): Anthropic.Messages.ToolResultBlockParam[] {
    return results.map((r) => ({
      type: 'tool_result' as const,
      tool_use_id: r.toolCallId,
      content: r.content,
      ...(r.isError ? { is_error: true } : {})
    }))
  }

  private waitForToolResults(agentId: AgentId): Promise<ToolResult[]> {
    return new Promise((resolve) => {
      this.pendingToolResults.set(agentId, { resolve })
    })
  }

  async *sendMessage(opts: ChatOpts, message: string): AsyncIterable<StreamEvent> {
    const apiKey = this.getApiKey()
    if (!apiKey) {
      yield { type: 'error', error: 'no-api-key' }
      return
    }

    const client = this.getOrCreateClient(apiKey)
    const history = this.history.getOrCreate(opts.agentId)

    this.history.repairOrphanedToolUse(history)

    // Avoid duplicate on retry: only push if the last message isn't already this exact user message
    const last = history[history.length - 1]
    if (!(last?.role === 'user' && last.content === message)) {
      history.push({ role: 'user', content: message })
    }

    const controller = new AbortController()
    this.activeStreams.set(opts.agentId, controller)

    const anthropicTools = this.toAnthropicTools(opts.tools)

    try {
      let continueLoop = true
      let toolRounds = 0

      while (continueLoop) {
        if (++toolRounds > MAX_TOOL_ROUNDS) {
          yield { type: 'error', error: 'tool-rounds-exceeded' }
          break
        }

        const stream = client.messages.stream(
          {
            model: opts.model,
            max_tokens: opts.maxTokens,
            temperature: opts.temperature,
            system: opts.systemPrompt,
            messages: this.history.trim(history),
            ...(anthropicTools.length > 0 ? { tools: anthropicTools } : {})
          },
          { signal: controller.signal }
        )

        // Yield text deltas as they arrive for smooth token-by-token streaming
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            yield { type: 'text', chunk: event.delta.text }
          }
        }

        const finalMessage = await stream.finalMessage()

        if (finalMessage.stop_reason === 'tool_use') {
          history.push({ role: 'assistant', content: finalMessage.content })

          // Yield batched tool_use event for all tool blocks in this API response
          const calls = finalMessage.content
            .filter((b): b is Anthropic.Messages.ToolUseBlock => b.type === 'tool_use')
            .map((b) => ({
              toolCallId: b.id,
              toolName: b.name as ToolName,
              args: b.input as Record<string, unknown>
            }))
          yield { type: 'tool_use', calls }

          // Suspend — wait for orchestrator to supply results for ALL tool calls
          const results = await this.waitForToolResults(opts.agentId)
          history.push({ role: 'user', content: this.toAnthropicToolResults(results) })
        } else {
          // stop_reason is 'end_turn' or 'max_tokens' — done
          history.push({ role: 'assistant', content: finalMessage.content })
          continueLoop = false
        }
      }

      yield { type: 'end' }
    } catch (err: unknown) {
      const isAbort =
        err instanceof Error && (err.name === 'AbortError' || err.message.includes('aborted'))

      // Repair history to maintain valid alternating sequence
      const lastMsg = history[history.length - 1]
      if (lastMsg?.role === 'assistant' && Array.isArray(lastMsg.content)) {
        const toolUseBlocks = (lastMsg.content as Anthropic.Messages.ContentBlock[]).filter(
          (b) => b.type === 'tool_use'
        )
        if (toolUseBlocks.length > 0) {
          const errorResults: Anthropic.Messages.ToolResultBlockParam[] = toolUseBlocks.map(
            (b) => ({
              type: 'tool_result' as const,
              tool_use_id: (b as Anthropic.Messages.ToolUseBlock).id,
              content: '操作因錯誤中斷。(Operation interrupted by error.)',
              is_error: true
            })
          )
          history.push({ role: 'user', content: errorResults })
        }
      } else if (lastMsg?.role === 'user' && !isAbort) {
        // If error happened before any response, remove the dangling user message
        history.pop()
      }

      if (isAbort) {
        yield { type: 'end' }
      } else {
        const error = err instanceof Error ? err.message : String(err)
        console.error(`[ApiKeyChatBackend] Stream error for agent ${opts.agentId}:`, err)
        yield { type: 'error', error }
      }
    } finally {
      this.activeStreams.delete(opts.agentId)
      this.pendingToolResults.delete(opts.agentId)
    }
  }

  supplyToolResults(agentId: AgentId, results: ToolResult[]): void {
    const pending = this.pendingToolResults.get(agentId)
    if (pending) {
      this.pendingToolResults.delete(agentId)
      pending.resolve(results)
    }
  }

  cancelStream(agentId: AgentId): void {
    const controller = this.activeStreams.get(agentId)
    if (controller) {
      controller.abort()
    }
  }

  clearHistory(agentId: AgentId): void {
    this.history.clear(agentId)
  }
}
