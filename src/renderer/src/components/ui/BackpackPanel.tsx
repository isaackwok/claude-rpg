import { useState, useRef } from 'react'
import { useTranslation } from '../../i18n'
import { useQuests } from '../../hooks/useQuests'
import { QuestsTab } from './QuestsTab'

type BackpackTab = 'items' | 'quests' | 'achievements' | 'cosmetics'

const TABS: { key: BackpackTab; icon: string; i18nKey: string; available: boolean }[] = [
  { key: 'items', icon: '📦', i18nKey: 'backpack.tabs.items', available: false },
  { key: 'quests', icon: '📜', i18nKey: 'backpack.tabs.quests', available: true },
  { key: 'achievements', icon: '🏆', i18nKey: 'backpack.tabs.achievements', available: false },
  { key: 'cosmetics', icon: '👘', i18nKey: 'backpack.tabs.cosmetics', available: false }
]

interface BackpackPanelProps {
  onClose: () => void
}

export function BackpackPanel({ onClose }: BackpackPanelProps) {
  const { t } = useTranslation()
  const { quests } = useQuests()
  const [activeTab, setActiveTab] = useState<BackpackTab>('quests')
  const panelRef = useRef<HTMLDivElement>(null)

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
      onClose()
    }
  }

  return (
    <div
      onClick={handleBackdropClick}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: 'rgba(0, 0, 0, 0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'auto',
        zIndex: 100
      }}
    >
      <div
        ref={panelRef}
        style={{
          background: 'rgba(10, 10, 30, 0.96)',
          border: '3px solid rgba(200, 180, 140, 0.6)',
          borderRadius: 8,
          display: 'flex',
          width: 600,
          height: 500,
          fontFamily: 'monospace',
          color: '#c4a46c',
          overflow: 'hidden'
        }}
      >
        {/* Left sidebar tabs */}
        <div
          style={{
            width: 56,
            borderRight: '1px solid rgba(200, 180, 140, 0.2)',
            display: 'flex',
            flexDirection: 'column',
            paddingTop: 8
          }}
        >
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => tab.available && setActiveTab(tab.key)}
              title={t(tab.i18nKey) + (tab.available ? '' : ` (${t('backpack.tabs.unavailable')})`)}
              style={{
                background: activeTab === tab.key ? 'rgba(200, 180, 140, 0.12)' : 'transparent',
                border: 'none',
                borderLeft: activeTab === tab.key ? '2px solid #c4a46c' : '2px solid transparent',
                padding: '12px 0',
                fontSize: 20,
                cursor: tab.available ? 'pointer' : 'default',
                opacity: tab.available ? 1 : 0.35,
                textAlign: 'center',
                width: '100%'
              }}
            >
              {tab.icon}
            </button>
          ))}
        </div>

        {/* Content area */}
        <div style={{ flex: 1, padding: '20px 24px', display: 'flex', flexDirection: 'column' }}>
          {/* Panel title */}
          <div
            style={{
              fontSize: 14,
              color: 'rgba(200, 180, 140, 0.5)',
              marginBottom: 12,
              display: 'flex',
              justifyContent: 'space-between'
            }}
          >
            <span>🎒 {t('backpack.title')}</span>
            <span style={{ fontSize: 11 }}>{t('skills.close')}</span>
          </div>

          {/* Tab content */}
          <div style={{ flex: 1, overflow: 'hidden' }}>
            {activeTab === 'quests' && <QuestsTab quests={quests} />}
            {!TABS.find((t) => t.key === activeTab)?.available && activeTab !== 'quests' && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  color: 'rgba(200, 180, 140, 0.3)',
                  fontSize: 14
                }}
              >
                {t('backpack.tabs.unavailable')}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
