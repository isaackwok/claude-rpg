import Anthropic from '@anthropic-ai/sdk'
import type { WebContents } from 'electron'
import { resolve, normalize } from 'path'
import { getApiKey } from './api-key'
import { getAgentConfig, getAgentToolContext } from './agents/system-prompts'
import { getToolsForAgent } from './tools/tool-definitions'
import { executeTool } from './tools/tool-executor'
import { getApprovedFolders, addApprovedFolder, isPathApproved } from './folder-manager'
import { getParentFolder } from './tools/path-utils'
import type { AgentId, ToolName, ToolConfirmPayload, PathApprovalPayload } from '../shared/types'

type MessageParam = Anthropic.Messages.MessageParam

interface ActiveStream {
  agentId: AgentId
  controller: AbortController
}

interface PendingToolConfirm {
  resolve: (result: { approved: boolean; addToApproved?: string }) => void
  timer: ReturnType<typeof setTimeout>
}

const MAX_CONCURRENT_STREAMS = 3
const MAX_HISTORY_MESSAGES = 50
const MAX_TOOL_ROUNDS = 20
const TOOL_CONFIRM_TIMEOUT = 5 * 60 * 1000 // 5 minutes

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Stream text character-by-character to simulate NPC typing. */
async function streamTextWithDelay(
  agentId: AgentId,
  text: string,
  webContents: WebContents
): Promise<void> {
  // Send in small chunks (2-4 chars) with variable delays for a natural feel
  let i = 0
  while (i < text.length) {
    if (webContents.isDestroyed()) return
    const chunkSize = Math.min(2 + Math.floor(Math.random() * 3), text.length - i)
    const chunk = text.slice(i, i + chunkSize)
    webContents.send('chat:stream-chunk', { agentId, chunk })
    i += chunkSize
    // Variable delay: longer after punctuation, shorter otherwise
    const lastChar = chunk[chunk.length - 1]
    const isPunctuation = '，。、！？…：；'.includes(lastChar) || /[,.!?;:]/.test(lastChar)
    await delay(isPunctuation ? 60 : 20)
  }
}

let cachedClient: { apiKey: string; client: Anthropic } | null = null

function getOrCreateClient(apiKey: string): Anthropic {
  if (cachedClient && cachedClient.apiKey === apiKey) {
    return cachedClient.client
  }
  const client = new Anthropic({ apiKey })
  cachedClient = { apiKey, client }
  return client
}

const conversationHistories = new Map<AgentId, MessageParam[]>()
const activeStreams = new Map<AgentId, ActiveStream>()
const pendingToolConfirms = new Map<string, PendingToolConfirm>()

interface PendingPathApproval {
  resolve: (result: { approved: string[]; denied: string[] }) => void
  approved: string[]
  denied: string[]
  remaining: Set<string>
}
const pendingPathApprovals = new Map<AgentId, PendingPathApproval>()
const pendingQueue: Array<{
  agentId: AgentId
  message: string
  locale: string
  webContents: WebContents
}> = []

function getOrCreateHistory(agentId: AgentId): MessageParam[] {
  if (!conversationHistories.has(agentId)) {
    conversationHistories.set(agentId, [])
  }
  return conversationHistories.get(agentId)!
}

function trimHistory(messages: MessageParam[]): MessageParam[] {
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
function repairOrphanedToolUse(history: MessageParam[]): void {
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

function processQueue(): void {
  while (pendingQueue.length > 0 && activeStreams.size < MAX_CONCURRENT_STREAMS) {
    const next = pendingQueue.shift()!
    executeStream(next.agentId, next.message, next.locale, next.webContents)
  }
}

/** Extract the target file/dir path from tool args for folder approval check. */
function getToolTargetPath(toolName: string, args: Record<string, unknown>): string | null {
  if (toolName === 'run_command') {
    return typeof args.cwd === 'string' ? args.cwd : null
  }
  return typeof args.path === 'string' ? args.path : null
}

/** Build a human-readable summary of what the tool call will do. */
function buildToolSummary(toolName: string, args: Record<string, unknown>): string {
  switch (toolName) {
    case 'read_file':
      return `讀取檔案: ${args.path}`
    case 'write_file':
      return `寫入檔案: ${args.path}`
    case 'edit_file':
      return `編輯檔案: ${args.path}`
    case 'list_files':
      return `列出目錄: ${args.path}`
    case 'run_command':
      return `執行指令: ${args.command}`
    default:
      return `${toolName}`
  }
}

/** Request user confirmation for a tool call. Returns approval result. */
function requestToolConfirmation(
  payload: ToolConfirmPayload,
  webContents: WebContents
): Promise<{ approved: boolean; addToApproved?: string }> {
  // If webContents is already destroyed, deny immediately — no point waiting for a response
  if (webContents.isDestroyed()) {
    return Promise.resolve({ approved: false })
  }

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingToolConfirms.delete(payload.toolCallId)
      resolve({ approved: false })
    }, TOOL_CONFIRM_TIMEOUT)

    pendingToolConfirms.set(payload.toolCallId, { resolve, timer })
    webContents.send('chat:tool-confirm', payload)
  })
}

