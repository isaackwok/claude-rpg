import {
  Fragment,
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  useSyncExternalStore,
  type CSSProperties
} from 'react'
import { EventBus } from '../../game/EventBus'
import { useTranslation } from '../../i18n'
import { BUILT_IN_NPCS } from '../../game/data/npcs'
import { conversationManager } from '../../services/ConversationManager'
import type { Conversation, Message } from '../../services/ConversationManager'
import type { AgentId } from '../../game/types'
import { renderMarkdown } from '../../utils/renderMarkdown'
import { ToolConfirmDialog } from './ToolConfirmDialog'
import { CloseButton } from './CloseButton'

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
    @keyframes approvalSlideIn {
      from { opacity: 0; transform: translateY(6px); max-height: 0; }
      to   { opacity: 1; transform: translateY(0); max-height: 300px; }
    }
    @keyframes attachMenuIn {
      from { opacity: 0; transform: translateY(4px) scale(0.95); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes attachMenuOut {
      from { opacity: 1; transform: translateY(0) scale(1); }
      to   { opacity: 0; transform: translateY(4px) scale(0.95); }
    }
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
          textAlign: 'left',
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

/** "+" attach button with popup menu */
function InputArea({
  input,
  setInput,
  inputRef,
  isBusy,
  send,
  t
}: {
  input: string
  setInput: (v: string | ((prev: string) => string)) => void
  inputRef: React.RefObject<HTMLTextAreaElement | null>
  isBusy: boolean
  send: () => void
  t: (key: string, params?: Record<string, string>) => string
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const triggerClose = useCallback(() => {
    setClosing(true)
    setTimeout(() => {
      setMenuOpen(false)
      setClosing(false)
    }, 120)
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        triggerClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen, triggerClose])

  const handlePickFiles = useCallback(async () => {
    triggerClose()
    const paths = await window.api.pickFiles()
    if (paths.length === 0) return
    const formatted = paths.map((p) => `\`${p}\``).join(' ')
    setInput((prev) => {
      const separator = prev.length > 0 && !prev.endsWith(' ') ? ' ' : ''
      return prev + separator + formatted
    })
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [triggerClose, setInput, inputRef])

  const inputHeight = 30
  const maxTextareaHeight = 120

  const plusBtnStyle: CSSProperties = {
    width: inputHeight,
    height: inputHeight,
    boxSizing: 'border-box',
    padding: 0,
    fontFamily: 'monospace',
    fontSize: 18,
    lineHeight: `${inputHeight - 2}px`,
    textAlign: 'center',
    background: menuOpen ? 'rgba(200,180,140,0.35)' : 'rgba(200,180,140,0.15)',
    border: '1px solid rgba(200,180,140,0.4)',
    color: '#c4a46c',
    cursor: isBusy ? 'not-allowed' : 'pointer',
    borderRadius: 3,
    flexShrink: 0,
    transition: 'background 0.15s'
  }

  return (
    <div
      style={{
        padding: '8px 16px',
        borderTop: '1px solid rgba(200, 180, 140, 0.3)',
        display: 'flex',
        gap: 8,
        flexShrink: 0,
        alignItems: 'flex-end'
      }}
    >
      <textarea
        ref={inputRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            send()
            // Reset height after sending
            if (inputRef.current) inputRef.current.style.height = `${inputHeight}px`
          }
        }}
        onInput={(e) => {
          const el = e.currentTarget
          el.style.height = 'auto'
          el.style.height = Math.min(el.scrollHeight, maxTextareaHeight) + 'px'
        }}
        placeholder={t('dialogue.inputPlaceholder')}
        disabled={isBusy}
        rows={1}
        style={{
          flex: 1,
          minHeight: inputHeight,
          maxHeight: maxTextareaHeight,
          boxSizing: 'border-box',
          padding: '4px 8px',
          fontFamily: 'monospace',
          fontSize: 14,
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(200,180,140,0.3)',
          color: '#fff',
          outline: 'none',
          resize: 'none',
          overflow: 'auto',
          lineHeight: '22px'
        }}
      />
      {/* Attach menu */}
      <div ref={containerRef} style={{ position: 'relative', flexShrink: 0 }}>
        {menuOpen && (
          <div
            style={{
              position: 'absolute',
              bottom: 34,
              right: 0,
              minWidth: 160,
              background: 'rgba(20, 20, 40, 0.96)',
              border: '1px solid rgba(200, 180, 140, 0.4)',
              borderRadius: 4,
              padding: '4px 0',
              animation: closing
                ? 'attachMenuOut 0.12s ease-in forwards'
                : 'attachMenuIn 0.15s ease-out',
              zIndex: 10
            }}
          >
            <button
              onMouseDown={handlePickFiles}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                padding: '7px 12px',
                background: 'none',
                border: 'none',
                color: '#ddd',
                fontFamily: 'monospace',
                fontSize: 13,
                cursor: 'pointer',
                textAlign: 'left'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(200, 180, 140, 0.15)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'none'
              }}
            >
              <span style={{ fontSize: 14 }}>+</span>
              {t('dialogue.attachFiles')}
            </button>
          </div>
        )}
        <button
          onClick={() => {
            if (menuOpen) triggerClose()
            else setMenuOpen(true)
          }}
          disabled={isBusy}
          style={plusBtnStyle}
          title={t('dialogue.attachFiles')}
        >
          +
        </button>
      </div>
      <button
        onClick={send}
        disabled={isBusy || !input.trim()}
        style={{
          height: inputHeight,
          boxSizing: 'border-box',
          padding: '0 16px',
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
  )
}

function ApprovalBtn({
  onClick,
  primary,
  children
}: {
  onClick: () => void
  primary?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '4px 10px',
        fontFamily: 'monospace',
        fontSize: 13,
        background: primary ? 'rgba(200,180,140,0.25)' : 'rgba(100,100,100,0.25)',
        border: `1px solid ${primary ? 'rgba(200,180,140,0.5)' : 'rgba(150,150,150,0.3)'}`,
        color: primary ? '#c4a46c' : 'rgba(255,255,255,0.65)',
        cursor: 'pointer',
        borderRadius: 3,
        whiteSpace: 'nowrap'
      }}
    >
      {children}
    </button>
  )
}

