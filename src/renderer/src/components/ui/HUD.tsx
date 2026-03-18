import { useState, useEffect, useCallback } from 'react'
import { EventBus } from '../../game/EventBus'
import { useTranslation } from '../../i18n'
import { useProgression } from '../../hooks/useProgression'

/** XP required for overall level N = 100 * N^2 */
function xpForOverallLevel(level: number): number {
  return 100 * level * level
}

export function HUD() {
  const { t, locale } = useTranslation()
  const { playerState } = useProgression()
  const [locationName, setLocationName] = useState<string>('')
  const [glowing, setGlowing] = useState(false)

  useEffect(() => {
    const handler = (data: { zoneId: string; zoneName: string }) => {
      const localized = t('locations.' + data.zoneId)
      setLocationName(localized !== 'locations.' + data.zoneId ? localized : data.zoneName)
    }
    EventBus.on('zone:entered', handler)
    return () => {
      EventBus.off('zone:entered', handler)
    }
  }, [t])

  // XP glow effect
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const cleanup = window.api.onXPAwarded(() => {
      setGlowing(true)
      timer = setTimeout(() => setGlowing(false), 1500)
    })
    return () => {
      cleanup()
      clearTimeout(timer)
    }
  }, [])

  const handleClick = useCallback(() => {
    EventBus.emit('skills-panel:toggle', {})
  }, [])

  if (!locationName && !playerState) return null

  const overallLevel = playerState?.overallLevel ?? 0
  const totalXP = playerState?.totalXP ?? 0
  const nextLevelXP = xpForOverallLevel(overallLevel + 1)
  const currentLevelXP = xpForOverallLevel(overallLevel)
  const progressXP = totalXP - currentLevelXP
  const rangeXP = nextLevelXP - currentLevelXP
  const progressPercent = rangeXP > 0 ? Math.min((progressXP / rangeXP) * 100, 100) : 0

  const title = playerState?.title[locale] ?? playerState?.title['zh-TW'] ?? ''

  return (
    <div
      onClick={handleClick}
      style={{
        position: 'absolute',
        top: 12,
        left: 12,
        right: 12,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        background: 'rgba(0, 0, 0, 0.7)',
        color: '#c4a46c',
        padding: '6px 14px',
        borderRadius: 4,
        border: glowing
          ? '1px solid rgba(100, 160, 255, 0.8)'
          : '1px solid rgba(200, 180, 140, 0.4)',
        fontFamily: 'monospace',
        fontSize: 13,
        pointerEvents: 'auto',
        cursor: 'pointer',
        transition: 'border-color 0.3s ease',
        boxShadow: glowing ? '0 0 8px rgba(100, 160, 255, 0.4)' : 'none'
      }}
    >
      {/* Location */}
      {locationName && <span>{locationName}</span>}

      {locationName && playerState && <span style={{ color: 'rgba(200, 180, 140, 0.4)' }}>|</span>}

      {/* Name + Title */}
      {playerState && (
        <span>
          {playerState.name}
          {title && <span style={{ color: '#a89060' }}> · {title}</span>}
        </span>
      )}

      {/* Spacer */}
      <span style={{ flex: 1 }} />

      {/* Level + XP bar */}
      {playerState && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>{t('hud.level', { level: String(overallLevel) })}</span>
          <span
            style={{
              display: 'inline-block',
              width: 80,
              height: 8,
              background: 'rgba(200, 180, 140, 0.2)',
              borderRadius: 4,
              overflow: 'hidden'
            }}
          >
            <span
              style={{
                display: 'block',
                height: '100%',
                width: `${progressPercent}%`,
                background: '#c4a46c',
                borderRadius: 4,
                transition: 'width 0.5s ease'
              }}
            />
          </span>
          <span style={{ fontSize: 11, color: '#a89060' }}>
            {totalXP}/{nextLevelXP}
          </span>
        </span>
      )}
    </div>
  )
}
