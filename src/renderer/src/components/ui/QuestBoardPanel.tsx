import { useState, useEffect, useRef } from 'react'
import { useTranslation } from '../../i18n'
import type { QuestBoardSuggestion } from '../../../../shared/types'
import { CloseButton } from './CloseButton'

interface QuestBoardPanelProps {
  onClose: () => void
}

export function QuestBoardPanel({ onClose }: QuestBoardPanelProps) {
  const { t, locale } = useTranslation()
  const [suggestion, setSuggestion] = useState<QuestBoardSuggestion | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    window.api.getQuestBoardSuggestion().then(setSuggestion).catch(console.error)
  }, [])

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
      onClose()
    }
  }

  const message = suggestion?.message[locale] ?? suggestion?.message['zh-TW'] ?? ''

  return (
    <div
      onClick={handleBackdropClick}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'auto',
        zIndex: 100
      }}
    >
      <div
        ref={panelRef}
        style={{
          background: 'rgba(10, 10, 30, 0.96)',
          border: '3px solid rgba(200, 180, 140, 0.6)',
          borderRadius: 8,
          padding: '24px 32px',
          maxWidth: 420,
          fontFamily: 'monospace',
          color: '#c4a46c'
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 'bold', color: '#e8d5a8', marginBottom: 16 }}>
          📋 {t('questBoard.title')}
        </div>
        {suggestion ? (
          <div style={{ fontSize: 14, lineHeight: 1.6, color: '#c4a46c' }}>{message}</div>
        ) : (
          <div style={{ color: '#a89060', fontSize: 13 }}>...</div>
        )}
        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <CloseButton onClick={onClose} size={11} />
        </div>
      </div>
    </div>
  )
}
