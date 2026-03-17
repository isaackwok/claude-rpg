import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: vi.fn(),
    encryptString: vi.fn(),
    decryptString: vi.fn()
  },
  app: {
    getPath: vi.fn(() => '/mock/userData')
  }
}))

vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  unlinkSync: vi.fn()
}))

import { storeApiKey, getApiKey, hasApiKey, clearApiKey } from './api-key'
import { safeStorage } from 'electron'
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs'

const mockedSafeStorage = vi.mocked(safeStorage)
const mockedExistsSync = vi.mocked(existsSync)
const mockedReadFileSync = vi.mocked(readFileSync)
const mockedWriteFileSync = vi.mocked(writeFileSync)
const mockedUnlinkSync = vi.mocked(unlinkSync)

describe('api-key', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('storeApiKey', () => {
    it('encrypts and writes the key when encryption is available', () => {
      mockedSafeStorage.isEncryptionAvailable.mockReturnValue(true)
      const fakeEncrypted = Buffer.from('encrypted-data')
      mockedSafeStorage.encryptString.mockReturnValue(fakeEncrypted)

      storeApiKey('sk-ant-test-key')

      expect(mockedSafeStorage.encryptString).toHaveBeenCalledWith('sk-ant-test-key')
      expect(mockedWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('anthropic-key.enc'),
        fakeEncrypted
      )
    })

    it('throws when encryption is not available', () => {
      mockedSafeStorage.isEncryptionAvailable.mockReturnValue(false)

      expect(() => storeApiKey('sk-ant-test-key')).toThrow('Encryption not available')
      expect(mockedWriteFileSync).not.toHaveBeenCalled()
    })

    it('propagates writeFileSync errors', () => {
      mockedSafeStorage.isEncryptionAvailable.mockReturnValue(true)
      mockedSafeStorage.encryptString.mockReturnValue(Buffer.from('data'))
      mockedWriteFileSync.mockImplementation(() => {
        throw new Error('ENOSPC: no space left on device')
      })

      expect(() => storeApiKey('sk-ant-test-key')).toThrow('ENOSPC')
    })
  })

  describe('getApiKey', () => {
    it('returns null when key file does not exist', () => {
      mockedExistsSync.mockReturnValue(false)

      expect(getApiKey()).toBeNull()
      expect(mockedReadFileSync).not.toHaveBeenCalled()
    })

    it('returns null when encryption is not available', () => {
      mockedExistsSync.mockReturnValue(true)
      mockedSafeStorage.isEncryptionAvailable.mockReturnValue(false)

      expect(getApiKey()).toBeNull()
      expect(mockedReadFileSync).not.toHaveBeenCalled()
    })

    it('decrypts and returns the key when file exists and encryption is available', () => {
      mockedExistsSync.mockReturnValue(true)
      mockedSafeStorage.isEncryptionAvailable.mockReturnValue(true)
      const fakeEncrypted = Buffer.from('encrypted-data')
      mockedReadFileSync.mockReturnValue(fakeEncrypted)
      mockedSafeStorage.decryptString.mockReturnValue('sk-ant-decrypted')

      expect(getApiKey()).toBe('sk-ant-decrypted')
      expect(mockedReadFileSync).toHaveBeenCalledWith(expect.stringContaining('anthropic-key.enc'))
      expect(mockedSafeStorage.decryptString).toHaveBeenCalledWith(fakeEncrypted)
    })

    it('returns null when readFileSync throws (corrupted file)', () => {
      mockedExistsSync.mockReturnValue(true)
      mockedSafeStorage.isEncryptionAvailable.mockReturnValue(true)
      mockedReadFileSync.mockImplementation(() => {
        throw new Error('EACCES: permission denied')
      })

      expect(getApiKey()).toBeNull()
    })

    it('returns null when decryptString throws (keyring changed)', () => {
      mockedExistsSync.mockReturnValue(true)
      mockedSafeStorage.isEncryptionAvailable.mockReturnValue(true)
      mockedReadFileSync.mockReturnValue(Buffer.from('corrupted'))
      mockedSafeStorage.decryptString.mockImplementation(() => {
        throw new Error('Error while decrypting the ciphertext')
      })

      expect(getApiKey()).toBeNull()
    })
  })

  describe('hasApiKey', () => {
    it('returns true when key file exists', () => {
      mockedExistsSync.mockReturnValue(true)
      expect(hasApiKey()).toBe(true)
    })

    it('returns false when key file does not exist', () => {
      mockedExistsSync.mockReturnValue(false)
      expect(hasApiKey()).toBe(false)
    })
  })

  describe('clearApiKey', () => {
    it('deletes the key file when it exists', () => {
      mockedExistsSync.mockReturnValue(true)

      clearApiKey()

      expect(mockedUnlinkSync).toHaveBeenCalledWith(expect.stringContaining('anthropic-key.enc'))
    })

    it('does nothing when key file does not exist', () => {
      mockedExistsSync.mockReturnValue(false)

      clearApiKey()

      expect(mockedUnlinkSync).not.toHaveBeenCalled()
    })
  })
})
