import { useState } from 'react'
import { useTranslation } from '../../i18n'
import { useItems } from '../../hooks/useItems'
import { BUILT_IN_NPCS } from '../../game/data/npcs'
import { CloseButton } from './CloseButton'
import { categoryLabel } from './ItemsTab'
import type { BookItem } from '../../../../shared/item-types'

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

interface BookPickerModalProps {
  onAttach: (books: BookItem[]) => void
  onClose: () => void
}

export function BookPickerModal({ onAttach, onClose }: BookPickerModalProps): React.JSX.Element {
  const { t, locale } = useTranslation()
  const { items } = useItems()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<string>('all')

  const books = items.filter((i): i is BookItem => i.type === 'book')
  const categories = Array.from(new Set(books.map((b) => b.category)))
  const filtered = filter === 'all' ? books : books.filter((b) => b.category === filter)

  const toggle = (id: string): void => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleAttach = (): void => {
    const selectedBooks = books.filter((b) => selected.has(b.id))
    onAttach(selectedBooks)
  }

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: 'rgba(0, 0, 0, 0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200
      }}
    >
      <div
        style={{
          background: 'rgba(10, 10, 30, 0.98)',
          border: '3px solid rgba(200, 180, 140, 0.6)',
          borderRadius: 8,
          width: 480,
          maxHeight: '70vh',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'monospace',
          color: '#c4a46c'
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '14px 20px 10px',
            borderBottom: '1px solid rgba(200, 180, 140, 0.2)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0
          }}
        >
          <span style={{ fontSize: 16, fontWeight: 'bold', color: '#e8d5a8' }}>
            📖 {t('items.pickBooks')}
          </span>
          <CloseButton onClick={onClose} size={11} />
        </div>

        {/* Category filter */}
        {categories.length > 0 && (
          <div
            style={{
              display: 'flex',
              gap: 6,
              padding: '8px 20px',
              flexWrap: 'wrap',
              flexShrink: 0
            }}
          >
            <button
              onClick={() => setFilter('all')}
              style={{
                padding: '2px 8px',
                borderRadius: 12,
                border: '1px solid',
                borderColor: filter === 'all' ? '#c4a46c' : 'rgba(200, 180, 140, 0.25)',
                background: filter === 'all' ? 'rgba(200, 180, 140, 0.2)' : 'transparent',
                color: filter === 'all' ? '#e8d5a8' : '#a89060',
                fontFamily: 'monospace',
                fontSize: 10,
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
                  padding: '2px 8px',
                  borderRadius: 12,
                  border: '1px solid',
                  borderColor:
                    filter === cat ? (CATEGORY_COLORS[cat] ?? '#888') : 'rgba(200, 180, 140, 0.25)',
                  background:
                    filter === cat ? `${CATEGORY_COLORS[cat] ?? '#888'}22` : 'transparent',
                  color: filter === cat ? (CATEGORY_COLORS[cat] ?? '#888') : '#a89060',
                  fontFamily: 'monospace',
                  fontSize: 10,
                  cursor: 'pointer'
                }}
              >
                {categoryLabel(cat, t)}
              </button>
            ))}
          </div>
        )}

        {/* Book list */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '4px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4
          }}
        >
          {filtered.length === 0 && (
            <div
              style={{
                textAlign: 'center',
                color: 'rgba(200, 180, 140, 0.4)',
                padding: 30,
                fontSize: 13
              }}
            >
              {t('items.noBooks')}
            </div>
          )}
          {filtered.map((book) => {
            const isSelected = selected.has(book.id)
            const npcName =
              BUILT_IN_NPCS.find((n) => n.id === book.sourceAgentId)?.name[locale] ??
              BUILT_IN_NPCS.find((n) => n.id === book.sourceAgentId)?.name['zh-TW'] ??
              book.sourceAgentId
            return (
              <button
                key={book.id}
                onClick={() => toggle(book.id)}
                style={{
                  display: 'flex',
                  gap: 8,
                  padding: '6px 8px',
                  background: isSelected
                    ? 'rgba(200, 180, 140, 0.15)'
                    : 'rgba(200, 180, 140, 0.04)',
                  border: isSelected
                    ? '1px solid rgba(200, 180, 140, 0.4)'
                    : '1px solid rgba(200, 180, 140, 0.1)',
                  borderRadius: 4,
                  cursor: 'pointer',
                  textAlign: 'left',
                  color: '#c4a46c',
                  fontFamily: 'monospace',
                  width: '100%',
                  alignItems: 'center'
                }}
              >
                <span
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 3,
                    border: isSelected ? '2px solid #c4a46c' : '2px solid rgba(200, 180, 140, 0.3)',
                    background: isSelected ? 'rgba(200, 180, 140, 0.3)' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 10,
                    flexShrink: 0
                  }}
                >
                  {isSelected ? '✓' : ''}
                </span>
                <span style={{ fontSize: 16, flexShrink: 0 }}>📖</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 12,
                      color: '#e8d5a8',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {book.name}
                  </div>
                  <div style={{ fontSize: 10, color: '#a89060', marginTop: 1 }}>
                    {npcName} · {book.preview.slice(0, 50)}
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '10px 20px',
            borderTop: '1px solid rgba(200, 180, 140, 0.2)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0
          }}
        >
          <span style={{ fontSize: 11, color: '#a89060' }}>
            {selected.size > 0 ? t('items.attachCount', { count: String(selected.size) }) : ''}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: '1px solid rgba(200, 180, 140, 0.3)',
                borderRadius: 4,
                padding: '4px 12px',
                color: '#a89060',
                fontFamily: 'monospace',
                fontSize: 12,
                cursor: 'pointer'
              }}
            >
              {t('items.deleteNo')}
            </button>
            <button
              onClick={handleAttach}
              disabled={selected.size === 0}
              style={{
                background:
                  selected.size > 0 ? 'rgba(200, 180, 140, 0.25)' : 'rgba(100, 100, 100, 0.15)',
                border: '1px solid rgba(200, 180, 140, 0.4)',
                borderRadius: 4,
                padding: '4px 16px',
                color: selected.size > 0 ? '#c4a46c' : 'rgba(200, 180, 140, 0.3)',
                fontFamily: 'monospace',
                fontSize: 12,
                cursor: selected.size > 0 ? 'pointer' : 'default'
              }}
            >
              {t('items.attach')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
