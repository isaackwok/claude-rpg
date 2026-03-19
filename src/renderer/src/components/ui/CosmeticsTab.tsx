import { useState } from 'react'
import { useTranslation } from '../../i18n'
import { CosmeticItem } from './CosmeticItem'
import type { PlayerCosmetic } from '../../../../shared/cosmetic-types'
import type { OverlayLayer } from '../../../../shared/cosmetic-types'

type CosmeticSubTab = 'overlays' | 'decorations'

interface CosmeticsTabProps {
  cosmetics: PlayerCosmetic[]
  equipped: PlayerCosmetic[]
  onEquip: (id: string) => void
  onUnequip: (id: string) => void
  locale: string
}

const OVERLAY_SLOTS: { layer: OverlayLayer; i18nKey: string }[] = [
  { layer: 'hat', i18nKey: 'cosmetics.slots.hat' },
  { layer: 'cape', i18nKey: 'cosmetics.slots.cape' },
  { layer: 'aura', i18nKey: 'cosmetics.slots.aura' }
]

export function CosmeticsTab({ cosmetics, equipped, onEquip, onUnequip }: CosmeticsTabProps) {
  const { t } = useTranslation()
  const [subTab, setSubTab] = useState<CosmeticSubTab>('overlays')

  const unlockedCount = cosmetics.filter((c) => c.unlocked).length
  const totalCount = cosmetics.length

  // Filter by sub-tab type, unlocked first
  const filtered = cosmetics
    .filter((c) =>
      subTab === 'overlays' ? c.definition.type === 'overlay' : c.definition.type === 'decoration'
    )
    .sort((a, b) => {
      if (a.unlocked && !b.unlocked) return -1
      if (!a.unlocked && b.unlocked) return 1
      return 0
    })

  // Equipped overlays by layer
  const equippedByLayer: Partial<Record<OverlayLayer, PlayerCosmetic>> = {}
  for (const c of equipped) {
    if (c.equipped && c.definition.type === 'overlay' && c.definition.layer) {
      equippedByLayer[c.definition.layer] = c
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: '#a89060' }}>
          {t('cosmetics.count', {
            unlocked: String(unlockedCount),
            total: String(totalCount)
          })}
        </div>
      </div>

      {/* Split panel */}
      <div style={{ display: 'flex', flex: 1, gap: 12, minHeight: 0 }}>
        {/* Left panel — preview */}
        <div
          style={{
            flex: '0 0 120px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8
          }}
        >
          {/* Preview label */}
          <div
            style={{
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: 1,
              color: '#a89060'
            }}
          >
            {t('cosmetics.preview')}
          </div>

          {/* Player preview box */}
          <div
            style={{
              width: 80,
              height: 96,
              background: 'rgba(200,180,140,0.08)',
              border: '1px solid rgba(200,180,140,0.25)',
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 32
            }}
          >
            🧙
          </div>

          {/* Equipped slots label */}
          <div
            style={{
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: 1,
              color: '#a89060',
              textAlign: 'center'
            }}
          >
            {t('cosmetics.equippedSlots')}
          </div>

          {/* Slot boxes */}
          <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
            {OVERLAY_SLOTS.map(({ layer, i18nKey }) => {
              const equippedCosmetic = equippedByLayer[layer]
              return (
                <div
                  key={layer}
                  title={t(i18nKey)}
                  style={{
                    width: 28,
                    height: 28,
                    background: equippedCosmetic
                      ? 'rgba(200,180,140,0.15)'
                      : 'rgba(200,180,140,0.05)',
                    border: equippedCosmetic
                      ? '1px solid rgba(200,180,140,0.4)'
                      : '1px dashed rgba(200,180,140,0.2)',
                    borderRadius: 4,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: equippedCosmetic ? 14 : 12,
                    color: equippedCosmetic ? undefined : '#666'
                  }}
                >
                  {equippedCosmetic ? equippedCosmetic.definition.icon : '—'}
                </div>
              )
            })}
          </div>
        </div>

        {/* Right panel — list */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            minWidth: 0
          }}
        >
          {/* Sub-tabs */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 4 }}>
            {(['overlays', 'decorations'] as CosmeticSubTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setSubTab(tab)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  borderBottom: subTab === tab ? '1px solid #c4a46c' : '1px solid transparent',
                  padding: '2px 0',
                  fontSize: 12,
                  color: subTab === tab ? '#c4a46c' : '#a89060',
                  cursor: 'pointer',
                  fontFamily: 'monospace'
                }}
              >
                {t(`cosmetics.tabs.${tab}`)}
              </button>
            ))}
          </div>

          {/* Cosmetic list */}
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filtered.map((cosmetic) => (
              <CosmeticItem
                key={cosmetic.cosmeticDefId}
                cosmetic={cosmetic}
                onEquip={onEquip}
                onUnequip={onUnequip}
                locale="zh-TW"
              />
            ))}
            {filtered.length === 0 && (
              <div
                style={{
                  textAlign: 'center',
                  color: 'rgba(200,180,140,0.4)',
                  padding: 24,
                  fontSize: 13
                }}
              >
                —
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
