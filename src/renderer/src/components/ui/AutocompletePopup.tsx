import type { CSSProperties } from 'react'
import type { AutocompleteItem } from '../../../../shared/dialogue-control-types'

interface AutocompletePopupProps {
  items: AutocompleteItem[]
  selectedIndex: number
  onSelect: (item: AutocompleteItem) => void
  visible: boolean
}

const CATEGORY_LABELS: Record<string, string> = {
  slash: 'Slash Commands',
  npc: 'NPCs',
  book: 'Books',
  file: 'Files'
}

const containerStyle: CSSProperties = {
  position: 'absolute',
  bottom: '100%',
  left: 0,
  right: 0,
  marginBottom: 4,
  background: 'rgba(20, 20, 40, 0.98)',
  border: '1px solid rgba(200, 180, 140, 0.3)',
  borderRadius: 4,
  padding: '4px 0',
  maxHeight: 200,
  overflowY: 'auto',
  zIndex: 20,
  boxShadow: '0 -4px 16px rgba(0,0,0,0.4)'
}

const categoryLabelStyle: CSSProperties = {
  padding: '4px 10px',
  fontSize: 11,
  color: 'rgba(200, 180, 140, 0.6)',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  fontFamily: 'monospace'
}

function itemStyle(isSelected: boolean): CSSProperties {
  return {
    padding: '6px 10px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: isSelected ? 'rgba(200, 180, 140, 0.12)' : 'transparent',
    fontFamily: 'monospace',
    fontSize: 13
  }
}

export function AutocompletePopup({
  items,
  selectedIndex,
  onSelect,
  visible
}: AutocompletePopupProps) {
  if (!visible || items.length === 0) return null

  // Group items by type for categorized display
  const groups = new Map<string, AutocompleteItem[]>()
  for (const item of items) {
    const list = groups.get(item.type) ?? []
    list.push(item)
    groups.set(item.type, list)
  }

  let flatIndex = 0

  return (
    <div style={containerStyle}>
      {Array.from(groups.entries()).map(([type, groupItems]) => (
        <div key={type}>
          {groups.size > 1 && <div style={categoryLabelStyle}>{CATEGORY_LABELS[type] ?? type}</div>}
          {groupItems.map((item) => {
            const idx = flatIndex++
            const isSelected = idx === selectedIndex
            return (
              <div
                key={item.id}
                data-selected={isSelected ? 'true' : 'false'}
                style={itemStyle(isSelected)}
                onMouseDown={(e) => {
                  e.preventDefault()
                }}
                onClick={() => onSelect(item)}
              >
                {item.icon && <span style={{ fontSize: 14 }}>{item.icon}</span>}
                <span style={{ color: '#e8d5a8' }}>{item.label}</span>
                {item.description && (
                  <span style={{ color: 'rgba(200, 180, 140, 0.5)', fontSize: 12 }}>
                    {item.description}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
