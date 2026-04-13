import { resolve, normalize } from 'path'
import { dialog } from 'electron'
import type { SqliteSettingsRepository } from './db/settings-repository'

let settingsRepo: SqliteSettingsRepository | null = null

export function initProjectDirectory(repo: SqliteSettingsRepository): void {
  settingsRepo = repo
}

export function getProjectDirectory(): string {
  if (!settingsRepo) throw new Error('Project directory not initialized')
  return settingsRepo.getProjectDirectory()
}

export function setProjectDirectory(dirPath: string): void {
  if (!settingsRepo) throw new Error('Project directory not initialized')
  const normalized = resolve(normalize(dirPath))
  settingsRepo.setProjectDirectory(normalized)
}

export function isPathInProject(filePath: string): boolean {
  const projectDir = getProjectDirectory()
  if (!projectDir) return false
  const normalizedPath = resolve(normalize(filePath))
  return normalizedPath === projectDir || normalizedPath.startsWith(projectDir + '/')
}

export async function selectProjectDirectory(): Promise<string | null> {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: 'Select Project Directory'
  })
  if (result.canceled || result.filePaths.length === 0) return null
  const dirPath = result.filePaths[0]
  setProjectDirectory(dirPath)
  return dirPath
}
