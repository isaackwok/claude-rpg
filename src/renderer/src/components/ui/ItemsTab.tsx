import { useState } from 'react'
import { useTranslation } from '../../i18n'
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

const CATEGORY_I18N: Record<string, string> = {
  writing: 'items.categoryWriting',
  research: 'items.categoryResearch',
  code: 'items.categoryCode',
  data: 'items.categoryData',
  communication: 'items.categoryCommunication',
  organization: 'items.categoryOrganization',
  visual: 'items.categoryVisual',
  general: 'items.categoryGeneral'
}

export function categoryLabel(category: string, t: (key: string) => string): string {
  const key = CATEGORY_I18N[category]
  return key ? t(key) : category
}

interface ItemsTabProps {
  items: Item[]
  locale: string
  onUpdateName: (itemId: string, name: string) => Promise<void>
  onDeleteItem: (itemId: string) => Promise<void>
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
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const categories = Array.from(new Set(items.map((i) => i.category)))
  const filtered = filter === 'all' ? items : items.filter((i) => i.category === filter)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ marginBottom: 12, flexShrink: 0 }}>
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
              {categoryLabel(cat, t)}
            </button>
          ))}
        </div>
      )}

      {/* Items grid — scrollable vertically */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', minHeight: 0 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, 52px)',
            gap: 6
          }}
        >
          {filtered.map((item) => (
            <div key={item.id} style={{ position: 'relative' }}>
              <button
                onClick={() => setSelectedItem(item as BookItem)}
                onMouseEnter={() => setHoveredId(item.id)}
                onMouseLeave={() => setHoveredId(null)}
                style={{
                  width: 52,
                  height: 52,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(200, 180, 140, 0.08)',
                  border: `1px solid ${
                    hoveredId === item.id ? 'rgba(200, 180, 140, 0.5)' : 'rgba(200, 180, 140, 0.15)'
                  }`,
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: 24,
                  padding: 0,
                  transition: 'border-color 0.15s, background 0.15s',
                  ...(hoveredId === item.id ? { background: 'rgba(200, 180, 140, 0.15)' } : {})
                }}
              >
                {item.icon}
              </button>
              {/* Tooltip on hover */}
              {hoveredId === item.id && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: '100%',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    marginBottom: 4,
                    padding: '4px 8px',
                    background: 'rgba(10, 10, 30, 0.95)',
                    border: '1px solid rgba(200, 180, 140, 0.4)',
                    borderRadius: 4,
                    fontSize: 11,
                    fontFamily: 'monospace',
                    color: '#e8d5a8',
                    whiteSpace: 'nowrap',
                    pointerEvents: 'none',
                    zIndex: 10
                  }}
                >
                  {item.name}
                </div>
              )}
            </div>
          ))}
        </div>

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
