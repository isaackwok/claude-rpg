import { useState, useMemo, useRef, useCallback, type CSSProperties } from 'react'
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
  const [selectedIndex, setSelectedIndex] = useState(0)

  // Derive autocomplete candidates from value (single render pass, no extra setState)
  const autocomplete = useMemo<{
    mode: 'slash' | 'at'
    items: AutocompleteItem[]
    anchorPos: number
  } | null>(() => {
    // Check for slash command: "/" at position 0
    if (value.startsWith('/') && !value.includes(' ')) {
      const filter = value.slice(1).split(/\s/)[0]
      const items = buildSlashItems(slashCommands, filter)
      if (items.length > 0) return { mode: 'slash', items, anchorPos: 0 }
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
          if (items.length > 0) return { mode: 'at', items, anchorPos: lastAtIdx }
        }
      }
    }

    return null
  }, [value, slashCommands, atSources, textareaRef])

  // Clamp selectedIndex when items change
  const clampedIndex = autocomplete ? Math.min(selectedIndex, autocomplete.items.length - 1) : 0

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
      setSelectedIndex(0)
      setTimeout(() => textareaRef.current?.focus(), 0)
    },
    [autocomplete, value, onChange, onAttach, textareaRef]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (autocomplete && autocomplete.items.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setSelectedIndex((prev) => (prev + 1) % autocomplete.items.length)
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setSelectedIndex(
            (prev) => (prev - 1 + autocomplete.items.length) % autocomplete.items.length
          )
          return
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault()
          handleSelect(autocomplete.items[clampedIndex])
          return
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          onChange('')
          return
        }
      }

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        if (disabled) return
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
    [autocomplete, disabled, handleSelect, onSend, onBackspaceEmpty, textareaRef]
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
        selectedIndex={clampedIndex}
        onSelect={handleSelect}
        visible={autocomplete !== null}
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
          readOnly={disabled}
          rows={1}
          style={{
            ...textareaStyle,
            opacity: disabled ? 0.6 : 1,
            cursor: disabled ? 'not-allowed' : 'text'
          }}
        />
      </div>
    </div>
  )
}
