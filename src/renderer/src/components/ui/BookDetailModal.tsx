import { useState, useRef, useMemo } from 'react'
import { useTranslation } from '../../i18n'
import { BUILT_IN_NPCS } from '../../game/data/npcs'
import { renderMarkdown } from '../../utils/renderMarkdown'
import { CloseButton } from './CloseButton'
import { categoryLabel } from './ItemsTab'
import type { BookItem } from '../../../../shared/item-types'

const CATEGORY_COLORS: Record<string, string> = {
  writing: '#e8b44c',
  research: '#5bb5e8',
  code: '#a78bfa',
  data: '#4ade80',
  communication: '#f472b6',
  organization: '#fb923c',
  visual: '#c084fc',
  general: '#888'
}

interface BookDetailModalProps {
  item: BookItem
  locale: string
  onClose: () => void
  onUpdateName: (itemId: string, name: string) => Promise<void>
  onDelete: (itemId: string) => Promise<void>
}

export function BookDetailModal({
  item,
  locale,
  onClose,
  onUpdateName,
  onDelete
}: BookDetailModalProps): React.JSX.Element {
  const { t } = useTranslation()

  // Same markdown styles used in DialoguePanel — duplicated here so they
  // render correctly when the dialogue panel is closed
  const mdStyles = (
    <style>{`
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
      .md-content pre code { background: none; padding: 0; }
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
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(item.name)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const npcName =
    BUILT_IN_NPCS.find((n) => n.id === item.sourceAgentId)?.name[locale] ??
    BUILT_IN_NPCS.find((n) => n.id === item.sourceAgentId)?.name['zh-TW'] ??
    item.sourceAgentId

  // renderMarkdown uses marked with sanitize option — safe for NPC-generated content
  // (content originates from Claude API responses, not arbitrary user input)
  const html = useMemo(() => renderMarkdown(item.markdownContent), [item.markdownContent])

  const date = new Date(item.createdAt)
  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`

  const handleSaveName = (): void => {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== item.name) {
      onUpdateName(item.id, trimmed)
    } else {
      setEditValue(item.name)
    }
    setEditing(false)
  }

  const handleBackdropClick = (e: React.MouseEvent): void => {
    if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
      onClose()
    }
  }

  return (
    <>
      {mdStyles}
      <div
        onClick={handleBackdropClick}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'rgba(0, 0, 0, 0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 200
        }}
      >
        <div
          ref={panelRef}
          style={{
            background: 'rgba(10, 10, 30, 0.98)',
            border: '3px solid rgba(200, 180, 140, 0.6)',
            borderRadius: 8,
            width: 560,
            maxHeight: '80vh',
            display: 'flex',
            flexDirection: 'column',
            fontFamily: 'monospace',
            color: '#c4a46c'
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '16px 20px 12px',
              borderBottom: '1px solid rgba(200, 180, 140, 0.2)',
              flexShrink: 0
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              {editing ? (
                <input
                  ref={inputRef}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={handleSaveName}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveName()
                    if (e.key === 'Escape') {
                      setEditValue(item.name)
                      setEditing(false)
                    }
                  }}
                  autoFocus
                  style={{
                    flex: 1,
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(200, 180, 140, 0.4)',
                    color: '#e8d5a8',
                    fontFamily: 'monospace',
                    fontSize: 16,
                    fontWeight: 'bold',
                    padding: '2px 6px',
                    outline: 'none',
                    marginRight: 8
                  }}
                />
              ) : (
                <div
                  onClick={() => {
                    setEditing(true)
                    setEditValue(item.name)
                  }}
                  title={t('items.editName')}
                  style={{
                    fontSize: 16,
                    fontWeight: 'bold',
                    color: '#e8d5a8',
                    cursor: 'pointer',
                    flex: 1
                  }}
                >
                  📖 {item.name}
                </div>
              )}
              <CloseButton onClick={onClose} size={11} />
            </div>

            {/* Metadata row */}
            <div
              style={{
                display: 'flex',
                gap: 12,
                marginTop: 8,
                fontSize: 11,
                color: '#a89060',
                alignItems: 'center'
              }}
            >
              <span>
                {t('items.source')}: {npcName}
              </span>
              <span
                style={{
                  padding: '1px 6px',
                  borderRadius: 8,
                  background: `${CATEGORY_COLORS[item.category] ?? '#888'}22`,
                  color: CATEGORY_COLORS[item.category] ?? '#888'
                }}
              >
                {categoryLabel(item.category, t)}
              </span>
              <span>{dateStr}</span>
            </div>

            {/* Original question */}
            {item.sourceQuestion && (
              <div
                style={{
                  marginTop: 8,
                  padding: '6px 8px',
                  background: 'rgba(200, 180, 140, 0.05)',
                  border: '1px solid rgba(200, 180, 140, 0.1)',
                  borderRadius: 4,
                  fontSize: 11,
                  color: 'rgba(200, 180, 140, 0.6)'
                }}
              >
                {t('items.question')}: {item.sourceQuestion}
              </div>
            )}
          </div>

          {/* Content — rendered from NPC (Claude API) responses, not arbitrary user input */}
          <div
            className="md-content"
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '16px 20px',
              fontSize: 14,
              lineHeight: 1.6,
              color: '#ddd'
            }}
            dangerouslySetInnerHTML={{ __html: html }}
          />

          {/* Footer */}
          <div
            style={{
              padding: '12px 20px',
              borderTop: '1px solid rgba(200, 180, 140, 0.2)',
              display: 'flex',
              justifyContent: 'space-between',
              flexShrink: 0
            }}
          >
            {confirmDelete ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: '#a89060' }}>
                  {t('items.deleteConfirm', { name: item.name })}
                </span>
                <button
                  onClick={() => onDelete(item.id)}
                  style={{
                    background: 'rgba(255, 80, 80, 0.2)',
                    border: '1px solid rgba(255, 80, 80, 0.4)',
                    borderRadius: 4,
                    padding: '3px 10px',
                    color: '#ff6b6b',
                    fontFamily: 'monospace',
                    fontSize: 11,
                    cursor: 'pointer'
                  }}
                >
                  {t('items.deleteYes')}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  style={{
                    background: 'none',
                    border: '1px solid rgba(200, 180, 140, 0.3)',
                    borderRadius: 4,
                    padding: '3px 10px',
                    color: '#a89060',
                    fontFamily: 'monospace',
                    fontSize: 11,
                    cursor: 'pointer'
                  }}
                >
                  {t('items.deleteNo')}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                style={{
                  background: 'none',
                  border: '1px solid rgba(200, 180, 140, 0.2)',
                  borderRadius: 4,
                  padding: '4px 12px',
                  color: '#a89060',
                  fontFamily: 'monospace',
                  fontSize: 12,
                  cursor: 'pointer'
                }}
              >
                {t('items.delete')}
              </button>
            )}
            <button
              onClick={onClose}
              style={{
                background: 'rgba(200, 180, 140, 0.15)',
                border: '1px solid rgba(200, 180, 140, 0.3)',
                borderRadius: 4,
                padding: '4px 16px',
                color: '#c4a46c',
                fontFamily: 'monospace',
                fontSize: 12,
                cursor: 'pointer'
              }}
            >
              {t('items.close')}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
