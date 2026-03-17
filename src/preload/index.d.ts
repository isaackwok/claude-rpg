import { ElectronAPI } from '@electron-toolkit/preload'
import type {
  ApprovedFolder,
  ToolConfirmPayload,
  ToolExecutingPayload,
  PathApprovalPayload
} from '../shared/types'

interface ChatAPI {
  // API key
  setApiKey(key: string): Promise<boolean>
  checkApiKey(): Promise<boolean>
  clearApiKey(): Promise<void>
  // Chat
  sendMessage(agentId: string, message: string, locale: string): void
  cancelStream(agentId: string): void
  onStreamChunk(callback: (data: { agentId: string; chunk: string }) => void): () => void
  onStreamEnd(callback: (data: { agentId: string }) => void): () => void
  onStreamError(callback: (data: { agentId: string; error: string }) => void): () => void
  // Folder management (Notice Board)
  getApprovedFolders(): Promise<ApprovedFolder[]>
  addApprovedFolder(path: string): Promise<ApprovedFolder>
  removeApprovedFolder(path: string): Promise<void>
  selectAndAddFolder(): Promise<ApprovedFolder | null>
  // Tool confirmation
  onToolConfirm(callback: (data: ToolConfirmPayload) => void): () => void
  onToolExecuting(callback: (data: ToolExecutingPayload) => void): () => void
  approveToolCall(agentId: string, toolCallId: string, addToApproved?: string): void
  denyToolCall(agentId: string, toolCallId: string): void
  // Path approval
  onPathApproval(callback: (data: PathApprovalPayload) => void): () => void
  approvePath(agentId: string, path: string, addToApproved?: string): void
  denyPath(agentId: string, path: string): void
  // Path approval check
  checkPaths(paths: string[]): Promise<Array<{ path: string; approved: boolean }>>
  // File/folder picker
  pickFiles(): Promise<string[]>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: ChatAPI
  }
}
