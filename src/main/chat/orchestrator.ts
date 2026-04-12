// src/main/chat/orchestrator.ts
import type { WebContents } from 'electron'
import { resolve, normalize } from 'path'
import type { AgentId, ToolName, ToolConfirmPayload } from '../../shared/types'
import { SKILL_CATEGORIES } from '../../shared/types'
import type { IChatBackend, ChatOpts, ToolSchema, ToolResult } from './types'
import {
  checkAndApproveMessagePaths,
  requestToolConfirmation,
  getToolTargetPath,
  buildToolSummary,
  oneTimeApprovedPaths
} from './tool-confirm'
import { getAgentConfig, getAgentToolContext } from '../agents/system-prompts'
import { getToolsForAgent, AGENT_TOOLS } from '../tools/tool-definitions'
import { executeTool } from '../tools/tool-executor'
import { getApprovedFolders, isPathApproved, addApprovedFolder } from '../folder-manager'
import { getParentFolder } from '../tools/path-utils'
import { getCosmeticDefinition } from '../cosmetic-definitions'
import type { ProgressionEngine } from '../progression-engine'
import type { QuestEngine } from '../quest-engine'
import type { SqliteConversationPersistence } from '../db/conversation-persistence'
import type { AchievementEngine } from '../achievement-engine'
import type { SqliteAchievementRepository } from '../db/achievement-repository'
import type { SqliteCosmeticRepository } from '../db/cosmetic-repository'

export interface ChatDependencies {
  progressionEngine: ProgressionEngine
  questEngine: QuestEngine
  conversationPersistence: SqliteConversationPersistence
  achievementEngine: AchievementEngine
  achievementRepo: SqliteAchievementRepository
  cosmeticRepo: SqliteCosmeticRepository
}

const MAX_CONCURRENT_STREAMS = 3

/** Maps RPG tool names → Agent SDK built-in tool names */
const SDK_TOOL_MAP: Record<string, string> = {
  read_file: 'Read',
  write_file: 'Write',
  edit_file: 'Edit',
  list_files: 'Glob',
  web_search: 'WebSearch',
  run_command: 'Bash'
}

export class ChatOrchestrator {
  private backend: IChatBackend
  private activeAgents = new Set<AgentId>()
  private pendingQueue: Array<{
    agentId: AgentId
    message: string
    locale: string
    webContents: WebContents
  }> = []

  private progressionEngine: ProgressionEngine | null = null
  private questEngine: QuestEngine | null = null
  private conversationPersistence: SqliteConversationPersistence | null = null
  private achievementEngine: AchievementEngine | null = null
  private achievementRepo: SqliteAchievementRepository | null = null
  private cosmeticRepo: SqliteCosmeticRepository | null = null
  private dependenciesInitialized = false
  private getModelOverride: ((agentDefault: string) => string) | null = null
  private agentModes = new Map<AgentId, import('../../shared/types').PermissionMode>()
  private globalModeFallback: (() => import('../../shared/types').PermissionMode) | null = null

  /** Set a callback that returns the effective model, given the agent's default.
   *  Used by settings to inject global model preference. */
  setModelResolver(resolver: (agentDefault: string) => string): void {
    this.getModelOverride = resolver
  }

  setAgentMode(agentId: AgentId, mode: import('../../shared/types').PermissionMode): void {
    this.agentModes.set(agentId, mode)
  }

  getAgentMode(agentId: AgentId): import('../../shared/types').PermissionMode {
    return this.agentModes.get(agentId) ?? this.globalModeFallback?.() ?? 'default'
  }

  setGlobalModeFallback(fn: () => import('../../shared/types').PermissionMode): void {
    this.globalModeFallback = fn
  }

  constructor(backend: IChatBackend) {
    this.backend = backend
  }

  setDependencies(deps: ChatDependencies): void {
    this.progressionEngine = deps.progressionEngine
    this.questEngine = deps.questEngine
    this.conversationPersistence = deps.conversationPersistence
    this.achievementEngine = deps.achievementEngine
    this.achievementRepo = deps.achievementRepo
    this.cosmeticRepo = deps.cosmeticRepo
    this.dependenciesInitialized = true
  }

  setBackend(backend: IChatBackend): void {
    this.backend = backend
  }

