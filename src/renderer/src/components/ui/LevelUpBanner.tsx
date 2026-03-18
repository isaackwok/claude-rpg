import { useEffect, useState } from 'react'
import { useTranslation } from '../../i18n'

interface LevelUpBannerProps {
  level: number
  onDone: () => void
}

export function LevelUpBanner({ level, onDone }: LevelUpBannerProps) {
  const { t } = useTranslation()
  const [opacity, setOpacity] = useState(0)

  useEffect(() => {
    // Fade in
    requestAnimationFrame(() => setOpacity(1))

    // Fade out after 2 seconds
    const fadeTimer = setTimeout(() => setOpacity(0), 2000)
    const doneTimer = setTimeout(onDone, 2500)

    return () => {
      clearTimeout(fadeTimer)
      clearTimeout(doneTimer)
    }
  }, [onDone])

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
        zIndex: 200,
        opacity,
        transition: 'opacity 0.5s ease'
      }}
    >
      <div
        style={{
          fontFamily: 'monospace',
          fontSize: 48,
          fontWeight: 'bold',
          color: '#ffd700',
          textShadow: '0 0 20px rgba(255, 215, 0, 0.6), 0 2px 4px rgba(0, 0, 0, 0.8)'
        }}
      >
        {t('xp.overallLevelUp', { level: String(level) })}
      </div>
    </div>
  )
}
