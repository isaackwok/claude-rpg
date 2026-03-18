import { useState } from 'react'
import { useTranslation } from '../../i18n'
import { QuestCard } from './QuestCard'
import type { PlayerQuest } from '../../../../shared/types'

type QuestFilter = 'all' | 'active' | 'completed'

interface QuestsTabProps {
  quests: PlayerQuest[]
}

export function QuestsTab({ quests }: QuestsTabProps) {
  const { t } = useTranslation()
  const [filter, setFilter] = useState<QuestFilter>('all')

  const activeCount = quests.filter((q) => q.status === 'active').length
  const completedCount = quests.filter((q) => q.status === 'completed').length

  const filtered = quests.filter((q) => {
    if (filter === 'active') return q.status === 'active'
    if (filter === 'completed') return q.status === 'completed'
    return true
  })

  // Sort: active first, then completed
  const sorted = [...filtered].sort((a, b) => {
    if (a.status === 'active' && b.status === 'completed') return -1
    if (a.status === 'completed' && b.status === 'active') return 1
    return 0
  })

  const filters: { key: QuestFilter; label: string }[] = [
    { key: 'all', label: t('quests.filters.all') },
    { key: 'active', label: t('quests.filters.active') },
    { key: 'completed', label: t('quests.filters.completed') }
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 18, fontWeight: 'bold', color: '#e8d5a8' }}>
          📜 {t('quests.title')}
        </div>
        <div style={{ fontSize: 12, color: '#a89060', marginTop: 4 }}>
          {t('quests.count', { active: String(activeCount), completed: String(completedCount) })}
        </div>
      </div>

      {/* Filter sub-tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              background: filter === f.key ? 'rgba(200, 180, 140, 0.15)' : 'transparent',
              border: filter === f.key ? '1px solid #c4a46c' : '1px solid rgba(200, 180, 140, 0.2)',
              borderRadius: 4,
              padding: '4px 12px',
              fontSize: 12,
              color: filter === f.key ? '#e8d5a8' : '#a89060',
              cursor: 'pointer',
              fontFamily: 'monospace'
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Quest list */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 8
        }}
      >
        {sorted.map((quest) => (
          <QuestCard key={quest.id} quest={quest} />
        ))}
        {sorted.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              color: 'rgba(200, 180, 140, 0.4)',
              padding: 24,
              fontSize: 13
            }}
          >
            —
          </div>
        )}
      </div>
    </div>
  )
}
