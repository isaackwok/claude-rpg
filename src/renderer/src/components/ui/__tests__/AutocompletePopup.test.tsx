// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { AutocompletePopup } from '../AutocompletePopup'
import type { AutocompleteItem } from '../../../../../shared/dialogue-control-types'

const items: AutocompleteItem[] = [
  { type: 'slash', id: 'brainstorm', label: '/brainstorm', description: 'Brainstorm ideas' },
  { type: 'slash', id: 'simplify', label: '/simplify', description: 'Simplify code' }
]

describe('AutocompletePopup', () => {
  afterEach(cleanup)

  it('renders nothing when not visible', () => {
    const { container } = render(
      <AutocompletePopup items={items} selectedIndex={0} onSelect={vi.fn()} visible={false} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders items when visible', () => {
    render(<AutocompletePopup items={items} selectedIndex={0} onSelect={vi.fn()} visible={true} />)
    expect(screen.getByText('/brainstorm')).toBeTruthy()
    expect(screen.getByText('/simplify')).toBeTruthy()
  })

  it('highlights the selected index', () => {
    render(<AutocompletePopup items={items} selectedIndex={1} onSelect={vi.fn()} visible={true} />)
    const selected = screen.getByText('/simplify').closest('[data-selected]')
    expect(selected?.getAttribute('data-selected')).toBe('true')
  })

  it('calls onSelect when item is clicked', () => {
    const onSelect = vi.fn()
    render(<AutocompletePopup items={items} selectedIndex={0} onSelect={onSelect} visible={true} />)
    screen.getByText('/simplify').click()
    expect(onSelect).toHaveBeenCalledWith(items[1])
  })
})
