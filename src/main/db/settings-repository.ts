import type Database from 'better-sqlite3'
import type { AuthType, Locale, PermissionMode, SettingsMap } from '../../shared/types'

const DEFAULTS: SettingsMap = {
  auth_type: 'api_key',
  model: 'claude-sonnet-4-6',
  locale: 'zh-TW',
  permission_mode: 'acceptEdits',
  project_directory: ''
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

  getPermissionMode(): PermissionMode {
    return (this.get('permission_mode') as PermissionMode) ?? DEFAULTS.permission_mode
  }

  setPermissionMode(value: PermissionMode): void {
    this.set('permission_mode', value)
  }

  getProjectDirectory(): string {
    return this.get('project_directory') ?? ''
  }

  setProjectDirectory(value: string): void {
    this.set('project_directory', value)
  }

  getAll(): SettingsMap {
    return {
      auth_type: this.getAuthType(),
      model: this.getModel(),
      locale: this.getLocale(),
      permission_mode: this.getPermissionMode(),
      project_directory: this.getProjectDirectory()
    }
  }
}
