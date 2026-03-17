import { useState, useEffect } from 'react'
import { EventBus } from '../../game/EventBus'
import { useTranslation } from '../../i18n'

export function HUD() {
  const { t } = useTranslation()
  const [locationName, setLocationName] = useState<string>('')

  useEffect(() => {
    const handler = (data: { zoneId: string; zoneName: string }) => {
      // Try localized name first, fall back to zoneName from tilemap
      const localized = t('locations.' + data.zoneId)
      setLocationName(localized !== 'locations.' + data.zoneId ? localized : data.zoneName)
    }
    EventBus.on('zone:entered', handler)
    return () => {
      EventBus.off('zone:entered', handler)
    }
  }, [t])

  if (!locationName) return null

  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        left: 12,
        background: 'rgba(0, 0, 0, 0.7)',
        color: '#c4a46c',
        padding: '6px 14px',
        borderRadius: 4,
        border: '1px solid rgba(200, 180, 140, 0.4)',
        fontFamily: 'monospace',
        fontSize: 13,
        pointerEvents: 'none'
      }}
    >
      {locationName}
    </div>
  )
}
