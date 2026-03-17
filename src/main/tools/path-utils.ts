import { realpathSync } from 'fs'
import { resolve, normalize } from 'path'

/**
 * Resolves and validates a path against a list of approved folder paths.
 * Uses fs.realpathSync to defeat symlink-based traversal attacks.
 * Returns the resolved real path if it falls within an approved folder, or null if denied.
 */
export function resolveSandboxedPath(inputPath: string, approvedFolders: string[]): string | null {
  const normalized = resolve(normalize(inputPath))

  let realPath: string
  try {
    realPath = realpathSync(normalized)
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      // Non-ENOENT errors (EACCES, ELOOP, etc.) indicate real problems — reject the path.
      return null
    }
    // File doesn't exist yet (e.g. write_file creating a new file).
    // Validate the normalized path directly — it can't have a symlink if it doesn't exist.
    realPath = normalized
  }

  for (const folder of approvedFolders) {
    if (realPath === folder || realPath.startsWith(folder + '/')) {
      return realPath
    }
  }
  return null
}

/**
 * Extracts the parent folder path from a file path for "Issue Permit" approval.
 * Returns the directory containing the file.
 */
export function getParentFolder(filePath: string): string {
  const resolved = resolve(normalize(filePath))
  const lastSlash = resolved.lastIndexOf('/')
  return lastSlash > 0 ? resolved.substring(0, lastSlash) : resolved
}
