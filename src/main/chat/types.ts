// src/main/chat/types.ts
import type { AgentId, ToolName } from '../../shared/types'

// ── Provider-agnostic types ──────────────────────────────────────────

/** Provider-agnostic tool definition (JSON Schema — universal across providers) */
export interface ToolSchema {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

/** Provider-agnostic tool result */
export interface ToolResult {
  toolCallId: string
  content: string
  isError?: boolean
}

/** A single tool invocation request from the AI */
export interface ToolCall {
  toolCallId: string
  toolName: ToolName
  args: Record<string, unknown>
}

// ── Stream & interface types ─────────────────────────────────────────

export type StreamEvent =
  | { type: 'text'; chunk: string }
  | { type: 'tool_use'; calls: ToolCall[] }
  | { type: 'end' }
  | { type: 'error'; error: string }

export interface ChatOpts {
  agentId: AgentId
  systemPrompt: string
  tools: ToolSchema[]
  model: string
  maxTokens: number
  temperature: number
  /** SDK tool names for backends that manage tools internally */
  allowedToolNames?: string[]
  /** Callback for tool progress events (informational) */
  onToolProgress?: (toolName: string) => void
  /** Permission mode for Agent SDK backends (per-query) */
  permissionMode?: import('../../shared/types').PermissionMode
}

export interface IChatBackend {
  /** If true, this backend manages tool execution internally (e.g. Agent SDK). */
  readonly managesTools?: boolean

  /** Start or continue a conversation. Returns an async iterable of stream events. */
  sendMessage(opts: ChatOpts, message: string): AsyncIterable<StreamEvent>

  /** Provide tool results back to the backend mid-conversation */
  supplyToolResults(agentId: AgentId, results: ToolResult[]): void

  /** Cancel an active stream */
  cancelStream(agentId: AgentId): void

  /** Clear conversation history for an agent */
  clearHistory(agentId: AgentId): void
}
