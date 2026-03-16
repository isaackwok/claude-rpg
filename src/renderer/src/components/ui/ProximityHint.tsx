import { useState, useEffect } from 'react'
import { EventBus } from '../../game/EventBus'
import { useTranslation } from '../../i18n'

export function ProximityHint() {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const handler = (data: { agentId: string; inRange: boolean }) => {
      setVisible(data.inRange)
    }
    EventBus.on('npc:proximity', handler)
    return () => {
      EventBus.off('npc:proximity', handler)
    }
  }, [])

  if (!visible) return null

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 32,
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(0, 0, 0, 0.75)',
        color: '#ffffff',
        padding: '8px 20px',
        borderRadius: 4,
        border: '2px solid rgba(255, 255, 255, 0.3)',
        fontFamily: 'monospace',
        fontSize: 14,
        pointerEvents: 'auto',
        whiteSpace: 'nowrap',
      }}
    >
      {t('interaction.hint')}
    </div>
  )
}
