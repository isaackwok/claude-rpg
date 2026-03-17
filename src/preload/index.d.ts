import { ElectronAPI } from '@electron-toolkit/preload'

interface ChatAPI {
  // API key
  setApiKey(key: string): Promise<boolean>
  checkApiKey(): Promise<boolean>
  clearApiKey(): Promise<void>
  // Chat (added in Task 5)
  sendMessage(agentId: string, message: string, locale: string): void
  cancelStream(agentId: string): void
  onStreamChunk(callback: (data: { agentId: string; chunk: string }) => void): () => void
  onStreamEnd(callback: (data: { agentId: string }) => void): () => void
  onStreamError(callback: (data: { agentId: string; error: string }) => void): () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: ChatAPI
  }
}
