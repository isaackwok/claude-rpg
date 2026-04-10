import type Anthropic from '@anthropic-ai/sdk'
import type { AgentId } from '../../shared/types'

type MessageParam = Anthropic.Messages.MessageParam

export const MAX_HISTORY_MESSAGES = 50

export class ConversationHistoryManager {
  private histories = new Map<AgentId, MessageParam[]>()

  getOrCreate(agentId: AgentId): MessageParam[] {
    if (!this.histories.has(agentId)) {
      this.histories.set(agentId, [])
    }
    return this.histories.get(agentId)!
  }

  trim(messages: MessageParam[]): MessageParam[] {
    if (messages.length <= MAX_HISTORY_MESSAGES) return messages
    let startIndex = messages.length - MAX_HISTORY_MESSAGES
    while (startIndex < messages.length && messages[startIndex].role !== 'user') {
      startIndex++
    }
    return messages.slice(startIndex)
  }

  /**
   * Scan history for assistant messages with tool_use blocks that aren't
   * followed by a user message containing matching tool_result blocks.
   * Insert error-result placeholders so the API accepts the conversation.
   */
  repairOrphanedToolUse(history: MessageParam[]): void {
    for (let i = 0; i < history.length; i++) {
      const msg = history[i]
      if (msg.role !== 'assistant' || !Array.isArray(msg.content)) continue

      const toolUseBlocks = (msg.content as Anthropic.Messages.ContentBlock[]).filter(
        (b) => b.type === 'tool_use'
      ) as Anthropic.Messages.ToolUseBlock[]
      if (toolUseBlocks.length === 0) continue

      // Check if the next message is a user message with tool_result blocks
      const next = history[i + 1]
      if (next?.role === 'user' && Array.isArray(next.content)) {
        const resultIds = new Set(
          (next.content as Anthropic.Messages.ToolResultBlockParam[])
            .filter((b) => b.type === 'tool_result')
            .map((b) => b.tool_use_id)
        )
        const allCovered = toolUseBlocks.every((b) => resultIds.has(b.id))
        if (allCovered) continue
      }

      // Missing or incomplete tool_results — insert placeholder
      const errorResults: Anthropic.Messages.ToolResultBlockParam[] = toolUseBlocks.map((b) => ({
        type: 'tool_result' as const,
        tool_use_id: b.id,
        content: '操作因錯誤中斷。(Operation interrupted by error.)',
        is_error: true
      }))
      history.splice(i + 1, 0, { role: 'user', content: errorResults })
    }
  }

  clear(agentId: AgentId): void {
    this.histories.delete(agentId)
  }
}
