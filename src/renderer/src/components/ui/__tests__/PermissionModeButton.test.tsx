// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { PermissionModeButton } from '../PermissionModeButton'

afterEach(cleanup)

// Mock useTranslation
vi.mock('../../../i18n', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'permissionMode.default': 'Default Mode',
        'permissionMode.acceptEdits': 'Accept Edits',
        'permissionMode.auto': 'Auto Mode',
        'permissionMode.plan': 'Plan Mode',
        'permissionMode.requiresMax': 'Requires Max subscription'
      }
      return map[key] ?? key
    }
  })
}))

describe('PermissionModeButton', () => {
  it('renders the current mode icon', () => {
    render(<PermissionModeButton currentMode="auto" onModeChange={vi.fn()} disabled={false} />)
    expect(screen.getByTitle('Auto Mode')).toBeTruthy()
  })

  it('opens dropdown on click and shows all modes', () => {
    render(<PermissionModeButton currentMode="default" onModeChange={vi.fn()} disabled={false} />)
    fireEvent.click(screen.getByTitle('Default Mode'))
    expect(screen.getByText('Accept Edits')).toBeTruthy()
    expect(screen.getByText('Auto Mode')).toBeTruthy()
    expect(screen.getByText('Plan Mode')).toBeTruthy()
  })

  it('calls onModeChange when a mode is selected', () => {
    const onModeChange = vi.fn()
    render(
      <PermissionModeButton currentMode="default" onModeChange={onModeChange} disabled={false} />
    )
    fireEvent.click(screen.getByTitle('Default Mode'))
    fireEvent.mouseDown(screen.getByText('Auto Mode'))
    expect(onModeChange).toHaveBeenCalledWith('auto')
  })

  it('does not open dropdown when disabled', () => {
    render(<PermissionModeButton currentMode="default" onModeChange={vi.fn()} disabled={true} />)
    fireEvent.click(screen.getByTitle('Default Mode'))
    expect(screen.queryByText('Auto Mode')).toBeNull()
  })

  it('does not call onModeChange for disabled modes', () => {
    const onModeChange = vi.fn()
    render(
      <PermissionModeButton
        currentMode="default"
        onModeChange={onModeChange}
        disabled={false}
        disabledModes={['auto']}
      />
    )
    fireEvent.click(screen.getByTitle('Default Mode'))
    fireEvent.mouseDown(screen.getByText('Auto Mode'))
    expect(onModeChange).not.toHaveBeenCalled()
  })
})
