import { ElectronAPI } from '@electron-toolkit/preload'
import type {
  ApprovedFolder,
  ToolConfirmPayload,
  ToolExecutingPayload,
  PathApprovalPayload,
  PlayerState,
  SkillMap,
  XPAwardResult,
  LocalizedString,
  PersistedMessage,
  PlayerQuest,
  CompletedQuest,
  QuestBoardSuggestion,
  QuestVisibility
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
  // Progression
  getPlayerState(): Promise<PlayerState>
  getSkills(): Promise<SkillMap>
  onXPAwarded(callback: (result: XPAwardResult) => void): () => void
  onTitleChanged(callback: (data: { newTitle: LocalizedString }) => void): () => void
  // Conversation history
  getConversationHistory(agentId: string): Promise<PersistedMessage[]>
  // Quests
  getQuests(): Promise<PlayerQuest[]>
  getQuestBoardSuggestion(): Promise<QuestBoardSuggestion | null>
  onQuestsUpdated(
    callback: (data: { quests: PlayerQuest[]; completed?: CompletedQuest[] }) => void
  ): () => void
  onQuestDiscovered(
    callback: (data: { questDefId: string; visibility: QuestVisibility }) => void
  ): () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: ChatAPI
  }
}
