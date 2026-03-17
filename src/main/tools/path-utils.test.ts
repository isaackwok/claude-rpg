import { describe, it, expect, vi, beforeEach } from 'vitest'
import { realpathSync } from 'fs'
import { resolveSandboxedPath, getParentFolder } from './path-utils'

vi.mock('fs', () => ({
  realpathSync: vi.fn((p: string) => p)
}))

const mockedRealpathSync = vi.mocked(realpathSync)

describe('resolveSandboxedPath', () => {
  const approved = ['/home/user/project', '/tmp/workspace']

  beforeEach(() => {
    vi.clearAllMocks()
    mockedRealpathSync.mockImplementation((p: string) => p as never)
  })

  it('accepts a path inside an approved folder', () => {
    expect(resolveSandboxedPath('/home/user/project/src/index.ts', approved)).toBe(
      '/home/user/project/src/index.ts'
    )
  })

  it('accepts a path exactly matching an approved folder', () => {
    expect(resolveSandboxedPath('/home/user/project', approved)).toBe('/home/user/project')
  })

  it('rejects a path outside all approved folders', () => {
    expect(resolveSandboxedPath('/etc/passwd', approved)).toBeNull()
  })

  it('rejects a sibling path that shares a prefix', () => {
    // /home/user/project2 should NOT match /home/user/project
    expect(resolveSandboxedPath('/home/user/project2/file.ts', approved)).toBeNull()
  })

  it('rejects path traversal via ../', () => {
    // resolve(normalize('/home/user/project/../../../etc/passwd')) → '/etc/passwd'
    expect(resolveSandboxedPath('/home/user/project/../../../etc/passwd', approved)).toBeNull()
  })

  it('uses realpathSync to resolve symlinks for existing files', () => {
    mockedRealpathSync.mockReturnValue('/etc/shadow' as never)
    expect(resolveSandboxedPath('/home/user/project/symlink', approved)).toBeNull()
    expect(mockedRealpathSync).toHaveBeenCalled()
  })

  it('falls back to normalized path when file does not exist (ENOENT)', () => {
    const enoent = Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    mockedRealpathSync.mockImplementation(() => {
      throw enoent
    })
    // Path still inside approved folder → accepted
    expect(resolveSandboxedPath('/home/user/project/new-file.ts', approved)).toBe(
      '/home/user/project/new-file.ts'
    )
  })

  it('rejects when realpathSync throws non-ENOENT error (e.g. ELOOP)', () => {
    const eloop = Object.assign(new Error('ELOOP'), { code: 'ELOOP' })
    mockedRealpathSync.mockImplementation(() => {
      throw eloop
    })
    expect(resolveSandboxedPath('/home/user/project/suspicious', approved)).toBeNull()
  })

  it('rejects when realpathSync throws EACCES', () => {
    const eacces = Object.assign(new Error('EACCES'), { code: 'EACCES' })
    mockedRealpathSync.mockImplementation(() => {
      throw eacces
    })
    expect(resolveSandboxedPath('/home/user/project/restricted', approved)).toBeNull()
  })
})

describe('getParentFolder', () => {
  it('returns the directory containing a file', () => {
    expect(getParentFolder('/home/user/project/src/index.ts')).toBe('/home/user/project/src')
  })

  it('returns the parent of a nested directory', () => {
    expect(getParentFolder('/home/user/project/src')).toBe('/home/user/project')
  })

  it('returns the resolved path for root-level paths', () => {
    const result = getParentFolder('/file.txt')
    // Should return '/' or the resolved root
    expect(result).toBeTruthy()
  })
})
