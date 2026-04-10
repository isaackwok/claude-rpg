import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from '../../i18n'
import type { SettingsMap, Locale } from '../../../../shared/types'

type TabId = 'auth' | 'model' | 'language'

const TABS: TabId[] = ['auth', 'model', 'language']

const MODELS = [
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
  { id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' }
]

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const { t, setLocale } = useTranslation()
  const [activeTab, setActiveTab] = useState<TabId>('auth')
  const [settings, setSettings] = useState<SettingsMap | null>(null)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [apiKeyStatus, setApiKeyStatus] = useState<'idle' | 'validating' | 'saved' | 'invalid'>(
    'idle'
  )
  const [cliStatus, setCliStatus] = useState<{
    installed: boolean
    authenticated: boolean
  } | null>(null)

  // Load settings on mount
  useEffect(() => {
    window.api.getSettings().then(setSettings)
  }, [])

  // Check CLI status when switching to claude_cli
  const checkCliStatus = useCallback(async () => {
    const status = await window.api.checkCli()
    setCliStatus(status)
  }, [])

  // Listen for settings changes from main process
  useEffect(() => {
    const cleanup = window.api.onSettingsChanged(({ key, value }) => {
      setSettings((prev) => (prev ? { ...prev, [key]: value } : prev))
    })
    return cleanup
  }, [])

  const updateSetting = useCallback(
    async (key: string, value: string) => {
      await window.api.setSetting(key, value)
      setSettings((prev) => (prev ? { ...prev, [key]: value } : prev))

      if (key === 'locale') {
        setLocale(value as Locale)
      }
      if (key === 'auth_type' && value === 'claude_cli') {
        checkCliStatus()
      }
    },
    [setLocale, checkCliStatus]
  )

  const handleSaveApiKey = useCallback(async () => {
    if (!apiKeyInput.trim()) return
    setApiKeyStatus('validating')
    const result = await window.api.validateApiKey(apiKeyInput.trim())
    if (result.valid) {
      await window.api.setApiKey(apiKeyInput.trim())
      setApiKeyStatus('saved')
      setApiKeyInput('')
    } else {
      setApiKeyStatus('invalid')
    }
  }, [apiKeyInput])

  if (!settings) return null

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.6)',
        pointerEvents: 'auto',
        zIndex: 1000
      }}
      onClick={onClose}
    >
      <div
        style={{
          position: 'relative',
          background: 'rgba(10, 10, 30, 0.96)',
          border: '3px solid rgba(200, 180, 140, 0.6)',
          borderRadius: 12,
          width: 600,
          height: 420,
          display: 'flex',
          fontFamily: 'monospace',
          color: '#e8d5a8',
          overflow: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            width: 28,
            height: 28,
            borderRadius: 4,
            background: 'transparent',
            border: '1px solid rgba(200, 180, 140, 0.2)',
            color: '#a89060',
            fontSize: 14,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          ✕
        </button>

        {/* Sidebar */}
        <div
          style={{
            width: 120,
            borderRight: '1px solid rgba(200, 180, 140, 0.2)',
            padding: '16px 0'
          }}
        >
          <div
            style={{
              textAlign: 'center',
              fontSize: 16,
              color: '#c4a46c',
              padding: '8px 0 16px',
              borderBottom: '1px solid rgba(200, 180, 140, 0.15)'
            }}
          >
            {t('settings.title')}
          </div>
          {TABS.map((tab) => (
            <div
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '10px 16px',
                cursor: 'pointer',
                fontSize: 13,
                color: activeTab === tab ? '#c4a46c' : '#a89060',
                background: activeTab === tab ? 'rgba(200, 180, 140, 0.15)' : 'transparent',
                borderLeft: activeTab === tab ? '2px solid #c4a46c' : '2px solid transparent',
                transition: 'all 0.15s'
              }}
            >
              {t(`settings.tabs.${tab}`)}
            </div>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
          {activeTab === 'auth' && (
            <AuthTabContent
              settings={settings}
              apiKeyInput={apiKeyInput}
              apiKeyStatus={apiKeyStatus}
              cliStatus={cliStatus}
              onUpdateSetting={updateSetting}
              onApiKeyInputChange={setApiKeyInput}
              onSaveApiKey={handleSaveApiKey}
              onCheckCli={checkCliStatus}
              t={t}
            />
          )}
          {activeTab === 'model' && (
            <ModelTabContent settings={settings} onUpdateSetting={updateSetting} t={t} />
          )}
          {activeTab === 'language' && (
            <LanguageTabContent settings={settings} onUpdateSetting={updateSetting} t={t} />
          )}
        </div>
      </div>
    </div>
  )
}

// ── Tab Content Components ──────────────────────────────────────

function AuthTabContent({
  settings,
  apiKeyInput,
  apiKeyStatus,
  cliStatus,
  onUpdateSetting,
  onApiKeyInputChange,
  onSaveApiKey,
  onCheckCli,
  t
}: {
  settings: SettingsMap
  apiKeyInput: string
  apiKeyStatus: 'idle' | 'validating' | 'saved' | 'invalid'
  cliStatus: { installed: boolean; authenticated: boolean } | null
  onUpdateSetting: (key: string, value: string) => void
  onApiKeyInputChange: (value: string) => void
  onSaveApiKey: () => void
  onCheckCli: () => void
  t: (key: string) => string
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          color: '#a89060',
          textTransform: 'uppercase',
          letterSpacing: 1,
          marginBottom: 12
        }}
      >
        {t('settings.auth.label')}
      </div>

      {/* API Key option */}
      <label
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          padding: 12,
          background: settings.auth_type === 'api_key' ? 'rgba(200, 180, 140, 0.1)' : 'transparent',
          border: `1px solid ${settings.auth_type === 'api_key' ? 'rgba(200, 180, 140, 0.4)' : 'rgba(200, 180, 140, 0.15)'}`,
          borderRadius: 6,
          cursor: 'pointer',
          marginBottom: 8
        }}
      >
        <input
          type="radio"
          name="auth_type"
          checked={settings.auth_type === 'api_key'}
          onChange={() => onUpdateSetting('auth_type', 'api_key')}
          style={{ marginTop: 2 }}
        />
        <div>
          <div style={{ fontSize: 14 }}>{t('settings.auth.apiKey')}</div>
          <div style={{ fontSize: 11, color: '#a89060', marginTop: 2 }}>
            {t('settings.auth.apiKeyDescription')}
          </div>
        </div>
      </label>

      {/* API Key input (shown when api_key is selected) */}
      {settings.auth_type === 'api_key' && (
        <div style={{ marginLeft: 24, marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input
              type="password"
              value={apiKeyInput}
              onChange={(e) => onApiKeyInputChange(e.target.value)}
              placeholder={t('settings.auth.apiKeyPlaceholder')}
              style={{
                flex: 1,
                background: 'rgba(200, 180, 140, 0.08)',
                border: '1px solid rgba(200, 180, 140, 0.25)',
                borderRadius: 4,
                padding: '6px 8px',
                color: '#e8d5a8',
                fontFamily: 'monospace',
                fontSize: 12
              }}
            />
            <button
              onClick={onSaveApiKey}
              disabled={!apiKeyInput.trim() || apiKeyStatus === 'validating'}
              style={{
                padding: '6px 14px',
                background: 'rgba(200, 180, 140, 0.15)',
                border: '1px solid rgba(200, 180, 140, 0.3)',
                borderRadius: 4,
                color: '#c4a46c',
                cursor: 'pointer',
                fontSize: 12,
                fontFamily: 'monospace'
              }}
            >
              {apiKeyStatus === 'validating' ? t('settings.auth.validating') : t('apiKey.save')}
            </button>
          </div>
          {apiKeyStatus === 'saved' && (
            <div style={{ fontSize: 11, color: '#4ade80', marginTop: 6 }}>
              {t('settings.auth.apiKeySaved')}
            </div>
          )}
          {apiKeyStatus === 'invalid' && (
            <div style={{ fontSize: 11, color: '#f87171', marginTop: 6 }}>
              {t('settings.auth.apiKeyInvalid')}
            </div>
          )}
        </div>
      )}

      {/* Claude CLI option */}
      <label
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          padding: 12,
          background:
            settings.auth_type === 'claude_cli' ? 'rgba(200, 180, 140, 0.1)' : 'transparent',
          border: `1px solid ${settings.auth_type === 'claude_cli' ? 'rgba(200, 180, 140, 0.4)' : 'rgba(200, 180, 140, 0.15)'}`,
          borderRadius: 6,
          cursor: 'pointer'
        }}
      >
        <input
          type="radio"
          name="auth_type"
          checked={settings.auth_type === 'claude_cli'}
          onChange={() => onUpdateSetting('auth_type', 'claude_cli')}
          style={{ marginTop: 2 }}
        />
        <div>
          <div style={{ fontSize: 14 }}>{t('settings.auth.claudeCli')}</div>
          <div style={{ fontSize: 11, color: '#a89060', marginTop: 2 }}>
            {t('settings.auth.claudeCliDescription')}
          </div>
        </div>
      </label>

      {/* CLI status (shown when claude_cli is selected) */}
      {settings.auth_type === 'claude_cli' && (
        <div style={{ marginLeft: 24, marginTop: 8 }}>
          {cliStatus === null ? (
            <button
              onClick={onCheckCli}
              style={{
                padding: '6px 14px',
                background: 'rgba(200, 180, 140, 0.15)',
                border: '1px solid rgba(200, 180, 140, 0.3)',
                borderRadius: 4,
                color: '#c4a46c',
                cursor: 'pointer',
                fontSize: 12,
                fontFamily: 'monospace'
              }}
            >
              {t('settings.auth.checkCliStatus')}
            </button>
          ) : !cliStatus.installed ? (
            <div style={{ fontSize: 11, color: '#f87171' }}>
              {t('settings.auth.cliNotInstalled')}
            </div>
          ) : !cliStatus.authenticated ? (
            <div style={{ fontSize: 11, color: '#fbbf24' }}>
              {t('settings.auth.cliNotAuthenticated')}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: '#4ade80' }}>{t('settings.auth.cliReady')}</div>
          )}
        </div>
      )}
    </div>
  )
}

