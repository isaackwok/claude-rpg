import type Database from 'better-sqlite3'
import type { AuthType, Locale, SettingsMap } from '../../shared/types'

const DEFAULTS: SettingsMap = {
  auth_type: 'api_key',
  model: 'claude-sonnet-4-6',
  locale: 'zh-TW'
}

export class SqliteSettingsRepository {
  constructor(private db: Database.Database) {}

  private get(key: string): string | undefined {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
      | { value: string }
      | undefined
    return row?.value
  }

  private set(key: string, value: string): void {
    this.db
      .prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?'
      )
      .run(key, value, value)
  }

  getAuthType(): AuthType {
    return (this.get('auth_type') as AuthType) ?? DEFAULTS.auth_type
  }

  setAuthType(value: AuthType): void {
    this.set('auth_type', value)
  }

  getModel(): string {
    return this.get('model') ?? DEFAULTS.model
  }

  setModel(value: string): void {
    this.set('model', value)
  }

  getLocale(): Locale {
    return (this.get('locale') as Locale) ?? DEFAULTS.locale
  }

  setLocale(value: Locale): void {
    this.set('locale', value)
  }

  getAll(): SettingsMap {
    return {
      auth_type: this.getAuthType(),
      model: this.getModel(),
      locale: this.getLocale()
    }
  }
}
