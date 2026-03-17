import {
  Fragment,
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  useSyncExternalStore
} from 'react'
import { EventBus } from '../../game/EventBus'
import { useTranslation } from '../../i18n'
import { BUILT_IN_NPCS } from '../../game/data/npcs'
import { conversationManager } from '../../services/ConversationManager'
import type { Conversation, Message } from '../../services/ConversationManager'
import type { AgentId } from '../../game/types'
import { renderMarkdown } from '../../utils/renderMarkdown'

interface DialogueState {
  agentId: AgentId
  npcName: string
}

interface DialoguePanelProps {
  onRequestApiKey: () => void
  apiKeyVersion: number
}

// Hoisted outside component to avoid re-injection on every render
const dialogueStyles = (
  <style>{`
    .dialogue-messages ::selection { background: rgba(196, 164, 108, 0.4); color: #fff; }
    .dialogue-messages ::-moz-selection { background: rgba(196, 164, 108, 0.4); color: #fff; }
    @keyframes blink { 50% { opacity: 0; } }
    @keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
    .md-content { word-wrap: break-word; }
    .md-content p { margin: 0 0 0.5em; }
    .md-content p:last-child { margin-bottom: 0; }
    .md-content ul, .md-content ol { margin: 0.3em 0; padding-left: 1.4em; }
    .md-content ul { list-style: disc; }
    .md-content ol { list-style: decimal; }
    .md-content li { margin: 0.15em 0; }
    .md-content strong { color: #e0c888; }
    .md-content em { color: #c4b8a0; }
    .md-content code {
      background: rgba(255,255,255,0.08);
      padding: 1px 4px;
      border-radius: 3px;
      font-size: 13px;
    }
    .md-content pre {
      background: rgba(0,0,0,0.4);
      padding: 8px;
      border-radius: 4px;
      overflow-x: auto;
      margin: 0.4em 0;
    }
    .md-content pre code {
      background: none;
      padding: 0;
    }
    .md-content h1, .md-content h2, .md-content h3 {
      color: #c4a46c;
      margin: 0.5em 0 0.3em;
      font-size: 14px;
      font-weight: bold;
    }
    .md-content blockquote {
      border-left: 2px solid rgba(200,180,140,0.4);
      margin: 0.4em 0;
      padding: 2px 8px;
      opacity: 0.85;
    }
    .md-content a { color: #7eb8da; text-decoration: underline; }
    .md-content hr { border: none; border-top: 1px solid rgba(200,180,140,0.2); margin: 0.5em 0; }
    .md-content table { border-collapse: collapse; margin: 0.4em 0; }
    .md-content th, .md-content td {
      border: 1px solid rgba(200,180,140,0.3);
      padding: 3px 8px;
      font-size: 13px;
    }
    .md-content th { background: rgba(200,180,140,0.1); color: #c4a46c; }
  `}</style>
)

/** Renders a single message bubble with markdown (assistant) or plain text (user) */
function MessageBubble({
  msg,
  isLastAssistant,
  isStreaming,
  t
}: {
  msg: Message
  isLastAssistant: boolean
  isStreaming: boolean
  t: (key: string) => string
}) {
  const [copied, setCopied] = useState(false)
  const isAssistant = msg.role === 'assistant'

  const html = useMemo(() => {
    if (!isAssistant) return ''
    return renderMarkdown(msg.content)
  }, [isAssistant, msg.content])

  const [copyFailed, setCopyFailed] = useState(false)

  const handleCopy = (): void => {
    navigator.clipboard.writeText(msg.content).then(
      () => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      },
      () => {
        setCopyFailed(true)
        setTimeout(() => setCopyFailed(false), 1500)
      }
    )
  }

  return (
    <div
      style={{
        marginBottom: 8,
        textAlign: isAssistant ? 'left' : 'right'
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
          background: isAssistant ? 'rgba(200, 180, 140, 0.15)' : 'rgba(100, 140, 200, 0.25)',
          border: isAssistant
            ? '1px solid rgba(200, 180, 140, 0.2)'
            : '1px solid rgba(100, 140, 200, 0.3)',
          position: 'relative'
        }}
      >
        {isAssistant ? (
          <div className="md-content" dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
        )}
        {/* Blinking cursor for streaming */}
        {isLastAssistant && isStreaming && (
          <span style={{ animation: 'blink 1s step-end infinite' }}>▌</span>
        )}
      </div>
      {/* Copy button for assistant messages (hide while streaming this message) */}
      {isAssistant && !(isLastAssistant && isStreaming) && msg.content && (
        <div style={{ marginTop: 2 }}>
          <button
            onClick={handleCopy}
            style={{
              background: 'none',
              border: 'none',
              color: copied
                ? 'rgba(140, 200, 140, 0.8)'
                : copyFailed
                  ? 'rgba(255, 107, 107, 0.8)'
                  : 'rgba(200, 180, 140, 0.4)',
              cursor: 'pointer',
              fontFamily: 'monospace',
              fontSize: 11,
              padding: '2px 4px',
              transition: 'color 0.2s'
            }}
          >
            {copied
              ? `✓ ${t('dialogue.copied')}`
              : copyFailed
                ? t('dialogue.copyFailed')
                : t('dialogue.copy')}
          </button>
        </div>
      )}
    </div>
  )
}

