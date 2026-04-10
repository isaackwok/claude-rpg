import { useMemo, useRef } from 'react'
import { renderMarkdown } from '../../utils/renderMarkdown'
import { CloseButton } from './CloseButton'
import type { BookItem } from '../../../../shared/item-types'

interface BookPreviewModalProps {
  item: BookItem
  onClose: () => void
}

export function BookPreviewModal({ item, onClose }: BookPreviewModalProps): React.JSX.Element {
  const panelRef = useRef<HTMLDivElement>(null)

  // renderMarkdown uses marked with sanitize option — safe for NPC-generated content
  // (content originates from Claude API responses, not arbitrary user input)
  const html = useMemo(() => renderMarkdown(item.markdownContent), [item.markdownContent])

  const handleBackdropClick = (e: React.MouseEvent): void => {
    if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
      onClose()
    }
  }

  return (
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
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0
          }}
        >
          <span style={{ fontSize: 16, fontWeight: 'bold', color: '#e8d5a8' }}>📖 {item.name}</span>
          <CloseButton onClick={onClose} size={11} />
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
      </div>
    </div>
  )
}
