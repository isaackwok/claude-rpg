import { useState } from 'react'
import { useTranslation } from '../../i18n'
import { EventBus } from '../../game/EventBus'

export function BackpackButton() {
  const { t } = useTranslation()
  const [hovered, setHovered] = useState(false)

  return (
    <button
      onClick={() => EventBus.emit('backpack:toggle', {})}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label={`${t('backpack.title')} (B)`}
      style={{
        position: 'absolute',
        bottom: 20,
        left: 20,
        width: 48,
        height: 48,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: hovered ? 'rgba(0, 0, 0, 0.85)' : 'rgba(0, 0, 0, 0.7)',
        border: hovered
          ? '1px solid rgba(200, 180, 140, 0.7)'
          : '1px solid rgba(200, 180, 140, 0.4)',
        borderRadius: 8,
        fontSize: 28,
        cursor: 'pointer',
        pointerEvents: 'auto',
        transition: 'border-color 0.2s ease, background 0.2s ease',
        padding: 0
      }}
    >
      🎒
      {hovered && (
        <span
          style={{
            position: 'absolute',
            bottom: 54,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(0, 0, 0, 0.9)',
            border: '1px solid rgba(200, 180, 140, 0.4)',
            borderRadius: 4,
            padding: '3px 8px',
            fontSize: 12,
            fontFamily: 'monospace',
            color: '#c4a46c',
            whiteSpace: 'nowrap'
          }}
        >
          {t('backpack.title')}(B)
        </span>
      )}
    </button>
  )
}
