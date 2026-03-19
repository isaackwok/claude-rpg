import { useState, useEffect, useCallback } from 'react'
import { EventBus } from '../../game/EventBus'
import { useCosmetics } from '../../hooks/useCosmetics'
import { useTranslation } from '../../i18n'

/**
 * HomeHUD — overlay displayed only when the player is in the Home scene.
 *
 * - Shows a "Decorate" hint button at bottom-right
 * - When decoration mode is active (D key / button click) shows a toolbar
 *   listing unlocked decoration-type cosmetics for placement selection
 */
export function HomeHUD(): React.JSX.Element | null {
  const { t } = useTranslation()
  const { cosmetics } = useCosmetics()
  const [inHomeScene, setInHomeScene] = useState(false)
  const [decorateActive, setDecorateActive] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Track scene changes
  useEffect(() => {
    const handler = (data: { sceneName: string }): void => {
      setInHomeScene(data.sceneName === 'Home')
      if (data.sceneName !== 'Home') {
        setDecorateActive(false)
        setSelectedId(null)
      }
    }
    EventBus.on('scene:changed', handler)
    return () => {
      EventBus.off('scene:changed', handler)
    }
  }, [])

  // Track decoration mode toggled from Phaser (D key / ESC)
  useEffect(() => {
    const handler = (data: { active: boolean }): void => {
      setDecorateActive(data.active)
      if (!data.active) {
        setSelectedId(null)
      }
    }
    EventBus.on('home:decorate-mode', handler)
    return () => {
      EventBus.off('home:decorate-mode', handler)
    }
  }, [])

  const handleDecorateButtonClick = useCallback(() => {
    // Toggle decoration mode by emitting the same event Phaser listens to.
    // We rely on Phaser's keydown-D handler being the source of truth;
    // instead, we dispatch a synthetic keyboard event so the Phaser scene
    // receives it consistently.
    const keyEvent = new KeyboardEvent('keydown', {
      code: 'KeyD',
      key: 'd',
      bubbles: true
    })
    window.dispatchEvent(keyEvent)
  }, [])

  const handleCosmeticSelect = useCallback(
    (cosmeticDefId: string): void => {
      const newId = selectedId === cosmeticDefId ? null : cosmeticDefId
      setSelectedId(newId)
      // Notify DecorationManager via a custom EventBus event
      // (DecorationManager listens via home:select-cosmetic)
      EventBus.emit('home:decorate-mode', {
        active: decorateActive
      })
      // Post a custom DOM event that the Phaser scene can pick up,
      // or use a shared ref. Since DecorationManager is in Phaser land,
      // we store the selection on the window for the scene to read.
      ;(window as unknown as Record<string, unknown>).__homeSelectedCosmetic = newId
    },
    [selectedId, decorateActive]
  )

  if (!inHomeScene) return null

  // Filter unlocked decorations
  const decorations = cosmetics.filter((c) => c.unlocked && c.definition.type === 'decoration')

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 8,
        padding: '0 16px 16px 16px',
        pointerEvents: 'none',
        boxSizing: 'border-box'
      }}
    >
      {/* Decoration toolbar (shown when decoration mode is active) */}
      {decorateActive && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            gap: 6,
            alignSelf: 'center',
            background: 'rgba(10, 10, 30, 0.92)',
            border: '2px solid rgba(200, 180, 140, 0.5)',
            borderRadius: 8,
            padding: '8px 12px',
            pointerEvents: 'auto',
            fontFamily: 'monospace',
            alignItems: 'center'
          }}
        >
          <span
            style={{
              fontSize: 11,
              color: 'rgba(200, 180, 140, 0.7)',
              marginRight: 6
            }}
          >
            {t('home.decorate')}
          </span>

          {decorations.length === 0 ? (
            <span
              style={{ fontSize: 11, color: 'rgba(200, 180, 140, 0.4)', fontFamily: 'monospace' }}
            >
              —
            </span>
          ) : (
            decorations.map((c) => (
              <button
                key={c.cosmeticDefId}
                onClick={() => handleCosmeticSelect(c.cosmeticDefId)}
                title={
                  typeof c.definition.title === 'object'
                    ? (c.definition.title['zh-TW'] ?? c.definition.title['en'] ?? c.cosmeticDefId)
                    : c.cosmeticDefId
                }
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 4,
                  border:
                    selectedId === c.cosmeticDefId
                      ? '2px solid #c4a46c'
                      : '2px solid rgba(200, 180, 140, 0.25)',
                  background:
                    selectedId === c.cosmeticDefId
                      ? 'rgba(200, 180, 140, 0.2)'
                      : 'rgba(200, 180, 140, 0.06)',
                  cursor: 'pointer',
                  fontSize: 18,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#e8d5a8',
                  transition: 'border-color 0.1s, background 0.1s'
                }}
              >
                {c.definition.icon}
              </button>
            ))
          )}

          <span
            style={{
              fontSize: 10,
              color: 'rgba(200, 180, 140, 0.45)',
              marginLeft: 6,
              whiteSpace: 'nowrap'
            }}
          >
            {t('home.exitDecorate')}
          </span>
        </div>
      )}

      {/* Decorate hint button */}
      <button
        onClick={handleDecorateButtonClick}
        style={{
          background: decorateActive ? 'rgba(196, 164, 108, 0.25)' : 'rgba(10, 10, 30, 0.85)',
          border: decorateActive ? '2px solid #c4a46c' : '2px solid rgba(200, 180, 140, 0.4)',
          borderRadius: 6,
          padding: '6px 12px',
          color: decorateActive ? '#c4a46c' : 'rgba(200, 180, 140, 0.7)',
          fontFamily: 'monospace',
          fontSize: 12,
          cursor: 'pointer',
          pointerEvents: 'auto',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          transition: 'all 0.1s'
        }}
      >
        <span>🏠</span>
        <span>{decorateActive ? t('home.exitDecorate') : t('home.decorateHint')}</span>
      </button>
    </div>
  )
}
