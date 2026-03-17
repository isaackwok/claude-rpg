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
  apiKeyVersion: number
}

export function DialoguePanel({ onRequestApiKey, apiKeyVersion }: DialoguePanelProps) {
  const { t, locale } = useTranslation()
  const [dialogue, setDialogue] = useState<DialogueState | null>(null)
  const [input, setInput] = useState('')
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null)
  const [expanded, setExpanded] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Subscribe to ConversationManager changes — version counter ensures React detects mutations
  useSyncExternalStore(
    (cb) => conversationManager.subscribe(cb),
    () => conversationManager.getVersion()
  )
  const conversation: Conversation | null = dialogue
    ? conversationManager.getConversation(dialogue.agentId)
    : null

  // Check API key on mount and when it changes (e.g. after saving in ApiKeyModal)
  useEffect(() => {
    window.api.checkApiKey().then(setHasApiKey)
  }, [apiKeyVersion])

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
      // Auto-focus input after a tick (wait for render)
      setTimeout(() => inputRef.current?.focus(), 50)
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
      setExpanded(false)
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
    conversationManager.markWaiting(dialogue.agentId)
    window.api.sendMessage(dialogue.agentId, text, locale)
  }, [dialogue, input, hasApiKey, locale, onRequestApiKey])

  if (!dialogue) return null

  const isWaiting = conversation?.streamingState === 'waiting'
  const isStreaming = conversation?.streamingState === 'streaming'
  const isBusy = isWaiting || isStreaming
  const messages = conversation?.messages ?? []

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: expanded ? '100%' : '35%',
        background: 'rgba(10, 10, 30, 0.93)',
        border: '3px solid rgba(200, 180, 140, 0.6)',
        borderBottom: 'none',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'monospace',
        color: '#ffffff',
        pointerEvents: 'auto',
        transition: 'height 0.3s ease-in-out'
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <svg
            onClick={() => setExpanded((v) => !v)}
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              cursor: 'pointer',
              opacity: 0.6,
              transition: 'transform 0.3s ease',
              transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)'
            }}
          >
            <polyline points="18 15 12 9 6 15" />
          </svg>
          <span onClick={close} style={{ cursor: 'pointer', opacity: 0.6, fontSize: 12 }}>
            {t('interaction.close')}
          </span>
        </div>
      </div>

      {/* Message list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px' }}>
        {messages.length === 0 && !isStreaming && (
          <div style={{ opacity: 0.5, fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
            {t(`npcIntro.${dialogue.agentId}`)}
          </div>
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
        {/* Thinking indicator — shows after send, before first chunk */}
        {isWaiting && (
          <div style={{ marginBottom: 8 }}>
            <div
              style={{
                display: 'inline-block',
                padding: '6px 10px',
                borderRadius: 4,
                fontSize: 14,
                background: 'rgba(200, 180, 140, 0.15)',
                border: '1px solid rgba(200, 180, 140, 0.2)',
                color: 'rgba(200, 180, 140, 0.7)'
              }}
            >
              <span style={{ animation: 'pulse 1.5s ease-in-out infinite' }}>
                {t('dialogue.thinking')}
              </span>
            </div>
          </div>
        )}
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
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send()}
            placeholder={t('dialogue.inputPlaceholder')}
            disabled={isBusy}
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
            disabled={isBusy || !input.trim()}
            style={{
              padding: '6px 16px',
              fontFamily: 'monospace',
              fontSize: 14,
              background: isBusy ? 'rgba(100,100,100,0.3)' : 'rgba(200,180,140,0.3)',
              border: '1px solid rgba(200,180,140,0.6)',
              color: '#c4a46c',
              cursor: isBusy ? 'wait' : 'pointer'
            }}
          >
            {t('dialogue.send')}
          </button>
        </div>
      )}

      {/* Animations */}
      <style>{`
        @keyframes blink { 50% { opacity: 0; } }
        @keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
      `}</style>
    </div>
  )
}
