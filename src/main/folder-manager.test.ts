import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync, writeFileSync, existsSync } from 'fs'

vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn()
}))

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/mock/userData') },
  dialog: { showOpenDialog: vi.fn() }
}))

const mockedReadFileSync = vi.mocked(readFileSync)
const mockedWriteFileSync = vi.mocked(writeFileSync)
const mockedExistsSync = vi.mocked(existsSync)

import {
  getApprovedFolders,
  addApprovedFolder,
  removeApprovedFolder,
  isPathApproved
} from './folder-manager'

describe('folder-manager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedExistsSync.mockReturnValue(false)
  })

  describe('getApprovedFolders', () => {
    it('returns empty array when file does not exist', () => {
      mockedExistsSync.mockReturnValue(false)
      expect(getApprovedFolders()).toEqual([])
    })

    it('returns parsed folders when file exists', () => {
      const folders = [{ path: '/home/user/project', label: 'project', addedAt: 1000 }]
      mockedExistsSync.mockReturnValue(true)
      mockedReadFileSync.mockReturnValue(JSON.stringify(folders) as never)
      expect(getApprovedFolders()).toEqual(folders)
    })

    it('returns empty array on corrupted JSON', () => {
      mockedExistsSync.mockReturnValue(true)
      mockedReadFileSync.mockReturnValue('not json' as never)
      expect(getApprovedFolders()).toEqual([])
    })
  })

  describe('addApprovedFolder', () => {
    it('adds a new folder and saves', () => {
      mockedExistsSync.mockReturnValue(false)
      const result = addApprovedFolder('/home/user/project')
      expect(result.path).toBe('/home/user/project')
      expect(result.label).toBe('project')
      expect(result.addedAt).toBeGreaterThan(0)
      expect(mockedWriteFileSync).toHaveBeenCalled()
    })

    it('returns existing folder without duplicating', () => {
      const existing = [{ path: '/home/user/project', label: 'project', addedAt: 1000 }]
      mockedExistsSync.mockReturnValue(true)
      mockedReadFileSync.mockReturnValue(JSON.stringify(existing) as never)

      const result = addApprovedFolder('/home/user/project')
      expect(result).toEqual(existing[0])
      // Should not write because it's a duplicate
      expect(mockedWriteFileSync).not.toHaveBeenCalled()
    })

    it('normalizes the path before adding', () => {
      mockedExistsSync.mockReturnValue(false)
      const result = addApprovedFolder('/home/user/../user/project/')
      // resolve(normalize(...)) should produce a clean path
      expect(result.path).toBe('/home/user/project')
    })
  })

  describe('removeApprovedFolder', () => {
    it('removes the specified folder and saves', () => {
      const folders = [
        { path: '/home/user/project', label: 'project', addedAt: 1000 },
        { path: '/tmp/workspace', label: 'workspace', addedAt: 2000 }
      ]
      mockedExistsSync.mockReturnValue(true)
      mockedReadFileSync.mockReturnValue(JSON.stringify(folders) as never)

      removeApprovedFolder('/home/user/project')
      expect(mockedWriteFileSync).toHaveBeenCalled()
      const saved = JSON.parse(mockedWriteFileSync.mock.calls[0][1] as string)
      expect(saved).toHaveLength(1)
      expect(saved[0].path).toBe('/tmp/workspace')
    })
  })

  describe('isPathApproved', () => {
    const folders = [{ path: '/home/user/project', label: 'project', addedAt: 1000 }]

    beforeEach(() => {
      mockedExistsSync.mockReturnValue(true)
      mockedReadFileSync.mockReturnValue(JSON.stringify(folders) as never)
    })

    it('returns true for a path inside an approved folder', () => {
      expect(isPathApproved('/home/user/project/src/index.ts')).toBe(true)
    })

    it('returns true for the approved folder itself', () => {
      expect(isPathApproved('/home/user/project')).toBe(true)
    })

    it('returns false for a path outside approved folders', () => {
      expect(isPathApproved('/etc/passwd')).toBe(false)
    })

    it('returns false for a sibling path sharing a prefix', () => {
      // /home/user/project2 should NOT match /home/user/project
      expect(isPathApproved('/home/user/project2/file.ts')).toBe(false)
    })

    it('returns false when no folders are approved', () => {
      mockedExistsSync.mockReturnValue(false)
      expect(isPathApproved('/home/user/project/file.ts')).toBe(false)
    })
  })
})
