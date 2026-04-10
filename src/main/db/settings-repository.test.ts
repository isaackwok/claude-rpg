import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from './migrations'
import { SqliteSettingsRepository } from './settings-repository'

describe('SqliteSettingsRepository', () => {
  let db: Database.Database
  let repo: SqliteSettingsRepository

  beforeEach(() => {
    db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    runMigrations(db)
    repo = new SqliteSettingsRepository(db)
  })

  afterEach(() => db.close())

  it('returns default auth_type when not set', () => {
    expect(repo.getAuthType()).toBe('api_key')
  })

  it('returns default model when not set', () => {
    expect(repo.getModel()).toBe('claude-sonnet-4-6')
  })

  it('returns default locale when not set', () => {
    expect(repo.getLocale()).toBe('zh-TW')
  })

  it('sets and gets auth_type', () => {
    repo.setAuthType('claude_cli')
    expect(repo.getAuthType()).toBe('claude_cli')
  })

  it('sets and gets model', () => {
    repo.setModel('claude-opus-4-6')
    expect(repo.getModel()).toBe('claude-opus-4-6')
  })

  it('sets and gets locale', () => {
    repo.setLocale('en')
    expect(repo.getLocale()).toBe('en')
  })

  it('getAll returns all settings with defaults', () => {
    const all = repo.getAll()
    expect(all).toEqual({
      auth_type: 'api_key',
      model: 'claude-sonnet-4-6',
      locale: 'zh-TW'
    })
  })

  it('getAll reflects updates', () => {
    repo.setAuthType('claude_cli')
    repo.setModel('claude-opus-4-6')
    repo.setLocale('en')
    const all = repo.getAll()
    expect(all).toEqual({
      auth_type: 'claude_cli',
      model: 'claude-opus-4-6',
      locale: 'en'
    })
  })

  it('set overwrites existing value', () => {
    repo.setModel('claude-opus-4-6')
    repo.setModel('claude-haiku-4-5-20251001')
    expect(repo.getModel()).toBe('claude-haiku-4-5-20251001')
  })
})
