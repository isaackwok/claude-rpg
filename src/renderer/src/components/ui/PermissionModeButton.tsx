import { useState, useEffect, useRef, type CSSProperties } from 'react'
import { useTranslation } from '../../i18n'
import {
  UI_PERMISSION_MODES,
  PERMISSION_MODE_ICONS,
  type UIPermissionMode
} from '../../../../shared/dialogue-control-types'

interface PermissionModeButtonProps {
  currentMode: UIPermissionMode
  onModeChange: (mode: UIPermissionMode) => void
  disabled: boolean
  disabledModes?: UIPermissionMode[]
}

const btnSize = 30

export function PermissionModeButton({
  currentMode,
  onModeChange,
  disabled,
  disabledModes = []
}: PermissionModeButtonProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const buttonStyle: CSSProperties = {
    width: btnSize,
    height: btnSize,
    boxSizing: 'border-box',
    padding: 0,
    fontFamily: 'monospace',
    fontSize: 14,
    lineHeight: `${btnSize - 2}px`,
    textAlign: 'center',
    background: open ? 'rgba(200,180,140,0.35)' : 'rgba(200,180,140,0.15)',
    border: '1px solid rgba(200,180,140,0.4)',
    color: '#c4a46c',
    cursor: disabled ? 'not-allowed' : 'pointer',
    borderRadius: 3,
    flexShrink: 0,
    transition: 'background 0.15s'
  }

  const dropdownStyle: CSSProperties = {
    position: 'absolute',
    bottom: btnSize + 4,
    right: 0,
    minWidth: 200,
    background: 'rgba(20, 20, 40, 0.98)',
    border: '1px solid rgba(200, 180, 140, 0.4)',
    borderRadius: 4,
    padding: '4px 0',
    zIndex: 20,
    boxShadow: '0 -4px 12px rgba(0,0,0,0.4)'
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', flexShrink: 0 }}>
      {open && (
        <div style={dropdownStyle}>
          <div
            style={{
              padding: '4px 10px',
              fontSize: 11,
              color: 'rgba(200, 180, 140, 0.6)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              fontFamily: 'monospace'
            }}
          >
            {t('permissionMode.label')}
          </div>
          {UI_PERMISSION_MODES.map((mode) => {
            const isModeDisabled = disabledModes.includes(mode)
            return (
              <div
                key={mode}
                onMouseDown={(e) => {
                  e.preventDefault()
                  if (isModeDisabled) return
                  onModeChange(mode)
                  setOpen(false)
                }}
                onClick={() => {
                  if (isModeDisabled) return
                  onModeChange(mode)
                  setOpen(false)
                }}
                title={isModeDisabled ? t('permissionMode.requiresMax') : undefined}
                style={{
                  padding: '6px 10px',
                  cursor: isModeDisabled ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: mode === currentMode ? 'rgba(200, 180, 140, 0.12)' : 'transparent',
                  opacity: isModeDisabled ? 0.4 : 1,
                  fontFamily: 'monospace',
                  fontSize: 13,
                  whiteSpace: 'nowrap'
                }}
              >
                <span style={{ width: 20, textAlign: 'center', fontSize: 14, flexShrink: 0 }}>
                  {PERMISSION_MODE_ICONS[mode]}
                </span>
                <span style={{ color: '#e8d5a8' }}>{t(`permissionMode.${mode}`)}</span>
                {mode === currentMode && (
                  <span style={{ marginLeft: 'auto', color: '#c4a46c', fontSize: 11 }}>✓</span>
                )}
              </div>
            )
          })}
        </div>
      )}
      <button
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        style={buttonStyle}
        title={t(`permissionMode.${currentMode}`)}
      >
        {PERMISSION_MODE_ICONS[currentMode]}
      </button>
    </div>
  )
}
