// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { SmartInput } from '../SmartInput'

afterEach(cleanup)

describe('SmartInput', () => {
  const defaultProps = {
    value: '',
    onChange: vi.fn(),
    onSend: vi.fn(),
    onAttach: vi.fn(),
    disabled: false,
    placeholder: 'Type...',
    slashCommands: [
      { name: 'brainstorm', description: 'Brainstorm ideas' },
      { name: 'simplify', description: 'Simplify code' }
    ],
    atSources: [{ type: 'npc' as const, id: 'wizard', label: 'wizard', secondary: '巫師 瑪琳' }]
  }

  it('renders a textarea', () => {
    render(<SmartInput {...defaultProps} />)
    expect(screen.getByPlaceholderText('Type...')).toBeTruthy()
  })

  it('shows slash autocomplete when "/" is typed at position 0', () => {
    render(<SmartInput {...defaultProps} value="/" />)
    const textarea = screen.getByPlaceholderText('Type...')
    fireEvent.change(textarea, { target: { value: '/' } })
    // AutocompletePopup should be visible with slash commands
    expect(screen.getByText('/brainstorm')).toBeTruthy()
  })

  it('does not show slash autocomplete for "/" mid-text', () => {
    render(<SmartInput {...defaultProps} value="hello /" />)
    expect(screen.queryByText('/brainstorm')).toBeNull()
  })

  it('calls onSend on Enter without Shift', () => {
    const onSend = vi.fn()
    render(<SmartInput {...defaultProps} onSend={onSend} value="hello" />)
    const textarea = screen.getByPlaceholderText('Type...')
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
    expect(onSend).toHaveBeenCalled()
  })
})
