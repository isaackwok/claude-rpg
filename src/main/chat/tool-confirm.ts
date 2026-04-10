// src/main/chat/tool-confirm.ts
import type { WebContents } from 'electron'
import { resolve, normalize } from 'path'
import { addApprovedFolder, isPathApproved } from '../folder-manager'
import type { AgentId, ToolConfirmPayload, PathApprovalPayload } from '../../shared/types'

interface PendingToolConfirm {
  resolve: (result: { approved: boolean; addToApproved?: string }) => void
  timer: ReturnType<typeof setTimeout>
}

interface PendingPathApproval {
  resolve: (result: { approved: string[]; denied: string[] }) => void
  approved: string[]
  denied: string[]
  remaining: Set<string>
}

export const TOOL_CONFIRM_TIMEOUT = 5 * 60 * 1000 // 5 minutes

const pendingToolConfirms = new Map<string, PendingToolConfirm>()
const pendingPathApprovals = new Map<AgentId, PendingPathApproval>()

/** Paths approved via "allow once" — valid for the session, not persisted to disk. */
export const oneTimeApprovedPaths = new Set<string>()

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Stream text character-by-character to simulate NPC typing. */
export async function streamTextWithDelay(
  agentId: AgentId,
  text: string,
  webContents: WebContents
): Promise<void> {
  let i = 0
  while (i < text.length) {
    if (webContents.isDestroyed()) return
    const chunkSize = Math.min(2 + Math.floor(Math.random() * 3), text.length - i)
    const chunk = text.slice(i, i + chunkSize)
    webContents.send('chat:stream-chunk', { agentId, chunk })
    i += chunkSize
    const lastChar = chunk[chunk.length - 1]
    const isPunctuation = '，。、！？…：；'.includes(lastChar) || /[,.!?;:]/.test(lastChar)
    await delay(isPunctuation ? 60 : 20)
  }
}

/** Extract the target file/dir path from tool args for folder approval check. */
export function getToolTargetPath(toolName: string, args: Record<string, unknown>): string | null {
  if (toolName === 'run_command') {
    return typeof args.cwd === 'string' ? args.cwd : null
  }
  return typeof args.path === 'string' ? args.path : null
}

/** Build a human-readable summary of what the tool call will do. */
export function buildToolSummary(toolName: string, args: Record<string, unknown>): string {
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
export function requestToolConfirmation(
  payload: ToolConfirmPayload,
  webContents: WebContents
): Promise<{ approved: boolean; addToApproved?: string }> {
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
export function extractMessagePaths(message: string): string[] {
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
export async function checkAndApproveMessagePaths(
  agentId: AgentId,
  message: string,
  locale: string,
  webContents: WebContents
): Promise<string> {
  const paths = extractMessagePaths(message)
  if (paths.length === 0) return message

  const unapproved = paths.filter(
    (p) => !isPathApproved(p) && !oneTimeApprovedPaths.has(resolve(normalize(p)))
  )
  if (unapproved.length === 0) return message

  const npcMessage =
    locale === 'en'
      ? '⚠ These scrolls lie beyond the boundaries of your issued permits. I cannot read them without your authorization, adventurer.'
      : '⚠ 這些卷軸在你核發的通行令範圍之外，冒險者。沒有你的許可，我無法查閱它們。'

  if (!webContents.isDestroyed()) {
    await streamTextWithDelay(agentId, npcMessage, webContents)
    await delay(300)
    if (!webContents.isDestroyed()) {
      webContents.send('chat:path-approval', {
        agentId,
        paths: unapproved
      } as PathApprovalPayload)
    }
  }

  const result = await new Promise<{ approved: string[]; denied: string[] }>((resolve) => {
    const timer = setTimeout(() => {
      const pending = pendingPathApprovals.get(agentId)
      if (!pending) return
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

  let finalMessage = message
  for (const path of result.denied) {
    finalMessage = finalMessage
      .replace(new RegExp(`\\s*\`${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\``, 'g'), '')
      .trim()
  }

  return finalMessage
}

/** Handle user's path approval response (post scroll or allow once). */
export function handlePathApproved(agentId: string, path: string, addToApproved?: string): void {
  if (addToApproved) {
    addApprovedFolder(addToApproved)
  } else {
    oneTimeApprovedPaths.add(resolve(normalize(path)))
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
