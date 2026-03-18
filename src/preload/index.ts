import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  // API key
  setApiKey: (key: string): Promise<boolean> => ipcRenderer.invoke('apikey:set', key),
  checkApiKey: (): Promise<boolean> => ipcRenderer.invoke('apikey:check'),
  clearApiKey: (): Promise<void> => ipcRenderer.invoke('apikey:clear'),

  // Chat
  sendMessage: (agentId: string, message: string, locale: string): void =>
    ipcRenderer.send('chat:send-message', { agentId, message, locale }),
  cancelStream: (agentId: string): void => ipcRenderer.send('chat:cancel-stream', { agentId }),
  onStreamChunk: (callback: (data: { agentId: string; chunk: string }) => void): (() => void) => {
    const handler = (_event: unknown, data: { agentId: string; chunk: string }): void =>
      callback(data)
    ipcRenderer.on('chat:stream-chunk', handler)
    return () => ipcRenderer.removeListener('chat:stream-chunk', handler)
  },
  onStreamEnd: (callback: (data: { agentId: string }) => void): (() => void) => {
    const handler = (_event: unknown, data: { agentId: string }): void => callback(data)
    ipcRenderer.on('chat:stream-end', handler)
    return () => ipcRenderer.removeListener('chat:stream-end', handler)
  },
  onStreamError: (callback: (data: { agentId: string; error: string }) => void): (() => void) => {
    const handler = (_event: unknown, data: { agentId: string; error: string }): void =>
      callback(data)
    ipcRenderer.on('chat:stream-error', handler)
    return () => ipcRenderer.removeListener('chat:stream-error', handler)
  },

  // Folder management (Notice Board)
  getApprovedFolders: (): Promise<import('../shared/types').ApprovedFolder[]> =>
    ipcRenderer.invoke('folders:get-all'),
  addApprovedFolder: (path: string): Promise<import('../shared/types').ApprovedFolder> =>
    ipcRenderer.invoke('folders:add', path),
  removeApprovedFolder: (path: string): Promise<void> => ipcRenderer.invoke('folders:remove', path),
  selectAndAddFolder: (): Promise<import('../shared/types').ApprovedFolder | null> =>
    ipcRenderer.invoke('folders:select-add'),

  // Tool confirmation
  onToolConfirm: (
    callback: (data: import('../shared/types').ToolConfirmPayload) => void
  ): (() => void) => {
    const handler = (_event: unknown, data: import('../shared/types').ToolConfirmPayload): void =>
      callback(data)
    ipcRenderer.on('chat:tool-confirm', handler)
    return () => ipcRenderer.removeListener('chat:tool-confirm', handler)
  },
  onToolExecuting: (
    callback: (data: import('../shared/types').ToolExecutingPayload) => void
  ): (() => void) => {
    const handler = (_event: unknown, data: import('../shared/types').ToolExecutingPayload): void =>
      callback(data)
    ipcRenderer.on('chat:tool-executing', handler)
    return () => ipcRenderer.removeListener('chat:tool-executing', handler)
  },
  approveToolCall: (agentId: string, toolCallId: string, addToApproved?: string): void =>
    ipcRenderer.send('chat:tool-approved', { agentId, toolCallId, addToApproved }),
  denyToolCall: (agentId: string, toolCallId: string): void =>
    ipcRenderer.send('chat:tool-denied', { agentId, toolCallId }),

  // Path approval
  onPathApproval: (
    callback: (data: import('../shared/types').PathApprovalPayload) => void
  ): (() => void) => {
    const handler = (_event: unknown, data: import('../shared/types').PathApprovalPayload): void =>
      callback(data)
    ipcRenderer.on('chat:path-approval', handler)
    return () => ipcRenderer.removeListener('chat:path-approval', handler)
  },
  approvePath: (agentId: string, path: string, addToApproved?: string): void =>
    ipcRenderer.send('chat:path-approved', { agentId, path, addToApproved }),
  denyPath: (agentId: string, path: string): void =>
    ipcRenderer.send('chat:path-denied', { agentId, path }),

  // Path approval check
  checkPaths: (paths: string[]): Promise<Array<{ path: string; approved: boolean }>> =>
    ipcRenderer.invoke('folders:check-paths', paths),

  // File/folder picker
  pickFiles: (): Promise<string[]> => ipcRenderer.invoke('dialog:pick-files'),

  // Progression
  getPlayerState: (): Promise<import('../shared/types').PlayerState> =>
    ipcRenderer.invoke('progression:get-player'),
  getSkills: (): Promise<import('../shared/types').SkillMap> =>
    ipcRenderer.invoke('progression:get-skills'),
  onXPAwarded: (
    callback: (result: import('../shared/types').XPAwardResult) => void
  ): (() => void) => {
    const handler = (_event: unknown, result: import('../shared/types').XPAwardResult): void =>
      callback(result)
    ipcRenderer.on('progression:xp-awarded', handler)
    return () => ipcRenderer.removeListener('progression:xp-awarded', handler)
  },
  onTitleChanged: (
    callback: (data: { newTitle: import('../shared/types').LocalizedString }) => void
  ): (() => void) => {
    const handler = (
      _event: unknown,
      data: { newTitle: import('../shared/types').LocalizedString }
    ): void => callback(data)
    ipcRenderer.on('progression:title-changed', handler)
    return () => ipcRenderer.removeListener('progression:title-changed', handler)
  },

  // Conversation history
  getConversationHistory: (
    agentId: string
  ): Promise<import('../shared/types').PersistedMessage[]> =>
    ipcRenderer.invoke('conversations:get-history', agentId),

  // Quests
  getQuests: (): Promise<import('../shared/types').PlayerQuest[]> =>
    ipcRenderer.invoke('quests:get-all'),
  getQuestBoardSuggestion: (): Promise<import('../shared/types').QuestBoardSuggestion | null> =>
    ipcRenderer.invoke('quests:get-board-suggestion'),
  onQuestsUpdated: (
    callback: (data: {
      quests: import('../shared/types').PlayerQuest[]
      completed?: {
        questDefId: string
        title: import('../shared/types').LocalizedString
        xpReward: number
      }[]
    }) => void
  ): (() => void) => {
    const handler = (
      _event: unknown,
      data: {
        quests: import('../shared/types').PlayerQuest[]
        completed?: {
          questDefId: string
          title: import('../shared/types').LocalizedString
          xpReward: number
        }[]
      }
    ): void => callback(data)
    ipcRenderer.on('quests:updated', handler)
    return () => ipcRenderer.removeListener('quests:updated', handler)
  },
  onQuestDiscovered: (
    callback: (data: {
      questDefId: string
      visibility: import('../shared/types').QuestVisibility
    }) => void
  ): (() => void) => {
    const handler = (
      _event: unknown,
      data: { questDefId: string; visibility: import('../shared/types').QuestVisibility }
    ): void => callback(data)
    ipcRenderer.on('quests:discovered', handler)
    return () => ipcRenderer.removeListener('quests:discovered', handler)
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
