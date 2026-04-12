import { useState, useRef, useCallback, useEffect, type CSSProperties } from 'react'
import { AutocompletePopup } from './AutocompletePopup'
import type {
  AutocompleteItem,
  SlashCommand,
  AtSource
} from '../../../../shared/dialogue-control-types'

interface SmartInputProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  onAttach: (item: AutocompleteItem) => void
  disabled: boolean
  placeholder: string
  slashCommands: SlashCommand[]
  atSources: AtSource[]
  inputRef?: React.RefObject<HTMLTextAreaElement | null>
  onBackspaceEmpty?: () => void
}

const inputHeight = 30
const maxTextareaHeight = 120

function buildSlashItems(commands: SlashCommand[], filter: string): AutocompleteItem[] {
  const query = filter.toLowerCase()
  return commands
    .filter((c) => c.name.toLowerCase().includes(query))
    .map((c) => ({
      type: 'slash' as const,
      id: c.name,
      label: `/${c.name}`,
      description: c.description
    }))
}

function buildAtItems(sources: AtSource[], filter: string): AutocompleteItem[] {
  const query = filter.toLowerCase()
  return sources
    .filter(
      (s) =>
        s.label.toLowerCase().includes(query) ||
        (s.secondary?.toLowerCase().includes(query) ?? false)
    )
    .map((s) => ({
      type: s.type,
      id: s.id,
      label: s.type === 'npc' ? `@${s.label}` : s.label,
      description: s.secondary,
      icon: s.type === 'npc' ? '🧙' : s.type === 'book' ? '📖' : '📄'
    }))
}

export function SmartInput({
  value,
  onChange,
  onSend,
  onAttach,
  disabled,
  placeholder,
  slashCommands,
  atSources,
  inputRef: externalRef,
  onBackspaceEmpty
}: SmartInputProps) {
  const internalRef = useRef<HTMLTextAreaElement>(null)
  const textareaRef = externalRef ?? internalRef
  const [autocomplete, setAutocomplete] = useState<{
    mode: 'slash' | 'at'
    items: AutocompleteItem[]
    selectedIndex: number
    anchorPos: number
  } | null>(null)

  // Derive autocomplete state from value
  useEffect(() => {
    // Check for slash command: "/" at position 0
    if (value.startsWith('/')) {
      const filter = value.slice(1).split(/\s/)[0]
      if (!value.includes(' ')) {
        const items = buildSlashItems(slashCommands, filter)
        setAutocomplete((prev) => ({
          mode: 'slash',
          items,
          selectedIndex: Math.min(prev?.selectedIndex ?? 0, Math.max(items.length - 1, 0)),
          anchorPos: 0
        }))
        return
      }
    }

    // Check for @ mention: find last unresolved "@" before cursor
    const cursorPos = textareaRef.current?.selectionStart ?? value.length
    const textBeforeCursor = value.slice(0, cursorPos)
    const lastAtIdx = textBeforeCursor.lastIndexOf('@')
    if (lastAtIdx >= 0) {
      const charBefore = lastAtIdx > 0 ? textBeforeCursor[lastAtIdx - 1] : ' '
      if (charBefore === ' ' || charBefore === '\n' || lastAtIdx === 0) {
        const filter = textBeforeCursor.slice(lastAtIdx + 1)
        if (!filter.includes(' ')) {
          const items = buildAtItems(atSources, filter)
          setAutocomplete((prev) => ({
            mode: 'at',
            items,
            selectedIndex: Math.min(prev?.selectedIndex ?? 0, Math.max(items.length - 1, 0)),
            anchorPos: lastAtIdx
          }))
          return
        }
      }
    }

    setAutocomplete(null)
  }, [value, slashCommands, atSources, textareaRef])

  const handleSelect = useCallback(
    (item: AutocompleteItem) => {
      if (!autocomplete) return

      if (autocomplete.mode === 'slash') {
        onChange(item.label + ' ')
      } else {
        const before = value.slice(0, autocomplete.anchorPos)
        const after = value.slice(textareaRef.current?.selectionStart ?? autocomplete.anchorPos)
        onChange(before + after)
        onAttach(item)
      }
      setAutocomplete(null)
      setTimeout(() => textareaRef.current?.focus(), 0)
    },
    [autocomplete, value, onChange, onAttach, textareaRef]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (autocomplete && autocomplete.items.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setAutocomplete((prev) =>
            prev ? { ...prev, selectedIndex: (prev.selectedIndex + 1) % prev.items.length } : null
          )
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setAutocomplete((prev) =>
            prev
              ? {
                  ...prev,
                  selectedIndex: (prev.selectedIndex - 1 + prev.items.length) % prev.items.length
                }
              : null
          )
          return
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault()
          handleSelect(autocomplete.items[autocomplete.selectedIndex])
          return
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          setAutocomplete(null)
          return
        }
      }

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        onSend()
        if (textareaRef.current) textareaRef.current.style.height = `${inputHeight}px`
        return
      }

      if (
        e.key === 'Backspace' &&
        textareaRef.current?.selectionStart === 0 &&
        textareaRef.current?.selectionEnd === 0
      ) {
        onBackspaceEmpty?.()
      }
    },
    [autocomplete, handleSelect, onSend, onBackspaceEmpty, textareaRef]
  )

  const textareaStyle: CSSProperties = {
    minHeight: inputHeight,
    maxHeight: maxTextareaHeight,
    boxSizing: 'border-box',
    padding: '4px 8px',
    fontFamily: 'monospace',
    fontSize: 14,
    background: 'transparent',
    border: 'none',
    color: '#fff',
    outline: 'none',
    resize: 'none',
    overflow: 'auto',
    lineHeight: '22px',
    width: '100%'
  }

  return (
    <div style={{ position: 'relative', flex: 1 }}>
      <AutocompletePopup
        items={autocomplete?.items ?? []}
        selectedIndex={autocomplete?.selectedIndex ?? 0}
        onSelect={handleSelect}
        visible={autocomplete !== null && autocomplete.items.length > 0}
      />
      <div
        style={{
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(200,180,140,0.3)',
          borderRadius: 2,
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={(e) => {
            const el = e.currentTarget
            el.style.height = 'auto'
            el.style.height = Math.min(el.scrollHeight, maxTextareaHeight) + 'px'
          }}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          style={textareaStyle}
        />
      </div>
    </div>
  )
}
