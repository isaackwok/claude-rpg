import { useTranslation } from '../../i18n'
import type { PlayerCosmetic } from '../../../../shared/cosmetic-types'

interface CosmeticItemProps {
  cosmetic: PlayerCosmetic
  onEquip: (id: string) => void
  onUnequip: (id: string) => void
  locale: string
}

export function CosmeticItem({ cosmetic, onEquip, onUnequip }: CosmeticItemProps) {
  const { t, locale } = useTranslation()
  const { definition: def, unlocked, equipped } = cosmetic

  const title = def.title[locale] ?? def.title['zh-TW'] ?? ''
  const description = def.description[locale] ?? def.description['zh-TW'] ?? ''

  // Layer/type tag label
  const typeLabel =
    def.type === 'overlay' && def.layer
      ? t(`cosmetics.slots.${def.layer}`)
      : t('cosmetics.tabs.decorations')

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        padding: 8,
        gap: 8,
        background: unlocked ? 'rgba(200,180,140,0.1)' : 'rgba(200,180,140,0.04)',
        border: `1px solid ${unlocked ? 'rgba(200,180,140,0.3)' : 'rgba(200,180,140,0.12)'}`,
        borderRadius: 6,
        opacity: unlocked ? 1 : 0.45
      }}
    >
      {/* Icon */}
      <span
        style={{
          fontSize: 20,
          filter: unlocked ? undefined : 'grayscale(1)',
          flexShrink: 0
        }}
      >
        {def.icon}
      </span>

      {/* Text block */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span style={{ fontSize: 12, color: '#e8d5a8' }}>{title}</span>
          <span style={{ fontSize: 9, color: '#a89060' }}>· {typeLabel}</span>
        </div>
        <div style={{ fontSize: 9, color: '#a89060', marginTop: 2 }}>
          {unlocked
            ? t('cosmetics.source', { achievement: description })
            : t('cosmetics.locked', { achievement: description })}
        </div>
      </div>

      {/* Action button / lock indicator */}
      {!unlocked ? (
        <span style={{ fontSize: 14, flexShrink: 0 }}>🔒</span>
      ) : equipped ? (
        <button
          onClick={() => onUnequip(def.id)}
          style={{
            background: 'rgba(200,180,140,0.2)',
            border: '1px solid rgba(200,180,140,0.4)',
            borderRadius: 4,
            padding: '3px 8px',
            fontSize: 11,
            color: '#ffd700',
            cursor: 'pointer',
            fontFamily: 'monospace',
            flexShrink: 0
          }}
        >
          {t('cosmetics.equipped')}
        </button>
      ) : (
        <button
          onClick={() => onEquip(def.id)}
          style={{
            background: 'rgba(200,180,140,0.08)',
            border: '1px solid rgba(200,180,140,0.2)',
            borderRadius: 4,
            padding: '3px 8px',
            fontSize: 11,
            color: '#a89060',
            cursor: 'pointer',
            fontFamily: 'monospace',
            flexShrink: 0
          }}
        >
          {t('cosmetics.equip')}
        </button>
      )}
    </div>
  )
}
