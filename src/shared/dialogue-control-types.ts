// src/shared/dialogue-control-types.ts

/** A slash command discovered from the Agent SDK / Claude CLI */
export interface SlashCommand {
  name: string // e.g., "brainstorm"
  description: string // from SDK, not localized
}

/** An @ mention source (NPC, book, or file) */
export interface AtSource {
  type: 'npc' | 'book' | 'file'
  id: string
  label: string // display name
  secondary?: string // e.g., NPC localized name, book origin NPC
}

/** Unified autocomplete item for both / and @ */
export interface AutocompleteItem {
  type: 'slash' | 'npc' | 'book' | 'file'
  id: string
  label: string
  description?: string
  icon?: string
}

/** Permission modes exposed in the UI (subset of full PermissionMode) */
export const UI_PERMISSION_MODES = ['default', 'acceptEdits', 'auto', 'plan'] as const
export type UIPermissionMode = (typeof UI_PERMISSION_MODES)[number]

/** Icon for each UI permission mode */
export const PERMISSION_MODE_ICONS: Record<UIPermissionMode, string> = {
  default: '📋',
  acceptEdits: '✏️',
  auto: '⚡',
  plan: '🗺️'
}