  handleSendMessage(
    agentId: AgentId,
    message: string,
    locale: string,
    webContents: WebContents
  ): Promise<void> {
    if (this.activeAgents.size >= MAX_CONCURRENT_STREAMS) {
      this.pendingQueue.push({ agentId, message, locale, webContents })
      return Promise.resolve()
    }
    return this.processStream(agentId, message, locale, webContents)
  }

  cancelStream(agentId: AgentId): void {
    this.backend.cancelStream(agentId)
  }

  /** Convert Anthropic tool definitions to provider-agnostic ToolSchema */
  private convertTools(agentId: AgentId): ToolSchema[] {
    const tools = getToolsForAgent(agentId)
    return tools.map((t) => {
      if ('type' in t && t.type === 'web_search_20250305') {
        return { name: 'web_search', description: 'Web search', inputSchema: {} }
      }
      const tool = t as { name: string; description: string; input_schema: Record<string, unknown> }
      return {
        name: tool.name,
        description: tool.description,
        inputSchema: tool.input_schema
      }
    })
  }

  /** Map agent's RPG tool names to Agent SDK built-in tool names */
  private getSdkToolNames(agentId: AgentId): string[] {
    const toolNames = AGENT_TOOLS[agentId]
    if (!toolNames || toolNames.length === 0) return []
    return toolNames.map((name) => SDK_TOOL_MAP[name] ?? name)
  }

  private async processStream(
    agentId: AgentId,
    message: string,
    locale: string,
    webContents: WebContents
  ): Promise<void> {
    const config = getAgentConfig(agentId)
    if (!config) {
      webContents.send('chat:stream-error', { agentId, error: `Unknown agent: ${agentId}` })
      return
    }

    // Check for unapproved paths before calling the backend
    const finalMessage = await checkAndApproveMessagePaths(agentId, message, locale, webContents)
    if (!finalMessage.trim()) {
      if (!webContents.isDestroyed()) {
        webContents.send('chat:stream-end', { agentId })
      }
      return
    }

    if (!this.dependenciesInitialized) {
      console.warn(
        '[ChatOrchestrator] setDependencies() was never called — persistence and XP are disabled'
      )
    }

    // Persist user message to SQLite
    if (this.conversationPersistence && typeof finalMessage === 'string') {
      try {
        const conv = this.conversationPersistence.getOrCreateByAgent(agentId, 'player-1')
        this.conversationPersistence.addMessage(conv.id, 'user', finalMessage, Date.now())
      } catch (err) {
        console.error(`[ChatOrchestrator] Failed to persist user message for ${agentId}:`, err)
      }
    }

    // Build ChatOpts — skip tool context injection when backend manages tools internally
    const toolContext = this.backend.managesTools
      ? ''
      : getAgentToolContext(agentId, getApprovedFolders())
    const systemPrompt =
      locale === 'en'
        ? config.systemPrompt + toolContext + '\n\nThe player is using English. Respond in English.'
        : config.systemPrompt + toolContext

    const opts: ChatOpts = {
      agentId,
      systemPrompt,
      tools: this.backend.managesTools ? [] : this.convertTools(agentId),
      allowedToolNames: this.backend.managesTools ? this.getSdkToolNames(agentId) : undefined,
      onToolProgress: this.backend.managesTools
        ? (toolName) => {
            if (!webContents.isDestroyed()) {
              webContents.send('chat:tool-executing', { agentId, toolName })
            }
          }
        : undefined,
      model: this.getModelOverride?.(config.model) ?? config.model,
      maxTokens: config.maxTokens,
      temperature: config.temperature,
      permissionMode: this.backend.managesTools ? this.getAgentMode(agentId) : undefined
    }

    this.activeAgents.add(agentId)
    let fullTextResponse = ''
    let sawError = false

    try {
      for await (const event of this.backend.sendMessage(opts, finalMessage)) {
        if (webContents.isDestroyed()) break

        switch (event.type) {
          case 'text':
            fullTextResponse += event.chunk
            webContents.send('chat:stream-chunk', { agentId, chunk: event.chunk })
            break

          case 'tool_use': {
            // Process all tool calls in the batch sequentially (confirmation is per-tool)
            const allResults: ToolResult[] = []
            for (const call of event.calls) {
              const result = await this.handleToolUse(
                agentId,
                call.toolCallId,
                call.toolName as ToolName,
                call.args,
                webContents
              )
              allResults.push(result)
            }
            this.backend.supplyToolResults(agentId, allResults)
            break
          }

          case 'end':
            await this.handlePostResponse(agentId, fullTextResponse, config, webContents)
            break

          case 'error':
            sawError = true
            webContents.send('chat:stream-error', { agentId, error: event.error })
            break
        }
      }

      if (!webContents.isDestroyed() && !sawError) {
        webContents.send('chat:stream-end', { agentId })
      }
    } catch (err) {
      console.error(`[ChatOrchestrator] Stream error for ${agentId}:`, err)
      if (!webContents.isDestroyed()) {
        const error = err instanceof Error ? err.message : String(err)
        webContents.send('chat:stream-error', { agentId, error })
      }
    } finally {
      this.activeAgents.delete(agentId)
      this.processQueue()
    }
  }

