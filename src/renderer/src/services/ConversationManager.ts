import { EventBus } from '../game/EventBus'
import type { AgentId, MessageRole } from '../../../shared/types'

// TODO(phase-3): Replace InMemoryConversationRepository with SQLiteConversationRepository
export interface IConversationRepository {
  subscribe(listener: Listener): () => void
  getVersion(): number
  setActiveDialogue(agentId: AgentId | null): void
  getConversation(agentId: AgentId): Readonly<Conversation> | null
  getOrCreateConversation(agentId: AgentId): Readonly<Conversation>
  appendMessage(agentId: AgentId, message: Message): void
  appendStreamChunk(agentId: AgentId, chunk: string): void
  finalizeStream(agentId: AgentId): void
  markWaiting(agentId: AgentId): void
  markStreamError(agentId: AgentId, error: string): void
  prepareRetry(agentId: AgentId): void
  getStreamingState(agentId: AgentId): StreamingState
  clearUnreadMarker(agentId: AgentId): void
}

export type ConversationStatus =
  | { readonly state: 'idle' }
  | { readonly state: 'waiting' }
  | { readonly state: 'streaming' }
  | { readonly state: 'error'; readonly error: string }

export interface Conversation {
  readonly agentId: AgentId
  readonly messages: readonly Message[]
  readonly status: ConversationStatus
  readonly hasUnread: boolean
  readonly firstUnreadIndex: number | null
  // TODO(phase-3): Add id, playerId, skillCategory, xpEarned, status, timestamps
}

export interface Message {
  readonly role: MessageRole
  readonly content: string
  readonly timestamp: number
}

export type StreamingState = ConversationStatus['state']
type Listener = () => void

/** Internal mutable version of Conversation for repository implementation */
interface MutableConversation {
  agentId: AgentId
  messages: Message[]
  status: ConversationStatus
  hasUnread: boolean
  firstUnreadIndex: number | null
}

class InMemoryConversationRepository implements IConversationRepository {
  private conversations = new Map<AgentId, MutableConversation>()
  private listeners: Listener[] = []
  private activeDialogueAgentId: AgentId | null = null
  private version = 0

  subscribe(listener: Listener): () => void {
    this.listeners.push(listener)
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener)
    }
  }

  /** Returns a version number that increments on every change — used by useSyncExternalStore */
  getVersion(): number {
    return this.version
  }

  private notify(): void {
    this.version++
    for (const listener of this.listeners) listener()
  }

  setActiveDialogue(agentId: AgentId | null): void {
    this.activeDialogueAgentId = agentId
    if (agentId) {
      const conv = this.conversations.get(agentId)
      if (conv?.hasUnread) {
        conv.hasUnread = false
        // Keep firstUnreadIndex — DialoguePanel reads it before clearing
        EventBus.emit('npc:speech-bubble', { agentId, style: false })
        this.notify()
      }
    }
  }

  private getMutableConversation(agentId: AgentId): MutableConversation {
    if (!this.conversations.has(agentId)) {
      this.conversations.set(agentId, {
        agentId,
        messages: [],
        status: { state: 'idle' },
        hasUnread: false,
        firstUnreadIndex: null
      })
    }
    return this.conversations.get(agentId)!
  }

  getConversation(agentId: AgentId): Readonly<Conversation> | null {
    return this.conversations.get(agentId) ?? null
  }

  getOrCreateConversation(agentId: AgentId): Readonly<Conversation> {
    return this.getMutableConversation(agentId)
  }

  appendMessage(agentId: AgentId, message: Message): void {
    const conv = this.getMutableConversation(agentId)
    conv.messages.push(message)
    this.notify()
  }

  appendStreamChunk(agentId: AgentId, chunk: string): void {
    const conv = this.getMutableConversation(agentId)
    const wasStreaming = conv.status.state === 'streaming'
    conv.status = { state: 'streaming' }

    // If already streaming, append to the in-progress assistant message
    // Otherwise, create a new assistant message for this stream
    if (wasStreaming) {
      const last = conv.messages[conv.messages.length - 1]
      if (last && last.role === 'assistant') {
        ;(last as { content: string }).content += chunk
      }
    } else {
      conv.messages.push({ role: 'assistant', content: chunk, timestamp: Date.now() })
    }

    // Speech bubble if this NPC's dialogue isn't open
    if (this.activeDialogueAgentId !== agentId) {
      if (!conv.hasUnread) {
        conv.hasUnread = true
        // Track where unread messages start (index of the new assistant message)
        conv.firstUnreadIndex = conv.messages.length - 1
      }
      EventBus.emit('npc:speech-bubble', { agentId, style: 'streaming' })
    }

    this.notify()
  }

  finalizeStream(agentId: AgentId): void {
    const conv = this.conversations.get(agentId)
    if (conv) {
      conv.status = { state: 'idle' }
      // Switch bubble from "streaming dots" to "ready checkmark"
      if (this.activeDialogueAgentId !== agentId && conv.hasUnread) {
        EventBus.emit('npc:speech-bubble', { agentId, style: 'ready' })
      }
      this.notify()
    }
  }

  markStreamError(agentId: AgentId, error: string): void {
    const conv = this.conversations.get(agentId)
    if (conv) {
      conv.status = { state: 'error', error }
      this.notify()
    }
  }

  /** Reset error state and remove the failed assistant message stub (if any) for retry */
  prepareRetry(agentId: AgentId): void {
    const conv = this.conversations.get(agentId)
    if (conv) {
      conv.status = { state: 'idle' }
      // Remove the incomplete assistant message that errored out
      const last = conv.messages[conv.messages.length - 1]
      if (last?.role === 'assistant') {
        conv.messages.pop()
      }
      this.notify()
    }
  }

  clearUnreadMarker(agentId: AgentId): void {
    const conv = this.conversations.get(agentId)
    if (conv && conv.firstUnreadIndex !== null) {
      conv.firstUnreadIndex = null
      this.notify()
    }
  }

  markWaiting(agentId: AgentId): void {
    const conv = this.getMutableConversation(agentId)
    conv.status = { state: 'waiting' }
    this.notify()
  }

  getStreamingState(agentId: AgentId): StreamingState {
    return this.conversations.get(agentId)?.status.state ?? 'idle'
  }
}

// Singleton instance
// TODO(phase-3): Replace with SQLite-backed implementation
export const conversationManager = new InMemoryConversationRepository()
