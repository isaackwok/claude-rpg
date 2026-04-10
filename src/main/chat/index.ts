// src/main/chat/index.ts — barrel re-exports
export { ChatOrchestrator } from './orchestrator'
export type { ChatDependencies } from './orchestrator'
export { ApiKeyChatBackend } from './api-key-backend'
export type { IChatBackend, StreamEvent, ChatOpts, ToolSchema, ToolResult, ToolCall } from './types'
export {
  handleToolApproved,
  handleToolDenied,
  handlePathApproved,
  handlePathDenied
} from './tool-confirm'