export function DialoguePanel({ onRequestApiKey, apiKeyVersion }: DialoguePanelProps) {
  const { t, locale } = useTranslation()
  const [dialogue, setDialogue] = useState<DialogueState | null>(null)
  const [input, setInput] = useState('')
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [unreadDividerIndex, setUnreadDividerIndex] = useState<number | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const unreadMarkerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const justOpenedRef = useRef(false)

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

      // Capture unread state before setActiveDialogue clears hasUnread
      const conv = conversationManager.getConversation(data.agentId)
      justOpenedRef.current = true
      setUnreadDividerIndex(conv?.firstUnreadIndex ?? null)

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

  // Three-scenario scroll logic:
  // 1. Active conversation — smooth scroll to bottom
  // 2. Reopen, no unread — instant scroll to bottom
  // 3. Reopen with unread — scroll first unread message to top edge
  useEffect(() => {
    if (!conversation) return

    if (justOpenedRef.current) {
      justOpenedRef.current = false

      if (unreadMarkerRef.current) {
        // Scenario 3: scroll first unread to top edge
        unreadMarkerRef.current.scrollIntoView({
          behavior: 'instant' as ScrollBehavior,
          block: 'start'
        })
      } else {
        // Scenario 2: instant scroll to bottom
        messagesEndRef.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior })
      }

      if (dialogue) conversationManager.clearUnreadMarker(dialogue.agentId)
    } else {
      // Scenario 1: smooth scroll during active conversation
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [
    dialogue,
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
    setUnreadDividerIndex(null)
    conversationManager.appendMessage(dialogue.agentId, {
      role: 'user',
      content: text,
      timestamp: Date.now()
    })
    conversationManager.markWaiting(dialogue.agentId)
    window.api.sendMessage(dialogue.agentId, text, locale)
  }, [dialogue, input, hasApiKey, locale, onRequestApiKey])

  if (!dialogue) return null

  const isWaiting = conversation?.status.state === 'waiting'
  const isStreaming = conversation?.status.state === 'streaming'
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
      <div
        className="dialogue-messages"
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px 16px',
          cursor: 'text',
          userSelect: 'text'
        }}
      >
        {messages.length === 0 && !isStreaming && (
          <div style={{ opacity: 0.5, fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
            {t(`npcIntro.${dialogue.agentId}`)}
          </div>
        )}
        {messages.map((msg, i) => (
          <Fragment key={`${msg.role}-${msg.timestamp}`}>
            {unreadDividerIndex !== null && i === unreadDividerIndex && (
              <div
                ref={unreadMarkerRef}
                style={{
                  borderTop: '1px solid rgba(200, 180, 140, 0.4)',
                  margin: '8px 0 4px',
                  fontSize: 11,
                  color: 'rgba(200, 180, 140, 0.5)',
                  textAlign: 'center',
                  paddingTop: 4
                }}
              >
                {t('dialogue.newMessages')}
              </div>
            )}
            <MessageBubble
              msg={msg}
              isLastAssistant={msg.role === 'assistant' && i === messages.length - 1}
              isStreaming={isStreaming}
              t={t}
            />
          </Fragment>
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
        {conversation?.status.state === 'error' && (
          <div style={{ padding: '6px 10px', color: '#ff6b6b', fontSize: 13 }}>
            {conversation.status.error === 'no-api-key'
              ? t('dialogue.errorNoApiKey')
              : conversation.status.error.includes('rate limit')
                ? t('dialogue.errorRateLimit')
                : t('dialogue.connectionError')}{' '}
            <span
              onClick={() => {
                // Retry: re-send the last user message
                const lastUserMsg = [...(conversation?.messages ?? [])]
                  .reverse()
                  .find((m) => m.role === 'user')
                if (lastUserMsg && dialogue) {
                  conversationManager.prepareRetry(dialogue.agentId)
                  conversationManager.markWaiting(dialogue.agentId)
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

      {dialogueStyles}
    </div>
  )
}