  private async handleToolUse(
    agentId: AgentId,
    toolCallId: string,
    toolName: ToolName,
    args: Record<string, unknown>,
    webContents: WebContents
  ): Promise<ToolResult> {
    const targetPath = getToolTargetPath(toolName, args)
    const folderApproved =
      toolName === 'run_command'
        ? false
        : targetPath
          ? isPathApproved(targetPath) || oneTimeApprovedPaths.has(resolve(normalize(targetPath)))
          : true

    if (folderApproved) {
      return this.executeAndTrackTool(agentId, toolCallId, toolName, args, webContents)
    }

    // Request user confirmation
    const confirmPayload: ToolConfirmPayload = {
      agentId,
      toolCallId,
      toolName,
      args,
      summary: buildToolSummary(toolName, args),
      folderApproved
    }

    const { approved, addToApproved } = await requestToolConfirmation(confirmPayload, webContents)

    if (!approved) {
      return {
        toolCallId,
        content: '冒險者拒絕了這個操作。(The player denied this tool call.)',
        isError: true
      }
    }

    if (addToApproved) {
      addApprovedFolder(addToApproved)
    }

    return this.executeAndTrackTool(
      agentId,
      toolCallId,
      toolName,
      args,
      webContents,
      targetPath,
      addToApproved
    )
  }

  private async executeAndTrackTool(
    agentId: AgentId,
    toolCallId: string,
    toolName: ToolName,
    args: Record<string, unknown>,
    webContents: WebContents,
    targetPath?: string | null,
    addToApproved?: string
  ): Promise<ToolResult> {
    if (!webContents.isDestroyed()) {
      webContents.send('chat:tool-executing', { agentId, toolName })
    }

    const approvedFolders = [
      ...getApprovedFolders().map((f) => f.path),
      ...Array.from(oneTimeApprovedPaths).map((p) => getParentFolder(p))
    ]

    // For "Just Once" approvals: if targetPath is not in approved folders,
    // temporarily include the relevant directory.
    if (targetPath && !isPathApproved(targetPath) && !addToApproved) {
      const isDirectoryTool = toolName === 'list_files' || toolName === 'run_command'
      approvedFolders.push(
        isDirectoryTool ? resolve(normalize(targetPath)) : getParentFolder(targetPath)
      )
    }

    const result = await executeTool(toolName, args, approvedFolders)

    // Record tool usage for achievements
    try {
      if (this.achievementRepo && this.achievementEngine) {
        this.achievementRepo.recordToolUse('player-1', toolName)
        const toolResult = this.achievementEngine.checkToolUse('player-1')
        if (toolResult.unlocked.length > 0 && !webContents.isDestroyed()) {
          for (const a of toolResult.unlocked) {
            if (a.cosmeticReward && this.cosmeticRepo) {
              this.cosmeticRepo.unlock('player-1', a.cosmeticReward)
              webContents.send('cosmetics:unlocked', {
                cosmeticDefId: a.cosmeticReward,
                title: getCosmeticDefinition(a.cosmeticReward)?.title
              })
            }
          }
          webContents.send('achievements:unlocked', toolResult.unlocked)
        }
      }
    } catch (err) {
      console.error('[ChatOrchestrator] tool achievement check failed:', err)
    }

    return {
      toolCallId,
      content: result.content,
      isError: !result.success
    }
  }

