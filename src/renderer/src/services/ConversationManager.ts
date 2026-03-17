import { EventBus } from '../game/EventBus'

// TODO(phase-3): Replace InMemoryConversationRepository with SQLiteConversationRepository
export interface IConversationRepository {
  getConversation(agentId: string): Conversation | null
  getOrCreateConversation(agentId: string): Conversation
  appendMessage(agentId: string, message: Message): void
  appendStreamChunk(agentId: string, chunk: string): void
  finalizeStream(agentId: string): void
  markWaiting(agentId: string): void
  markStreamError(agentId: string): void
  prepareRetry(agentId: string): void
  getStreamingState(agentId: string): StreamingState
}

export interface Conversation {
  agentId: string
  messages: Message[]
  streamingState: StreamingState
  hasUnread: boolean
  // TODO(phase-3): Add id, playerId, skillCategory, xpEarned, status, timestamps
}

export interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

export type StreamingState = 'idle' | 'waiting' | 'streaming' | 'error'

type Listener = () => void

class InMemoryConversationRepository implements IConversationRepository {
  private conversations = new Map<string, Conversation>()
  private listeners: Listener[] = []
  private activeDialogueAgentId: string | null = null
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

  setActiveDialogue(agentId: string | null): void {
    this.activeDialogueAgentId = agentId
    if (agentId) {
      const conv = this.conversations.get(agentId)
      if (conv?.hasUnread) {
        conv.hasUnread = false
        EventBus.emit('npc:speech-bubble', { agentId, style: false })
        this.notify()
      }
    }
  }

  getConversation(agentId: string): Conversation | null {
    return this.conversations.get(agentId) ?? null
  }

  getOrCreateConversation(agentId: string): Conversation {
    if (!this.conversations.has(agentId)) {
      this.conversations.set(agentId, {
        agentId,
        messages: [],
        streamingState: 'idle',
        hasUnread: false
      })
    }
    return this.conversations.get(agentId)!
  }

  appendMessage(agentId: string, message: Message): void {
    const conv = this.getOrCreateConversation(agentId)
    conv.messages.push(message)
    this.notify()
  }

  appendStreamChunk(agentId: string, chunk: string): void {
    const conv = this.getOrCreateConversation(agentId)
    const wasStreaming = conv.streamingState === 'streaming'
    conv.streamingState = 'streaming'

    // If already streaming, append to the in-progress assistant message
    // Otherwise, create a new assistant message for this stream
    if (wasStreaming) {
      const last = conv.messages[conv.messages.length - 1]
      if (last && last.role === 'assistant') {
        last.content += chunk
      }
    } else {
      conv.messages.push({ role: 'assistant', content: chunk, timestamp: Date.now() })
    }

    // Speech bubble if this NPC's dialogue isn't open
    if (this.activeDialogueAgentId !== agentId) {
      if (!conv.hasUnread) {
        conv.hasUnread = true
      }
      EventBus.emit('npc:speech-bubble', { agentId, style: 'streaming' })
    }

    this.notify()
  }

  finalizeStream(agentId: string): void {
    const conv = this.conversations.get(agentId)
    if (conv) {
      conv.streamingState = 'idle'
      // Switch bubble from "streaming dots" to "ready checkmark"
      if (this.activeDialogueAgentId !== agentId && conv.hasUnread) {
        EventBus.emit('npc:speech-bubble', { agentId, style: 'ready' })
      }
      this.notify()
    }
  }

  markStreamError(agentId: string): void {
    const conv = this.conversations.get(agentId)
    if (conv) {
      conv.streamingState = 'error'
      this.notify()
    }
  }

  /** Reset error state and remove the failed assistant message stub (if any) for retry */
  prepareRetry(agentId: string): void {
    const conv = this.conversations.get(agentId)
    if (conv) {
      conv.streamingState = 'idle'
      // Remove the incomplete assistant message that errored out
      const last = conv.messages[conv.messages.length - 1]
      if (last?.role === 'assistant') {
        conv.messages.pop()
      }
      this.notify()
    }
  }

  markWaiting(agentId: string): void {
    const conv = this.getOrCreateConversation(agentId)
    conv.streamingState = 'waiting'
    this.notify()
  }

  getStreamingState(agentId: string): StreamingState {
    return this.conversations.get(agentId)?.streamingState ?? 'idle'
  }
}

// Singleton instance
// TODO(phase-3): Replace with SQLite-backed implementation
export const conversationManager = new InMemoryConversationRepository()
