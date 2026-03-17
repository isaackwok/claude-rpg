import { app, dialog } from 'electron'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, basename, resolve, normalize } from 'path'
import type { ApprovedFolder } from '../shared/types'

const FILENAME = 'approved-folders.json'

function getFilePath(): string {
  return join(app.getPath('userData'), FILENAME)
}

function load(): ApprovedFolder[] {
  const filePath = getFilePath()
  if (!existsSync(filePath)) return []
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'))
  } catch {
    return []
  }
}

function save(folders: ApprovedFolder[]): void {
  writeFileSync(getFilePath(), JSON.stringify(folders, null, 2), 'utf-8')
}

export function getApprovedFolders(): ApprovedFolder[] {
  return load()
}

export function addApprovedFolder(folderPath: string): ApprovedFolder {
  const normalized = resolve(normalize(folderPath))
  const folders = load()

  const existing = folders.find((f) => f.path === normalized)
  if (existing) return existing

  const folder: ApprovedFolder = {
    path: normalized,
    label: basename(normalized),
    addedAt: Date.now()
  }
  folders.push(folder)
  save(folders)
  return folder
}

export function removeApprovedFolder(folderPath: string): void {
  const normalized = resolve(normalize(folderPath))
  const folders = load().filter((f) => f.path !== normalized)
  save(folders)
}

export function isPathApproved(filePath: string): boolean {
  const normalized = resolve(normalize(filePath))
  const folders = load()
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
