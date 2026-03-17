import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from 'react'
import { EventBus } from '../../game/EventBus'
import { useTranslation } from '../../i18n'
import { BUILT_IN_NPCS } from '../../game/data/npcs'
import { conversationManager } from '../../services/ConversationManager'
import type { Conversation } from '../../services/ConversationManager'

interface DialogueState {
  agentId: string
  npcName: string
}

interface DialoguePanelProps {
  onRequestApiKey: () => void
}

export function DialoguePanel({ onRequestApiKey }: DialoguePanelProps) {
  const { t, locale } = useTranslation()
  const [dialogue, setDialogue] = useState<DialogueState | null>(null)
  const [input, setInput] = useState('')
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Subscribe to ConversationManager changes — version counter ensures React detects mutations
  useSyncExternalStore(
    (cb) => conversationManager.subscribe(cb),
    () => conversationManager.getVersion()
  )
  const conversation: Conversation | null = dialogue
    ? conversationManager.getConversation(dialogue.agentId)
    : null

  // Check API key on mount
  useEffect(() => {
    window.api.checkApiKey().then(setHasApiKey)
  }, [])

  // Open dialogue on NPC interact
  useEffect(() => {
    const handler = (data: { agentId: string }): void => {
      const npc = BUILT_IN_NPCS.find((n) => n.id === data.agentId)
      const npcName = npc?.name[locale] ?? npc?.name['zh-TW'] ?? data.agentId
      setDialogue({ agentId: data.agentId, npcName })
      conversationManager.setActiveDialogue(data.agentId)
      conversationManager.getOrCreateConversation(data.agentId)
      // Re-check API key each time
      window.api.checkApiKey().then(setHasApiKey)
    }
    EventBus.on('npc:interact', handler)
    return () => {
      EventBus.off('npc:interact', handler)
    }
  }, [locale])

  // Close handler
  const close = useCallback(() => {
    if (dialogue) {
      EventBus.emit('dialogue:closed', { agentId: dialogue.agentId })
      conversationManager.setActiveDialogue(null)
      setDialogue(null)
      setInput('')
    }
  }, [dialogue])

  // Escape key
  useEffect(() => {
    if (!dialogue) return
    const handleKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [dialogue, close])

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [
    conversation?.messages.length,
    conversation?.messages[conversation.messages.length - 1]?.content
  ])

  // Send message
  const send = useCallback(() => {
    if (!dialogue || !input.trim()) return
    if (!hasApiKey) {
      onRequestApiKey()
      return
    }
    const text = input.trim()
    setInput('')
    conversationManager.appendMessage(dialogue.agentId, {
      role: 'user',
      content: text,
      timestamp: Date.now()
    })
    window.api.sendMessage(dialogue.agentId, text, locale)
  }, [dialogue, input, hasApiKey, locale, onRequestApiKey])

  if (!dialogue) return null

  const isStreaming = conversation?.streamingState === 'streaming'
  const messages = conversation?.messages ?? []

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: '35%',
        background: 'rgba(10, 10, 30, 0.93)',
        border: '3px solid rgba(200, 180, 140, 0.6)',
        borderBottom: 'none',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'monospace',
        color: '#ffffff',
        pointerEvents: 'auto'
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '8px 16px',
          borderBottom: '1px solid rgba(200, 180, 140, 0.3)',
          fontWeight: 'bold',
          fontSize: 16,
          color: '#c4a46c',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0
        }}
      >
        <span>{dialogue.npcName}</span>
        <span onClick={close} style={{ cursor: 'pointer', opacity: 0.6, fontSize: 12 }}>
          {t('interaction.close')}
        </span>
      </div>

      {/* Message list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px' }}>
        {messages.length === 0 && !isStreaming && (
          <div style={{ opacity: 0.4, fontSize: 14 }}>{t('dialogue.placeholder')}</div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              marginBottom: 8,
              textAlign: msg.role === 'user' ? 'right' : 'left'
            }}
          >
            <div
              style={{
                display: 'inline-block',
                maxWidth: '80%',
                padding: '6px 10px',
                borderRadius: 4,
                fontSize: 14,
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                background:
                  msg.role === 'user' ? 'rgba(100, 140, 200, 0.25)' : 'rgba(200, 180, 140, 0.15)',
                border:
                  msg.role === 'user'
                    ? '1px solid rgba(100, 140, 200, 0.3)'
                    : '1px solid rgba(200, 180, 140, 0.2)'
              }}
            >
              {msg.content}
              {/* Blinking cursor for streaming */}
              {msg.role === 'assistant' && i === messages.length - 1 && isStreaming && (
                <span style={{ animation: 'blink 1s step-end infinite' }}>▌</span>
              )}
            </div>
          </div>
        ))}
        {/* Error state */}
        {conversation?.streamingState === 'error' && (
          <div style={{ padding: '6px 10px', color: '#ff6b6b', fontSize: 13 }}>
            {t('dialogue.connectionError')}{' '}
            <span
              onClick={() => {
                // Retry: re-send the last user message
                const lastUserMsg = [...(conversation?.messages ?? [])]
                  .reverse()
                  .find((m) => m.role === 'user')
                if (lastUserMsg && dialogue) {
                  conversationManager.prepareRetry(dialogue.agentId)
                  window.api.sendMessage(dialogue.agentId, lastUserMsg.content, locale)
                }
              }}
              style={{ color: '#c4a46c', cursor: 'pointer', textDecoration: 'underline' }}
            >
              {t('dialogue.retry')}
            </span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      {!hasApiKey ? (
        <div
          style={{
            padding: '8px 16px',
            borderTop: '1px solid rgba(200, 180, 140, 0.3)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexShrink: 0
          }}
        >
          <span style={{ fontSize: 13, opacity: 0.7 }}>{t('dialogue.noApiKey')}</span>
          <button
            onClick={onRequestApiKey}
            style={{
              padding: '4px 12px',
              fontFamily: 'monospace',
              fontSize: 12,
              background: 'rgba(200,180,140,0.3)',
              border: '1px solid rgba(200,180,140,0.6)',
              color: '#c4a46c',
              cursor: 'pointer'
            }}
          >
            {t('dialogue.setApiKey')}
          </button>
        </div>
      ) : (
        <div
          style={{
            padding: '8px 16px',
            borderTop: '1px solid rgba(200, 180, 140, 0.3)',
            display: 'flex',
            gap: 8,
            flexShrink: 0
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send()}
            placeholder={t('dialogue.inputPlaceholder')}
            disabled={isStreaming}
            style={{
              flex: 1,
              padding: '6px 8px',
              fontFamily: 'monospace',
              fontSize: 14,
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(200,180,140,0.3)',
              color: '#fff',
              outline: 'none'
            }}
          />
          <button
            onClick={send}
            disabled={isStreaming || !input.trim()}
            style={{
              padding: '6px 16px',
              fontFamily: 'monospace',
              fontSize: 14,
              background: isStreaming ? 'rgba(100,100,100,0.3)' : 'rgba(200,180,140,0.3)',
              border: '1px solid rgba(200,180,140,0.6)',
              color: '#c4a46c',
              cursor: isStreaming ? 'wait' : 'pointer'
            }}
          >
            {t('dialogue.send')}
          </button>
        </div>
      )}

      {/* Blink animation */}
      <style>{`@keyframes blink { 50% { opacity: 0; } }`}</style>
    </div>
  )
}
