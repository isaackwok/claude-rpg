// src/main/chat/index.ts — barrel re-exports
export { ChatOrchestrator } from './orchestrator'
export type { ChatDependencies } from './orchestrator'
export { ApiKeyChatBackend } from './api-key-backend'
export { ClaudeCliChatBackend } from './claude-cli-backend'
export type { IChatBackend, StreamEvent, ChatOpts, ToolSchema, ToolResult, ToolCall } from './types'
export {
  handleToolApproved,
  handleToolDenied,
  handlePathApproved,
  handlePathDenied
} from './tool-confirm'
export { BackendManager } from './backend-manager'
export type { BackendManagerDeps } from './backend-manager'