export function DialoguePanel({ onRequestApiKey, apiKeyVersion }: DialoguePanelProps) {
  const { t, locale } = useTranslation()
  const [dialogue, setDialogue] = useState<DialogueState | null>(null)
  const [input, setInput] = useState('')
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [unreadDividerIndex, setUnreadDividerIndex] = useState<number | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const unreadMarkerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const openedAtRef = useRef(0)
  const userScrolledRef = useRef(false)

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
      openedAtRef.current = Date.now()
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

  // Detect user manually scrolling away from bottom → pause auto-scroll
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    userScrolledRef.current = distanceFromBottom > 30
  }, [])

  // Scroll logic — suppress smooth-scroll for 300ms after opening to avoid visible animation
  useEffect(() => {
    if (!conversation) return

    const justOpened = Date.now() - openedAtRef.current < 300
    const el = scrollContainerRef.current

    if (justOpened) {
      userScrolledRef.current = false
      if (unreadMarkerRef.current && el) {
        el.scrollTop = unreadMarkerRef.current.offsetTop - el.offsetTop
      } else if (el) {
        el.scrollTop = el.scrollHeight
      }
      if (dialogue) conversationManager.clearUnreadMarker(dialogue.agentId)
    } else if (!userScrolledRef.current && el) {
      el.scrollTop = el.scrollHeight
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
    userScrolledRef.current = false
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
  const isToolConfirm = conversation?.status.state === 'tool-confirm'
  const isToolExecuting = conversation?.status.state === 'tool-executing'
  const isPathApproval = conversation?.status.state === 'path-approval'
  const isBusy = isWaiting || isStreaming || isToolConfirm || isToolExecuting || isPathApproval
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
          <CloseButton onClick={close} />
        </div>
      </div>

      {/* Message list */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
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
        {/* Tool confirmation dialog */}
        {isToolConfirm && conversation?.status.state === 'tool-confirm' && (
          <ToolConfirmDialog
            agentId={dialogue.agentId}
            toolCallId={conversation.status.toolCallId}
            toolName={conversation.status.toolName}
            args={conversation.status.args}
            folderApproved={conversation.status.folderApproved}
          />
        )}
        {/* Tool executing indicator */}
        {isToolExecuting && conversation?.status.state === 'tool-executing' && (
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
                ⚙{' '}
                {t('tool.executing', { toolName: t(`tool.name.${conversation.status.toolName}`) })}
              </span>
            </div>
          </div>
        )}
        {/* Path approval — shown under NPC response when paths need user authorization */}
        {isPathApproval && conversation?.status.state === 'path-approval' && (
          <div
            style={{
              margin: '8px 0',
              padding: '10px 12px',
              background: 'rgba(200, 180, 140, 0.1)',
              border: '1px solid rgba(200, 180, 140, 0.25)',
              borderRadius: 4,
              animation: 'approvalSlideIn 0.25s ease-out',
              overflow: 'hidden'
            }}
          >
            {conversation.status.paths.map((path) => (
              <div
                key={path}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  marginBottom: 6
                }}
              >
                <code
                  style={{
                    flex: 1,
                    color: 'rgba(255,255,255,0.7)',
                    background: 'rgba(255,255,255,0.06)',
                    padding: '4px 8px',
                    borderRadius: 3,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontSize: 13
                  }}
                >
                  {path}
                </code>
                <ApprovalBtn
                  primary
                  onClick={() => window.api.approvePath(dialogue.agentId, path, path)}
                >
                  {t('tool.postScroll')}
                </ApprovalBtn>
                <ApprovalBtn onClick={() => window.api.approvePath(dialogue.agentId, path)}>
                  {t('tool.allowOnce')}
                </ApprovalBtn>
                <ApprovalBtn onClick={() => window.api.denyPath(dialogue.agentId, path)}>
                  {t('tool.deny')}
                </ApprovalBtn>
              </div>
            ))}
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
        <InputArea
          input={input}
          setInput={setInput}
          inputRef={inputRef}
          isBusy={isBusy}
          send={send}
          t={t}
        />
      )}

      {dialogueStyles}
    </div>
  )
}
