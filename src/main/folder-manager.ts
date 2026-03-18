import { dialog } from 'electron'
import { basename, resolve, normalize } from 'path'
import type { ApprovedFolder } from '../shared/types'
import type { SqliteFolderRepository } from './db/folder-repository'

let repo: SqliteFolderRepository | null = null

/** Initialize folder manager with SQLite backing. Must be called before other functions. */
export function initFolderManager(folderRepo: SqliteFolderRepository): void {
  repo = folderRepo
}

function ensureRepo(): SqliteFolderRepository {
  if (!repo) {
    throw new Error('[folder-manager] Not initialized — call initFolderManager() first')
  }
  return repo
}

export function getApprovedFolders(): ApprovedFolder[] {
  return ensureRepo().getAll()
}

export function addApprovedFolder(folderPath: string): ApprovedFolder {
  const normalized = resolve(normalize(folderPath))
  return ensureRepo().add(normalized, basename(normalized))
}

export function removeApprovedFolder(folderPath: string): void {
  const normalized = resolve(normalize(folderPath))
  ensureRepo().remove(normalized)
}

export function isPathApproved(filePath: string): boolean {
  const normalized = resolve(normalize(filePath))
  const folders = getApprovedFolders()
  return folders.some((f) => normalized === f.path || normalized.startsWith(f.path + '/'))
}

export async function selectAndAddFolder(): Promise<ApprovedFolder | null> {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: '選擇資料夾 — Select Folder'
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return addApprovedFolder(result.filePaths[0])
}
