/**
 * Shared type definitions used across main, preload, and renderer processes.
 * Keep this file free of runtime imports — types only.
 */

/** NPC/agent identifier. Used consistently across AgentConfig, AgentDef, GameEvents, and IPC. */
export type AgentId = string

/** Message role for Anthropic API conversations. */
export type MessageRole = 'user' | 'assistant'

/** Tool names available to NPCs. */
export type ToolName =
  | 'read_file'
  | 'write_file'
  | 'edit_file'
  | 'list_files'
  | 'web_search'
  | 'run_command'

/** A directory approved for NPC file access ("scroll on the Notice Board"). */
export interface ApprovedFolder {
  path: string
  label: string
  addedAt: number
}

/** Sent from main → renderer when an NPC wants to use a tool and needs user confirmation. */
export interface ToolConfirmPayload {
  agentId: AgentId
  toolCallId: string
  toolName: ToolName
  args: Record<string, unknown>
  summary: string
  folderApproved: boolean
}

/** Sent from main → renderer while a tool is executing. */
export interface ToolExecutingPayload {
  agentId: AgentId
  toolName: ToolName
}

/** Result of a tool execution. */
export interface ToolExecutionResult {
  success: boolean
  content: string
  summary: string
}

/** Sent from main → renderer when user's message contains unapproved paths. */
export interface PathApprovalPayload {
  agentId: AgentId
  paths: string[]
}

// ── Progression types (Phase 3A) ──────────────────────────────────────

/** Localized string — defined here so main process can use it without importing from renderer. */
export type LocalizedString = Record<string, string>

export type SkillCategory =
  | 'writing'
  | 'data'
  | 'visual'
  | 'code'
  | 'research'
  | 'organization'
  | 'communication'

export const SKILL_CATEGORIES: readonly SkillCategory[] = [
  'writing',
  'data',
  'visual',
  'code',
  'research',
  'organization',
  'communication'
]

export interface Player {
  id: string
  name: string
  locale: string
  createdAt: number
}

export interface PlayerState {
  id: string
  name: string
  locale: string
  title: LocalizedString
  overallLevel: number
  totalXP: number
  skills: Record<SkillCategory, { xp: number; level: number }>
}

export type SkillMap = Record<SkillCategory, { xp: number; level: number }>

export interface XPAwardResult {
  awards: { category: SkillCategory; amount: number; newTotal: number }[]
  levelUps: { category: SkillCategory; newLevel: number }[]
  overallLevelUp?: { newLevel: number }
  titleChanged?: LocalizedString
}

export interface PersistedMessage {
  role: MessageRole
  content: string
  timestamp: number
}
