/**
 * Shared type definitions used across main, preload, and renderer processes.
 * Keep this file free of runtime imports — types only.
 */

/** NPC/agent identifier. Used consistently across AgentConfig, AgentDef, GameEvents, and IPC. */
export type AgentId = string

/** Message role for Anthropic API conversations. */
export type MessageRole = 'user' | 'assistant'
