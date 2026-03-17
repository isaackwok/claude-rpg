import { useState, useEffect, useCallback } from 'react'
import { EventBus } from '../../game/EventBus'
import { useTranslation } from '../../i18n'
import { BUILT_IN_NPCS } from '../../game/data/npcs'

interface DialogueState {
  agentId: string
  npcName: string
}

export function DialoguePanel() {
  const { t, locale } = useTranslation()
  const [dialogue, setDialogue] = useState<DialogueState | null>(null)

  const close = useCallback(() => {
    if (dialogue) {
      EventBus.emit('dialogue:closed', { agentId: dialogue.agentId })
      setDialogue(null)
    }
  }, [dialogue])

  useEffect(() => {
    const handler = (data: { agentId: string }) => {
      const npc = BUILT_IN_NPCS.find((n) => n.id === data.agentId)
      const npcName = npc?.name[locale] ?? npc?.name['zh-TW'] ?? data.agentId
      setDialogue({ agentId: data.agentId, npcName })
    }
    EventBus.on('npc:interact', handler)
    return () => {
      EventBus.off('npc:interact', handler)
    }
  }, [locale])

  useEffect(() => {
    if (!dialogue) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [dialogue, close])

  if (!dialogue) return null

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: '25%',
        background: 'rgba(10, 10, 30, 0.9)',
        border: '3px solid rgba(200, 180, 140, 0.6)',
        borderBottom: 'none',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'monospace',
        color: '#ffffff',
        pointerEvents: 'auto'
      }}
    >
      {/* NPC name header */}
      <div
        style={{
          padding: '8px 16px',
          borderBottom: '1px solid rgba(200, 180, 140, 0.3)',
          fontWeight: 'bold',
          fontSize: 16,
          color: '#c4a46c'
        }}
      >
        {dialogue.npcName}
        <span
          onClick={close}
          style={{
            float: 'right',
            cursor: 'pointer',
            opacity: 0.6,
            fontSize: 12
          }}
        >
          {t('interaction.close')}
        </span>
      </div>

      {/* Dialogue content */}
      <div
        style={{
          flex: 1,
          padding: '12px 16px',
          fontSize: 14,
          lineHeight: 1.6
        }}
      >
        {t('dialogue.placeholder')}
      </div>
    </div>
  )
}
