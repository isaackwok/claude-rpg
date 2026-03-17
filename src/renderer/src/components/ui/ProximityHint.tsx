import { useState, useEffect } from 'react'
import { EventBus } from '../../game/EventBus'
import { useTranslation } from '../../i18n'
import { BUILT_IN_NPCS } from '../../game/data/npcs'

export function ProximityHint() {
  const { t, locale } = useTranslation()
  const [nearAgentId, setNearAgentId] = useState<string | null>(null)

  useEffect(() => {
    const handler = (data: { agentId: string; inRange: boolean }) => {
      if (data.inRange) {
        setNearAgentId(data.agentId)
      } else {
        setNearAgentId((prev) => (prev === data.agentId ? null : prev))
      }
    }
    EventBus.on('npc:proximity', handler)
    return () => {
      EventBus.off('npc:proximity', handler)
    }
  }, [])

  if (!nearAgentId) return null

  // Notice board uses a special id
  if (nearAgentId === '__noticeBoard__') {
    return <div style={hintStyle}>{t('interaction.hint')}</div>
  }

  const npc = BUILT_IN_NPCS.find((n) => n.id === nearAgentId)
  const npcName = npc?.name[locale] ?? npc?.name['zh-TW'] ?? nearAgentId

  // Split the template around {{npcName}} to render the name with highlight styling
  const template = t('interaction.hintWithName', { npcName: '\0' })
  const [before, after] = template.split('\0')

  return (
    <div style={hintStyle}>
      {before}
      <span style={{ color: '#c4a46c', fontWeight: 'bold' }}>{npcName}</span>
      {after}
    </div>
  )
}

const hintStyle: React.CSSProperties = {
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
  pointerEvents: 'none',
  whiteSpace: 'nowrap'
}