/** Handle user's tool approval response. */
export function handleToolApproved(
  _agentId: string,
  toolCallId: string,
  addToApproved?: string
): void {
  const pending = pendingToolConfirms.get(toolCallId)
  if (!pending) return
  clearTimeout(pending.timer)
  pendingToolConfirms.delete(toolCallId)
  pending.resolve({ approved: true, addToApproved })
}

/** Handle user's tool denial response. */
export function handleToolDenied(_agentId: string, toolCallId: string): void {
  const pending = pendingToolConfirms.get(toolCallId)
  if (!pending) return
  clearTimeout(pending.timer)
  pendingToolConfirms.delete(toolCallId)
  pending.resolve({ approved: false })
}

/** Extract backtick-wrapped absolute paths from a user message. */
function extractMessagePaths(message: string): string[] {
  const matches = message.match(/`([^`]+)`/g)
  if (!matches) return []
  const paths = matches.map((m) => m.slice(1, -1)).filter((p) => p.startsWith('/'))
  return [...new Set(paths)]
}

/**
 * Check user message for unapproved paths. If found, send a NPC response asking
 * for permission and wait for user's approval/denial before proceeding.
 * Returns the final message text (with denied paths removed).
 */
async function checkAndApproveMessagePaths(
  agentId: AgentId,
  message: string,
  locale: string,
  webContents: WebContents
): Promise<string> {
  const paths = extractMessagePaths(message)
  if (paths.length === 0) return message

  const unapproved = paths.filter((p) => !isPathApproved(p))
  if (unapproved.length === 0) return message

  // Stream a NPC-style response character by character for a natural typing feel
  const npcMessage =
    locale === 'en'
      ? '⚠ These scrolls lie beyond the boundaries of your issued permits. I cannot read them without your authorization, adventurer.'
      : '⚠ 這些卷軸在你核發的通行令範圍之外，冒險者。沒有你的許可，我無法查閱它們。'

  if (!webContents.isDestroyed()) {
    await streamTextWithDelay(agentId, npcMessage, webContents)
    // Brief pause before showing the approval buttons
    await delay(300)
    if (!webContents.isDestroyed()) {
      webContents.send('chat:path-approval', {
        agentId,
        paths: unapproved
      } as PathApprovalPayload)
    }
  }

  // Wait for user to resolve all paths (with timeout matching tool confirmation)
  const result = await new Promise<{ approved: string[]; denied: string[] }>((resolve) => {
    const timer = setTimeout(() => {
      const pending = pendingPathApprovals.get(agentId)
      if (!pending) return
      // Treat all remaining paths as denied on timeout
      for (const p of pending.remaining) {
        pending.denied.push(p)
      }
      pendingPathApprovals.delete(agentId)
      resolve({ approved: pending.approved, denied: pending.denied })
    }, TOOL_CONFIRM_TIMEOUT)

    pendingPathApprovals.set(agentId, {
      resolve: (r) => {
        clearTimeout(timer)
        resolve(r)
      },
      approved: [],
      denied: [],
      remaining: new Set(unapproved)
    })
  })

  // Remove denied paths from the message
  let finalMessage = message
  for (const path of result.denied) {
    finalMessage = finalMessage
      .replace(new RegExp(`\\s*\`${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\``, 'g'), '')
      .trim()
  }

  // Finalize the NPC approval message in history — don't keep it as an ongoing stream
  if (!webContents.isDestroyed()) {
    webContents.send('chat:stream-end', { agentId })
  }

  return finalMessage
}

/** Handle user's path approval response (post scroll or allow once). */
export function handlePathApproved(agentId: string, path: string, addToApproved?: string): void {
  if (addToApproved) {
    addApprovedFolder(addToApproved)
  }
  const pending = pendingPathApprovals.get(agentId)
  if (!pending || !pending.remaining.has(path)) return
  pending.approved.push(path)
  pending.remaining.delete(path)
  if (pending.remaining.size === 0) {
    pendingPathApprovals.delete(agentId)
    pending.resolve({ approved: pending.approved, denied: pending.denied })
  }
}