  // handlePostResponse contains the XP, quest, achievement side effects from current chat.ts lines 628-740.
  // This is copied verbatim from the original, just with `this.` prefixes for dependencies.
  private async handlePostResponse(
    agentId: AgentId,
    fullText: string,
    config: { skills: readonly import('../../shared/types').SkillCategory[] },
    webContents: WebContents
  ): Promise<void> {
    // Persist assistant response
    if (fullText && this.conversationPersistence) {
      try {
        const conv = this.conversationPersistence.getOrCreateByAgent(agentId, 'player-1')
        this.conversationPersistence.addMessage(conv.id, 'assistant', fullText, Date.now())
      } catch (err) {
        console.error(`[ChatOrchestrator] Failed to persist assistant message for ${agentId}:`, err)
      }
    }

    // Award XP
    if (fullText && this.progressionEngine && config.skills.length > 0) {
      try {
        const xpResult = this.progressionEngine.awardXP(agentId, config.skills)
        if (!webContents.isDestroyed()) {
          webContents.send('progression:xp-awarded', { ...xpResult, agentId })
          if (xpResult.titleChanged) {
            webContents.send('progression:title-changed', {
              newTitle: xpResult.titleChanged
            })
          }
        }

        // Check quests after XP award
        if (this.questEngine && !webContents.isDestroyed()) {
          try {
            const questResult = this.questEngine.checkQuests('player-1')
            if (questResult.discovered.length > 0) {
              for (const d of questResult.discovered) {
                webContents.send('quests:discovered', d)
              }
            }
            if (questResult.completed.length > 0 && this.progressionEngine) {
              for (const c of questResult.completed) {
                try {
                  const def = this.questEngine.getQuestDef(c.questDefId)
                  const categories =
                    def && def.skillCategories.length > 0 ? def.skillCategories : SKILL_CATEGORIES
                  const bonusResult = this.progressionEngine.awardBonusXP(
                    c.xpReward,
                    categories,
                    agentId
                  )
                  if (!webContents.isDestroyed()) {
                    webContents.send('progression:xp-awarded', {
                      ...bonusResult,
                      agentId
                    })
                  }
                } catch (bonusErr) {
                  console.error(
                    `[ChatOrchestrator] Failed to award bonus XP for quest ${c.questDefId}:`,
                    bonusErr
                  )
                  if (!webContents.isDestroyed()) {
                    webContents.send('quests:error', {
                      error:
                        bonusErr instanceof Error
                          ? bonusErr.message
                          : `bonus-xp-failed:${c.questDefId}`
                    })
                  }
                }
              }
            }
            if (
              (questResult.completed.length > 0 || questResult.discovered.length > 0) &&
              !webContents.isDestroyed()
            ) {
              webContents.send('quests:updated', {
                quests: questResult.quests,
                completed: questResult.completed.length > 0 ? questResult.completed : undefined
              })
            }
          } catch (questErr) {
            console.error(`[ChatOrchestrator] Failed to check quests:`, questErr)
            if (!webContents.isDestroyed()) {
              webContents.send('quests:error', {
                error: questErr instanceof Error ? questErr.message : 'quest-check-failed'
              })
            }
          }
        }

        // Achievement check (progression)
        if (this.achievementEngine && !webContents.isDestroyed()) {
          try {
            const achievementResult = this.achievementEngine.checkProgression('player-1')
            if (achievementResult.unlocked.length > 0 && !webContents.isDestroyed()) {
              for (const a of achievementResult.unlocked) {
                if (a.cosmeticReward && this.cosmeticRepo) {
                  this.cosmeticRepo.unlock('player-1', a.cosmeticReward)
                  webContents.send('cosmetics:unlocked', {
                    cosmeticDefId: a.cosmeticReward,
                    title: getCosmeticDefinition(a.cosmeticReward)?.title
                  })
                }
                if (a.xpReward && this.progressionEngine) {
                  const bonusResult = this.progressionEngine.awardBonusXP(
                    a.xpReward,
                    SKILL_CATEGORIES,
                    agentId,
                    'achievement_bonus'
                  )
                  if (bonusResult && !webContents.isDestroyed()) {
                    webContents.send('progression:xp-awarded', bonusResult)
                  }
                }
              }
              webContents.send('achievements:unlocked', achievementResult.unlocked)
            }
          } catch (err) {
            console.error('[ChatOrchestrator] achievement check failed:', err)
          }
        }
      } catch (err) {
        console.error(`[ChatOrchestrator] Failed to award XP for ${agentId}:`, err)
      }
    }
  }

  private processQueue(): void {
    while (this.pendingQueue.length > 0 && this.activeAgents.size < MAX_CONCURRENT_STREAMS) {
      const next = this.pendingQueue.shift()!
      this.processStream(next.agentId, next.message, next.locale, next.webContents)
    }
  }
}
