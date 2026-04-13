import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  isPathInProject,
  initProjectDirectory,
  getProjectDirectory,
  setProjectDirectory
} from '../project-directory'

// Mock the settings repo
const mockRepo = {
  getProjectDirectory: vi.fn(),
  setProjectDirectory: vi.fn()
}

beforeEach(() => {
  mockRepo.getProjectDirectory.mockReset()
  mockRepo.setProjectDirectory.mockReset()
  initProjectDirectory(mockRepo as any)
})

describe('project-directory', () => {
  it('returns project directory from settings', () => {
    mockRepo.getProjectDirectory.mockReturnValue('/home/user/project')
    expect(getProjectDirectory()).toBe('/home/user/project')
  })

  it('returns empty string when not set', () => {
    mockRepo.getProjectDirectory.mockReturnValue('')
    expect(getProjectDirectory()).toBe('')
  })

  it('normalizes path on set', () => {
    setProjectDirectory('/home/user/../user/project/')
    expect(mockRepo.setProjectDirectory).toHaveBeenCalledWith(
      expect.stringMatching(/\/home\/user\/project$/)
    )
  })

  it('approves paths within project directory', () => {
    mockRepo.getProjectDirectory.mockReturnValue('/home/user/project')
    expect(isPathInProject('/home/user/project/src/index.ts')).toBe(true)
    expect(isPathInProject('/home/user/project')).toBe(true)
  })

  it('rejects paths outside project directory', () => {
    mockRepo.getProjectDirectory.mockReturnValue('/home/user/project')
    expect(isPathInProject('/home/user/other/file.ts')).toBe(false)
    expect(isPathInProject('/etc/passwd')).toBe(false)
  })

  it('rejects all paths when project directory is empty', () => {
    mockRepo.getProjectDirectory.mockReturnValue('')
    expect(isPathInProject('/any/path')).toBe(false)
  })
})
