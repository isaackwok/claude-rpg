import { useState } from 'react'
import { useTranslation } from '../../i18n'

interface ProjectDirectoryModalProps {
  onComplete: (directory: string) => void
}

export function ProjectDirectoryModal({ onComplete }: ProjectDirectoryModalProps) {
  const { t } = useTranslation()
  const [selectedDir, setSelectedDir] = useState<string | null>(null)

  const handleSelect = async () => {
    const dir = await window.api.selectProjectDirectory()
    if (dir) setSelectedDir(dir)
  }

  const handleConfirm = () => {
    if (selectedDir) onComplete(selectedDir)
  }

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.75)',
        pointerEvents: 'auto',
        zIndex: 200
      }}
    >
      <div
        style={{
          background: 'rgba(10, 10, 30, 0.96)',
          border: '3px solid rgba(200, 180, 140, 0.6)',
          padding: '32px',
          fontFamily: 'monospace',
          color: '#ffffff',
          width: 480,
          maxWidth: '90%'
        }}
      >
        {/* Title */}
        <h2
          style={{
            color: '#c4a46c',
            margin: '0 0 16px',
            fontSize: 20,
            fontFamily: 'monospace',
            letterSpacing: 1
          }}
        >
          {t('onboarding.projectDir.title')}
        </h2>

        {/* Description */}
        <p
          style={{
            fontSize: 14,
            color: '#e8d5a8',
            lineHeight: 1.6,
            margin: '0 0 24px'
          }}
        >
          {t('onboarding.projectDir.description')}
        </p>

        {/* Folder picker button */}
        <button
          onClick={handleSelect}
          style={{
            display: 'block',
            width: '100%',
            padding: '10px 16px',
            fontFamily: 'monospace',
            fontSize: 14,
            background: 'rgba(200, 180, 140, 0.08)',
            border: '1px solid rgba(200, 180, 140, 0.4)',
            color: '#c4a46c',
            cursor: 'pointer',
            textAlign: 'left',
            marginBottom: 12
          }}
        >
          📁 {t('onboarding.projectDir.selectButton')}
        </button>

        {/* Selected directory display */}
        {selectedDir && (
          <div
            style={{
              padding: '8px 12px',
              background: 'rgba(200, 180, 140, 0.08)',
              border: '1px solid rgba(200, 180, 140, 0.25)',
              borderRadius: 3,
              marginBottom: 20,
              fontSize: 13,
              color: 'rgba(255,255,255,0.7)',
              wordBreak: 'break-all'
            }}
          >
            <span style={{ color: '#a89060', marginRight: 6 }}>
              {t('onboarding.projectDir.selected')}
            </span>
            {selectedDir}
          </div>
        )}

        {/* Confirm button */}
        <div
          style={{ display: 'flex', justifyContent: 'flex-end', marginTop: selectedDir ? 0 : 20 }}
        >
          <button
            onClick={handleConfirm}
            disabled={!selectedDir}
            style={{
              padding: '8px 24px',
              fontFamily: 'monospace',
              fontSize: 14,
              background: selectedDir ? 'rgba(200, 180, 140, 0.3)' : 'rgba(100, 100, 100, 0.2)',
              border: `1px solid ${selectedDir ? 'rgba(200, 180, 140, 0.6)' : 'rgba(150, 150, 150, 0.3)'}`,
              color: selectedDir ? '#c4a46c' : 'rgba(255,255,255,0.3)',
              cursor: selectedDir ? 'pointer' : 'not-allowed'
            }}
          >
            {t('onboarding.projectDir.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
