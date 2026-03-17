import { useState, useCallback } from 'react'
import { useTranslation } from '../../i18n'

interface ApiKeyModalProps {
  onClose: () => void
  onSaved: () => void
}

export function ApiKeyModal({ onClose, onSaved }: ApiKeyModalProps) {
  const { t } = useTranslation()
  const [key, setKey] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = useCallback(async () => {
    if (!key.trim()) return
    setSaving(true)
    setError('')
    try {
      const ok = await window.api.setApiKey(key.trim())
      if (ok) {
        onSaved()
      } else {
        setError(t('dialogue.apiKeyInvalid'))
      }
    } catch (err) {
      console.error('[ApiKeyModal] Failed to save API key:', err)
      setError(t('dialogue.connectionError'))
    } finally {
      setSaving(false)
    }
  }, [key, t, onSaved])

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)',
        pointerEvents: 'auto',
        zIndex: 100
      }}
    >
      <div
        style={{
          background: 'rgba(10, 10, 30, 0.95)',
          border: '3px solid rgba(200, 180, 140, 0.6)',
          padding: '24px',
          fontFamily: 'monospace',
          color: '#ffffff',
          width: 420,
          maxWidth: '90%'
        }}
      >
        <h3 style={{ color: '#c4a46c', margin: '0 0 12px' }}>{t('apiKey.title')}</h3>
        <p style={{ fontSize: 14, marginBottom: 12 }}>{t('apiKey.prompt')}</p>
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={t('apiKey.placeholder')}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          style={{
            width: '100%',
            padding: '8px',
            fontFamily: 'monospace',
            fontSize: 14,
            background: 'rgba(255,255,255,0.1)',
            border: '1px solid rgba(200,180,140,0.4)',
            color: '#fff',
            boxSizing: 'border-box'
          }}
        />
        {error && <p style={{ color: '#ff6b6b', fontSize: 12, marginTop: 4 }}>{error}</p>}
        <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '6px 16px',
              fontFamily: 'monospace',
              background: 'transparent',
              border: '1px solid rgba(200,180,140,0.4)',
              color: '#aaa',
              cursor: 'pointer'
            }}
          >
            {t('apiKey.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !key.trim()}
            style={{
              padding: '6px 16px',
              fontFamily: 'monospace',
              background: 'rgba(200,180,140,0.3)',
              border: '1px solid rgba(200,180,140,0.6)',
              color: '#c4a46c',
              cursor: saving ? 'wait' : 'pointer'
            }}
          >
            {t('apiKey.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
