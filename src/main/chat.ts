import Anthropic from '@anthropic-ai/sdk'
import type { WebContents } from 'electron'
import { getApiKey } from './api-key'
import { getAgentConfig } from './agents/system-prompts'
import type { AgentId, MessageRole } from '../shared/types'

interface Message {
  role: MessageRole
  content: string
}

interface ActiveStream {
  agentId: AgentId
  controller: AbortController
}

const MAX_CONCURRENT_STREAMS = 3
const MAX_HISTORY_MESSAGES = 50

let cachedClient: { apiKey: string; client: Anthropic } | null = null

function getOrCreateClient(apiKey: string): Anthropic {
  if (cachedClient && cachedClient.apiKey === apiKey) {
    return cachedClient.client
  }
  const client = new Anthropic({ apiKey })
  cachedClient = { apiKey, client }
  return client
}

const conversationHistories = new Map<AgentId, Message[]>()
const activeStreams = new Map<AgentId, ActiveStream>()
const pendingQueue: Array<{
  agentId: AgentId
  message: string
  locale: string
  webContents: WebContents
}> = []

function getOrCreateHistory(agentId: AgentId): Message[] {
  if (!conversationHistories.has(agentId)) {
    conversationHistories.set(agentId, [])
  }
  return conversationHistories.get(agentId)!
}

function trimHistory(messages: Message[]): Message[] {
  if (messages.length <= MAX_HISTORY_MESSAGES) return messages
  // Trim from the front, ensuring we start on a 'user' message boundary
  // so the Anthropic API receives a valid alternating sequence
  let startIndex = messages.length - MAX_HISTORY_MESSAGES
  while (startIndex < messages.length && messages[startIndex].role !== 'user') {
    startIndex++
  }
  return messages.slice(startIndex)
}

function processQueue(): void {
  while (pendingQueue.length > 0 && activeStreams.size < MAX_CONCURRENT_STREAMS) {
    const next = pendingQueue.shift()!
    executeStream(next.agentId, next.message, next.locale, next.webContents)
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
  // Avoid duplicate on retry: only push if the last message isn't already this exact user message
  const last = history[history.length - 1]
  if (!(last?.role === 'user' && last.content === message)) {
    history.push({ role: 'user', content: message })
  }

  const controller = new AbortController()
  const client = getOrCreateClient(apiKey)
  const systemPrompt =
    locale === 'en'
      ? config.systemPrompt + '\n\nThe player is using English. Respond in English.'
      : config.systemPrompt

  activeStreams.set(agentId, { agentId, controller })
  let fullResponse = ''

  try {
    const stream = client.messages.stream(
      {
        model: config.model,
        max_tokens: config.maxTokens,
        temperature: config.temperature,
        system: systemPrompt,
        messages: trimHistory(history).map((m) => ({ role: m.role, content: m.content })),
        tools: [{ name: 'web_search', type: 'web_search_20250305' as const }]
      },
      { signal: controller.signal }
    )

    stream.on('text', (text) => {
      fullResponse += text
      if (!webContents.isDestroyed()) {
        webContents.send('chat:stream-chunk', { agentId, chunk: text })
      }
    })

    await stream.finalMessage()

    history.push({ role: 'assistant', content: fullResponse })

    if (!webContents.isDestroyed()) {
      webContents.send('chat:stream-end', { agentId })
    }
  } catch (err: unknown) {
    const isAbort =
      err instanceof Error && (err.name === 'AbortError' || err.message.includes('aborted'))

    // Maintain valid alternating sequence for the Anthropic API:
    // - No response received: pop the orphaned user message
    // - Partial response received: commit it as the assistant message
    if (fullResponse) {
      history.push({ role: 'assistant', content: fullResponse })
    } else {
      const last = history[history.length - 1]
      if (last?.role === 'user') {
        history.pop()
      }
    }

    if (isAbort) {
      // User-initiated cancel — send clean cancellation, not an error
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
    // Only abort — let executeStream's finally block handle cleanup and queue processing
    stream.controller.abort()
  }
}