function ModelTabContent({
  settings,
  onUpdateSetting,
  t
}: {
  settings: SettingsMap
  onUpdateSetting: (key: string, value: string) => void
  t: (key: string) => string
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          color: '#a89060',
          textTransform: 'uppercase',
          letterSpacing: 1,
          marginBottom: 4
        }}
      >
        {t('settings.model.label')}
      </div>
      <div style={{ fontSize: 11, color: '#a89060', marginBottom: 16 }}>
        {t('settings.model.description')}
      </div>
      <select
        value={settings.model}
        onChange={(e) => onUpdateSetting('model', e.target.value)}
        style={{
          width: '100%',
          padding: '10px 12px',
          background: 'rgba(200, 180, 140, 0.08)',
          border: '1px solid rgba(200, 180, 140, 0.25)',
          borderRadius: 6,
          color: '#e8d5a8',
          fontFamily: 'monospace',
          fontSize: 13,
          cursor: 'pointer'
        }}
      >
        {MODELS.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
    </div>
  )
}

function LanguageTabContent({
  settings,
  onUpdateSetting,
  t
}: {
  settings: SettingsMap
  onUpdateSetting: (key: string, value: string) => void
  t: (key: string) => string
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          color: '#a89060',
          textTransform: 'uppercase',
          letterSpacing: 1,
          marginBottom: 4
        }}
      >
        {t('settings.language.label')}
      </div>
      <div style={{ fontSize: 11, color: '#a89060', marginBottom: 16 }}>
        {t('settings.language.description')}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {(
          [
            { value: 'zh-TW', label: 'settings.language.zhTW' },
            { value: 'en', label: 'settings.language.en' }
          ] as const
        ).map(({ value, label }) => (
          <button
            key={value}
            onClick={() => onUpdateSetting('locale', value)}
            style={{
              flex: 1,
              padding: '12px 16px',
              background:
                settings.locale === value
                  ? 'rgba(200, 180, 140, 0.15)'
                  : 'rgba(200, 180, 140, 0.05)',
              border: `${settings.locale === value ? '2px' : '1px'} solid ${settings.locale === value ? '#c4a46c' : 'rgba(200, 180, 140, 0.2)'}`,
              borderRadius: 6,
              color: settings.locale === value ? '#e8d5a8' : '#a89060',
              cursor: 'pointer',
              fontFamily: 'monospace',
              fontSize: 14
            }}
          >
            {t(label)}
          </button>
        ))}
      </div>
    </div>
  )
}
