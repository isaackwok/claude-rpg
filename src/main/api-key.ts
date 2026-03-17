import { safeStorage, app } from 'electron'
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs'
import { join } from 'path'

const KEY_FILE = 'anthropic-key.enc'

function getKeyPath(): string {
  return join(app.getPath('userData'), KEY_FILE)
}

export function storeApiKey(key: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Encryption not available on this system')
  }
  const encrypted = safeStorage.encryptString(key)
  writeFileSync(getKeyPath(), encrypted)
}

export function getApiKey(): string | null {
  const keyPath = getKeyPath()
  if (!existsSync(keyPath)) return null
  if (!safeStorage.isEncryptionAvailable()) {
    console.error('[api-key] safeStorage encryption not available, cannot decrypt stored key')
    return null
  }
  try {
    const encrypted = readFileSync(keyPath)
    return safeStorage.decryptString(encrypted)
  } catch (err) {
    console.error('[api-key] Failed to decrypt stored API key:', err)
    return null
  }
}

export function hasApiKey(): boolean {
  return existsSync(getKeyPath())
}

export function clearApiKey(): void {
  const keyPath = getKeyPath()
  if (existsSync(keyPath)) unlinkSync(keyPath)
}
