import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SlashCommandRegistry } from '../chat/slash-command-registry'

vi.mock('child_process', () => ({
  execFile: vi.fn()
}))

import { execFile } from 'child_process'

const mockExecFile = vi.mocked(execFile)

beforeEach(() => {
  mockExecFile.mockReset()
})

describe('SlashCommandRegistry', () => {
  it('returns fallback commands when CLI is unavailable', async () => {
    mockExecFile.mockImplementation((_cmd, _args, _opts, cb) => {
      const callback = (typeof _opts === 'function' ? _opts : cb) as Function
      callback(new Error('command not found'), '', '')
      return {} as any
    })
    const registry = new SlashCommandRegistry()
    const commands = await registry.getCommands()
    expect(commands.length).toBeGreaterThan(0)
    expect(commands.some((c) => c.name === 'brainstorm')).toBe(true)
  })

  it('caches result after first call', async () => {
    mockExecFile.mockImplementation((_cmd, _args, _opts, cb) => {
      const callback = (typeof _opts === 'function' ? _opts : cb) as Function
      callback(new Error('nope'), '', '')
      return {} as any
    })
    const registry = new SlashCommandRegistry()
    await registry.getCommands()
    await registry.getCommands()
    // execFile called only once (for the first getCommands call)
    expect(mockExecFile).toHaveBeenCalledTimes(1)
  })
})
