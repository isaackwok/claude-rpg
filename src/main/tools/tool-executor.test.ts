import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'fs'
import { executeTool } from './tool-executor'
import { resolveSandboxedPath } from './path-utils'

vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  readdirSync: vi.fn(),
  statSync: vi.fn(),
  mkdirSync: vi.fn()
}))

vi.mock('child_process', () => ({
  execFile: vi.fn((_shell, _args, _opts) => {
    const events: Record<string, (...a: unknown[]) => void> = {}
    const child = {
      stdout: {
        on: vi.fn((event: string, cb: (...a: unknown[]) => void) => {
          events[`stdout:${event}`] = cb
        })
      },
      stderr: {
        on: vi.fn((event: string, cb: (...a: unknown[]) => void) => {
          events[`stderr:${event}`] = cb
        })
      },
      on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
        events[event] = cb
        // Auto-resolve on next tick
        if (event === 'close') {
          setTimeout(() => {
            events['stdout:data']?.('output')
            cb(0)
          }, 0)
        }
      })
    }
    return child
  })
}))

vi.mock('./path-utils', () => ({
  resolveSandboxedPath: vi.fn()
}))

const mockedSandboxPath = vi.mocked(resolveSandboxedPath)
const mockedReadFileSync = vi.mocked(readFileSync)
const mockedWriteFileSync = vi.mocked(writeFileSync)
const mockedReaddirSync = vi.mocked(readdirSync)
const mockedStatSync = vi.mocked(statSync)

const approved = ['/home/user/project']

describe('executeTool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('read_file', () => {
    it('reads a file within approved folders', async () => {
      mockedSandboxPath.mockReturnValue('/home/user/project/file.txt')
      mockedStatSync.mockReturnValue({ size: 100 } as never)
      mockedReadFileSync.mockReturnValue('file content' as never)

      const result = await executeTool(
        'read_file',
        { path: '/home/user/project/file.txt' },
        approved
      )
      expect(result.success).toBe(true)
      expect(result.content).toBe('file content')
    })

    it('rejects paths outside approved folders', async () => {
      mockedSandboxPath.mockReturnValue(null)

      const result = await executeTool('read_file', { path: '/etc/passwd' }, approved)
      expect(result.success).toBe(false)
      expect(result.content).toContain('outside approved folders')
    })

    it('rejects files exceeding MAX_FILE_SIZE', async () => {
      mockedSandboxPath.mockReturnValue('/home/user/project/big.bin')
      mockedStatSync.mockReturnValue({ size: 200 * 1024 } as never)

      const result = await executeTool(
        'read_file',
        { path: '/home/user/project/big.bin' },
        approved
      )
      expect(result.success).toBe(false)
      expect(result.content).toContain('too large')
    })

    it('rejects missing or invalid path', async () => {
      const result = await executeTool('read_file', {}, approved)
      expect(result.success).toBe(false)
      expect(result.content).toContain('Missing or invalid path')
    })
  })

  describe('write_file', () => {
    it('writes content to a file', async () => {
      mockedSandboxPath.mockReturnValue('/home/user/project/out.txt')

      const result = await executeTool(
        'write_file',
        { path: '/home/user/project/out.txt', content: 'hello' },
        approved
      )
      expect(result.success).toBe(true)
      expect(mockedWriteFileSync).toHaveBeenCalledWith(
        '/home/user/project/out.txt',
        'hello',
        'utf-8'
      )
    })

    it('creates parent directories', async () => {
      mockedSandboxPath.mockReturnValue('/home/user/project/deep/nested/file.txt')

      await executeTool(
        'write_file',
        { path: '/home/user/project/deep/nested/file.txt', content: 'x' },
        approved
      )
      expect(vi.mocked(mkdirSync)).toHaveBeenCalledWith('/home/user/project/deep/nested', {
        recursive: true
      })
    })
  })

  describe('edit_file', () => {
    it('replaces text in a file', async () => {
      mockedSandboxPath.mockReturnValue('/home/user/project/src.ts')
      mockedReadFileSync.mockReturnValue('const a = 1' as never)

      const result = await executeTool(
        'edit_file',
        { path: '/home/user/project/src.ts', old_text: 'const a = 1', new_text: 'const a = 2' },
        approved
      )
      expect(result.success).toBe(true)
      expect(mockedWriteFileSync).toHaveBeenCalledWith(
        '/home/user/project/src.ts',
        'const a = 2',
        'utf-8'
      )
    })

    it('returns error when old_text is not found', async () => {
      mockedSandboxPath.mockReturnValue('/home/user/project/src.ts')
      mockedReadFileSync.mockReturnValue('const b = 2' as never)

      const result = await executeTool(
        'edit_file',
        { path: '/home/user/project/src.ts', old_text: 'not found', new_text: 'x' },
        approved
      )
      expect(result.success).toBe(false)
      expect(result.content).toContain('old_text not found')
    })
  })

  describe('list_files', () => {
    it('lists directory entries', async () => {
      mockedSandboxPath.mockReturnValue('/home/user/project')
      mockedReaddirSync.mockReturnValue([
        { name: 'src', isDirectory: () => true },
        { name: 'README.md', isDirectory: () => false }
      ] as never)

      const result = await executeTool('list_files', { path: '/home/user/project' }, approved)
      expect(result.success).toBe(true)
      expect(result.content).toContain('src')
      expect(result.content).toContain('README.md')
    })
  })

  describe('run_command', () => {
    it('returns error when command is missing', async () => {
      const result = await executeTool('run_command', {}, approved)
      expect(result.success).toBe(false)
      expect(result.content).toContain('Missing command')
    })

    it('returns error when no approved folders and no cwd', async () => {
      const result = await executeTool('run_command', { command: 'ls' }, [])
      expect(result.success).toBe(false)
      expect(result.content).toContain('No approved folders')
    })

    it('validates cwd against approved folders', async () => {
      mockedSandboxPath.mockReturnValue(null)

      const result = await executeTool('run_command', { command: 'ls', cwd: '/etc' }, approved)
      expect(result.success).toBe(false)
      expect(result.content).toContain('outside approved folders')
    })
  })

  describe('web_search', () => {
    it('returns error indicating it is handled by Anthropic API', async () => {
      const result = await executeTool('web_search', {}, approved)
      expect(result.success).toBe(false)
      expect(result.content).toContain('web_search is handled by Anthropic API')
    })
  })

  describe('unknown tool', () => {
    it('returns error for unknown tool name', async () => {
      const result = await executeTool('nonexistent' as never, {}, approved)
      expect(result.success).toBe(false)
      expect(result.content).toContain('Unknown tool')
    })
  })
})