/** Handle user's path denial response. */
export function handlePathDenied(agentId: string, path: string): void {
  const pending = pendingPathApprovals.get(agentId)
  if (!pending || !pending.remaining.has(path)) return
  pending.denied.push(path)
  pending.remaining.delete(path)
  if (pending.remaining.size === 0) {
    pendingPathApprovals.delete(agentId)
    pending.resolve({ approved: pending.approved, denied: pending.denied })
  }
}

async function executeStream(
  agentId: AgentId,
  message: string,
  locale: string,
  webContents: WebContents
): Promise<void> {
  const apiKey = getApiKey()
  if (!apiKey) {
    webContents.send('chat:stream-error', { agentId, error: 'no-api-key' })
    return
  }

  const config = getAgentConfig(agentId)
  if (!config) {
    webContents.send('chat:stream-error', { agentId, error: `Unknown agent: ${agentId}` })
    return
  }

  const history = getOrCreateHistory(agentId)

  // Repair corrupted history: if the last assistant message has tool_use blocks
  // without a following tool_result user message, insert error results so the
  // API doesn't reject the entire conversation.
  repairOrphanedToolUse(history)

  // Check for unapproved paths in the message before calling the API.
  // This may pause to show an approval dialog to the user.
  const finalMessage = await checkAndApproveMessagePaths(agentId, message, locale, webContents)
  if (!finalMessage.trim()) {
    // All paths were denied and nothing left to send
    if (!webContents.isDestroyed()) {
      webContents.send('chat:stream-end', { agentId })
    }
    return
  }

  // Avoid duplicate on retry: only push if the last message isn't already this exact user message
  const last = history[history.length - 1]
  if (!(last?.role === 'user' && last.content === finalMessage)) {
    history.push({ role: 'user', content: finalMessage })
  }

  const controller = new AbortController()
  const client = getOrCreateClient(apiKey)
  const toolContext = getAgentToolContext(agentId, getApprovedFolders())
  const systemPrompt =
    locale === 'en'
      ? config.systemPrompt + toolContext + '\n\nThe player is using English. Respond in English.'
      : config.systemPrompt + toolContext

  const tools = getToolsForAgent(agentId)

  activeStreams.set(agentId, { agentId, controller })
  let fullTextResponse = ''

  try {
    // Tool-use loop: keep calling the API until stop_reason is 'end_turn'
    let continueLoop = true
    let toolRounds = 0

    while (continueLoop) {
      if (++toolRounds > MAX_TOOL_ROUNDS) {
        if (!webContents.isDestroyed()) {
          const msg = '⚠ 工具使用次數已達上限，對話結束。(Tool use limit reached.)'
          webContents.send('chat:stream-chunk', { agentId, chunk: msg })
        }
        break
      }
      const stream = client.messages.stream(
        {
          model: config.model,
          max_tokens: config.maxTokens,
          temperature: config.temperature,
          system: systemPrompt,
          messages: trimHistory(history),
          ...(tools.length > 0 ? { tools } : {})
        },
        { signal: controller.signal }
      )

      // Stream text chunks to renderer
      stream.on('text', (text) => {
        fullTextResponse += text
        if (!webContents.isDestroyed()) {
          webContents.send('chat:stream-chunk', { agentId, chunk: text })
        }
      })

      const finalMessage = await stream.finalMessage()

      if (finalMessage.stop_reason === 'tool_use') {
        // Append the assistant message (with tool_use blocks) to history
        history.push({ role: 'assistant', content: finalMessage.content })

        // Process each tool_use block
        const toolResultBlocks: Anthropic.Messages.ToolResultBlockParam[] = []

        for (const block of finalMessage.content) {
          if (block.type !== 'tool_use') continue

          const toolName = block.name as ToolName
          const args = block.input as Record<string, unknown>
          const targetPath = getToolTargetPath(toolName, args)
          // run_command is never auto-approved — always require user confirmation
          // for shell commands regardless of folder status, since the command string
          // itself can access arbitrary paths.
          const folderApproved =
            toolName === 'run_command' ? false : targetPath ? isPathApproved(targetPath) : true

          // Auto-approve if target path is inside an approved folder
          if (folderApproved) {
            // Send executing indicator
            if (!webContents.isDestroyed()) {
              webContents.send('chat:tool-executing', { agentId, toolName })
            }

            const approvedFolders = getApprovedFolders().map((f) => f.path)
            const result = await executeTool(toolName, args, approvedFolders)

            toolResultBlocks.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: result.content
            })
          } else {
            // Path not in approved folders — request user confirmation
            const confirmPayload: ToolConfirmPayload = {
              agentId,
              toolCallId: block.id,
              toolName,
              args,
              summary: buildToolSummary(toolName, args),
              folderApproved
            }

            const { approved, addToApproved } = await requestToolConfirmation(
              confirmPayload,
              webContents
            )

            if (approved) {
              // If user chose "Issue Permit", add the folder first
              if (addToApproved) {
                addApprovedFolder(addToApproved)
              }

              // Send executing indicator
              if (!webContents.isDestroyed()) {
                webContents.send('chat:tool-executing', { agentId, toolName })
              }

              // Build the effective approved folders list
              const approvedFolders = getApprovedFolders().map((f) => f.path)
              // For "Just Once" approvals: if targetPath is not in approved folders,
              // temporarily include the relevant directory.
              // For directory-oriented tools, use the path itself; for file tools, use the parent.
              if (targetPath && !isPathApproved(targetPath) && !addToApproved) {
                const isDirectoryTool = toolName === 'list_files' || toolName === 'run_command'
                approvedFolders.push(
                  isDirectoryTool ? resolve(normalize(targetPath)) : getParentFolder(targetPath)
                )
              }

              const result = await executeTool(toolName, args, approvedFolders)

              toolResultBlocks.push({
                type: 'tool_result',
                tool_use_id: block.id,
                content: result.content
              })
            } else {
              // Tool denied
              toolResultBlocks.push({
                type: 'tool_result',
                tool_use_id: block.id,
                content: '冒險者拒絕了這個操作。(The player denied this tool call.)',
                is_error: true
              })
            }
          }
        }

        // Append tool results as a user message and continue the loop
        history.push({ role: 'user', content: toolResultBlocks })
      } else {
        // stop_reason is 'end_turn' or 'max_tokens' — done
        history.push({ role: 'assistant', content: finalMessage.content })
        continueLoop = false
      }
    }

    if (!webContents.isDestroyed()) {
      webContents.send('chat:stream-end', { agentId })
    }
  } catch (err: unknown) {
    const isAbort =
      err instanceof Error && (err.name === 'AbortError' || err.message.includes('aborted'))

    // Repair history to maintain valid alternating sequence.
    // If the last entry is an assistant message with tool_use blocks but no
    // corresponding tool_result user message was appended (e.g. error during
    // tool execution), we must add placeholder tool_results to satisfy the API contract.
    const lastMsg = history[history.length - 1]
    if (lastMsg?.role === 'assistant' && Array.isArray(lastMsg.content)) {
      const toolUseBlocks = (lastMsg.content as Anthropic.Messages.ContentBlock[]).filter(
        (b) => b.type === 'tool_use'
      )
      if (toolUseBlocks.length > 0) {
        // No tool_result message was pushed — add error results for all tool_use blocks
        const errorResults: Anthropic.Messages.ToolResultBlockParam[] = toolUseBlocks.map((b) => ({
          type: 'tool_result' as const,
          tool_use_id: (b as Anthropic.Messages.ToolUseBlock).id,
          content: '操作因錯誤中斷。(Operation interrupted by error.)',
          is_error: true
        }))
        history.push({ role: 'user', content: errorResults })
      }
    } else if (fullTextResponse) {
      history.push({ role: 'assistant', content: fullTextResponse })
    } else if (lastMsg?.role === 'user') {
      history.pop()
    }

    if (isAbort) {
      if (!webContents.isDestroyed()) {
        webContents.send('chat:stream-end', { agentId })
      }
    } else {
      const error = err instanceof Error ? err.message : String(err)
      console.error(`[chat] Stream error for agent ${agentId}:`, err)
      if (!webContents.isDestroyed()) {
        webContents.send('chat:stream-error', { agentId, error })
      }
    }
  } finally {
    activeStreams.delete(agentId)
    processQueue()
  }
}

export function handleSendMessage(
  agentId: AgentId,
  message: string,
  locale: string,
  webContents: WebContents
): void {
  if (activeStreams.size >= MAX_CONCURRENT_STREAMS) {
    pendingQueue.push({ agentId, message, locale, webContents })
  } else {
    executeStream(agentId, message, locale, webContents)
  }
}

export function cancelStream(agentId: AgentId): void {
  const stream = activeStreams.get(agentId)
  if (stream) {
    stream.controller.abort()
  }
}
