import { useState } from 'react'
import { useTranslation } from '../../i18n'
import { BUILT_IN_NPCS } from '../../game/data/npcs'
import { BookDetailModal } from './BookDetailModal'
import type { Item, BookItem } from '../../../../shared/item-types'

const CATEGORY_COLORS: Record<string, string> = {
  writing: '#e8b44c',
  research: '#5bb5e8',
  code: '#a78bfa',
  data: '#4ade80',
  communication: '#f472b6',
  organization: '#fb923c',
  visual: '#c084fc',
  general: '#888'
}

interface ItemsTabProps {
  items: Item[]
  locale: string
  onUpdateName: (itemId: string, name: string) => Promise<void>
  onDeleteItem: (itemId: string) => Promise<void>
}

function resolveNpcName(agentId: string, locale: string): string {
  const npc = BUILT_IN_NPCS.find((n) => n.id === agentId)
  return npc?.name[locale] ?? npc?.name['zh-TW'] ?? agentId
}

function relativeTime(timestamp: number, locale: string): string {
  const diff = Date.now() - timestamp
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return locale === 'en' ? 'Just now' : '剛才'
  if (minutes < 60) return locale === 'en' ? `${minutes}m ago` : `${minutes}分鐘前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return locale === 'en' ? `${hours}h ago` : `${hours}小時前`
  const days = Math.floor(hours / 24)
  return locale === 'en' ? `${days}d ago` : `${days}天前`
}

export function ItemsTab({
  items,
  locale,
  onUpdateName,
  onDeleteItem
}: ItemsTabProps): React.JSX.Element {
  const { t } = useTranslation()
  const [filter, setFilter] = useState<string>('all')
  const [selectedItem, setSelectedItem] = useState<BookItem | null>(null)

  const categories = Array.from(new Set(items.map((i) => i.category)))
  const filtered = filter === 'all' ? items : items.filter((i) => i.category === filter)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 'bold', color: '#e8d5a8' }}>
          📦 {t('items.title')}
        </div>
      </div>

      {/* Category filter chips */}
      {categories.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: 6,
            marginBottom: 12,
            flexWrap: 'wrap',
            flexShrink: 0
          }}
        >
          <button
            onClick={() => setFilter('all')}
            style={{
              padding: '3px 10px',
              borderRadius: 12,
              border: '1px solid',
              borderColor: filter === 'all' ? '#c4a46c' : 'rgba(200, 180, 140, 0.25)',
              background: filter === 'all' ? 'rgba(200, 180, 140, 0.2)' : 'transparent',
              color: filter === 'all' ? '#e8d5a8' : '#a89060',
              fontFamily: 'monospace',
              fontSize: 11,
              cursor: 'pointer'
            }}
          >
            {t('items.filterAll')}
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              style={{
                padding: '3px 10px',
                borderRadius: 12,
                border: '1px solid',
                borderColor:
                  filter === cat ? (CATEGORY_COLORS[cat] ?? '#888') : 'rgba(200, 180, 140, 0.25)',
                background: filter === cat ? `${CATEGORY_COLORS[cat] ?? '#888'}22` : 'transparent',
                color: filter === cat ? (CATEGORY_COLORS[cat] ?? '#888') : '#a89060',
                fontFamily: 'monospace',
                fontSize: 11,
                cursor: 'pointer'
              }}
            >
              {cat === 'general' ? t('items.categoryGeneral') : cat}
            </button>
          ))}
        </div>
      )}

      {/* Items list */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {filtered.map((item) => (
          <button
            key={item.id}
            onClick={() => setSelectedItem(item as BookItem)}
            style={{
              display: 'flex',
              gap: 10,
              padding: '8px 10px',
              background: 'rgba(200, 180, 140, 0.08)',
              border: '1px solid rgba(200, 180, 140, 0.15)',
              borderRadius: 4,
              cursor: 'pointer',
              textAlign: 'left',
              color: '#c4a46c',
              fontFamily: 'monospace',
              width: '100%'
            }}
          >
            <span style={{ fontSize: 20, flexShrink: 0 }}>{item.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 'bold',
                  color: '#e8d5a8',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
              >
                {item.name}
              </div>
              <div style={{ fontSize: 11, color: '#a89060', marginTop: 2 }}>
                {resolveNpcName((item as BookItem).sourceAgentId, locale)} ·{' '}
                {relativeTime(item.createdAt, locale)}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: 'rgba(200, 180, 140, 0.5)',
                  marginTop: 2,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
              >
                {(item as BookItem).preview}
              </div>
            </div>
            <span
              style={{
                fontSize: 10,
                padding: '2px 6px',
                borderRadius: 8,
                background: `${CATEGORY_COLORS[item.category] ?? '#888'}22`,
                color: CATEGORY_COLORS[item.category] ?? '#888',
                alignSelf: 'flex-start',
                flexShrink: 0
              }}
            >
              {item.category === 'general' ? t('items.categoryGeneral') : item.category}
            </span>
          </button>
        ))}

        {filtered.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              color: 'rgba(200, 180, 140, 0.4)',
              padding: 40,
              fontSize: 13
            }}
          >
            <div>{t('items.empty')}</div>
            <div style={{ marginTop: 8, fontSize: 11 }}>{t('items.emptyHint')}</div>
          </div>
        )}
      </div>

      {/* Book detail modal */}
      {selectedItem && (
        <BookDetailModal
          item={selectedItem}
          locale={locale}
          onClose={() => setSelectedItem(null)}
          onUpdateName={async (id, name) => {
            await onUpdateName(id, name)
            setSelectedItem((prev) => (prev ? { ...prev, name } : null))
          }}
          onDelete={async (id) => {
            await onDeleteItem(id)
            setSelectedItem(null)
          }}
        />
      )}
    </div>
  )
}
