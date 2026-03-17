import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'fs'
import { execFile } from 'child_process'
import { dirname, basename } from 'path'
import type { ToolName, ToolExecutionResult } from '../../shared/types'
import { resolveSandboxedPath } from './path-utils'

const MAX_FILE_SIZE = 100 * 1024 // 100KB
const MAX_DIR_ENTRIES = 500
const COMMAND_TIMEOUT = 30_000 // 30s
const MAX_OUTPUT_SIZE = 1024 * 1024 // 1MB

interface ToolHandler {
  execute(args: Record<string, unknown>, approvedFolders: string[]): Promise<ToolExecutionResult>
}

function sandboxPath(
  path: unknown,
  approvedFolders: string[]
): { resolved: string } | { error: ToolExecutionResult } {
  if (typeof path !== 'string' || !path) {
    return { error: { success: false, content: 'Missing or invalid path', summary: '路徑無效' } }
  }
  const resolved = resolveSandboxedPath(path, approvedFolders)
  if (!resolved) {
    return {
      error: {
        success: false,
        content: `Path "${path}" is outside approved folders`,
        summary: '路徑不在核准範圍內'
      }
    }
  }
  return { resolved }
}

const readFileHandler: ToolHandler = {
  async execute(args, approvedFolders) {
    const result = sandboxPath(args.path, approvedFolders)
    if ('error' in result) return result.error

    try {
      const stat = statSync(result.resolved)
      if (stat.size > MAX_FILE_SIZE) {
        return {
          success: false,
          content: `File too large: ${stat.size} bytes (limit: ${MAX_FILE_SIZE})`,
          summary: `檔案過大 (${Math.round(stat.size / 1024)}KB)`
        }
      }
      const content = readFileSync(result.resolved, 'utf-8')
      return {
        success: true,
        content,
        summary: `讀取 ${basename(result.resolved)} (${content.length} 字元)`
      }
    } catch (err) {
      return {
        success: false,
        content: `Failed to read file: ${(err as Error).message}`,
        summary: '讀取失敗'
      }
    }
  }
}

const writeFileHandler: ToolHandler = {
  async execute(args, approvedFolders) {
    const result = sandboxPath(args.path, approvedFolders)
    if ('error' in result) return result.error

    const content = typeof args.content === 'string' ? args.content : ''
    try {
      mkdirSync(dirname(result.resolved), { recursive: true })
      writeFileSync(result.resolved, content, 'utf-8')
      return {
        success: true,
        content: `File written successfully: ${result.resolved}`,
        summary: `寫入 ${basename(result.resolved)} (${content.length} 字元)`
      }
    } catch (err) {
      return {
        success: false,
        content: `Failed to write file: ${(err as Error).message}`,
        summary: '寫入失敗'
      }
    }
  }
}

const editFileHandler: ToolHandler = {
  async execute(args, approvedFolders) {
    const result = sandboxPath(args.path, approvedFolders)
    if ('error' in result) return result.error

    const oldText = typeof args.old_text === 'string' ? args.old_text : ''
    const newText = typeof args.new_text === 'string' ? args.new_text : ''

    try {
      const content = readFileSync(result.resolved, 'utf-8')
      if (!content.includes(oldText)) {
        return {
          success: false,
          content: 'old_text not found in file',
          summary: '找不到要取代的文字'
        }
      }
      const updated = content.replace(oldText, newText)
      writeFileSync(result.resolved, updated, 'utf-8')
      return {
        success: true,
        content: `Edit applied successfully in ${result.resolved}`,
        summary: `編輯 ${basename(result.resolved)}`
      }
    } catch (err) {
      return {
        success: false,
        content: `Failed to edit file: ${(err as Error).message}`,
        summary: '編輯失敗'
      }
    }
  }
}

const listFilesHandler: ToolHandler = {
  async execute(args, approvedFolders) {
    const result = sandboxPath(args.path, approvedFolders)
    if ('error' in result) return result.error

    try {
      const entries = readdirSync(result.resolved, { withFileTypes: true })
      const limited = entries.slice(0, MAX_DIR_ENTRIES)
      const lines = limited.map((e) => `${e.isDirectory() ? '📁' : '📄'} ${e.name}`)
      const content =
        lines.join('\n') +
        (entries.length > MAX_DIR_ENTRIES
          ? `\n... and ${entries.length - MAX_DIR_ENTRIES} more entries`
          : '')
      return {
        success: true,
        content,
        summary: `列出 ${limited.length} 個項目`
      }
    } catch (err) {
      return {
        success: false,
        content: `Failed to list directory: ${(err as Error).message}`,
        summary: '列出失敗'
      }
    }
  }
}

const runCommandHandler: ToolHandler = {
  async execute(args, approvedFolders) {
    const command = typeof args.command === 'string' ? args.command : ''
    if (!command) {
      return { success: false, content: 'Missing command', summary: '缺少指令' }
    }

    // Validate CWD
    let cwd: string
    if (typeof args.cwd === 'string' && args.cwd) {
      const cwdResult = sandboxPath(args.cwd, approvedFolders)
      if ('error' in cwdResult) return cwdResult.error
      cwd = cwdResult.resolved
    } else {
      if (approvedFolders.length === 0) {
        return {
          success: false,
          content: 'No approved folders for working directory',
          summary: '沒有核准的工作目錄'
        }
      }
      cwd = approvedFolders[0]
    }

    // Use execFile with shell: true for NPC-generated commands.
    // The NPC generates the command string; user confirms every call via ToolConfirmDialog.
    return new Promise((resolve) => {
      const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh'
      const shellArgs = process.platform === 'win32' ? ['/c', command] : ['-c', command]

      const child = execFile(shell, shellArgs, {
        cwd,
        timeout: COMMAND_TIMEOUT,
        maxBuffer: MAX_OUTPUT_SIZE
      })
      let stdout = ''
      let stderr = ''

      child.stdout?.on('data', (data: string) => {
        stdout += data
      })
      child.stderr?.on('data', (data: string) => {
        stderr += data
      })
      child.on('close', (code) => {
        const output = stdout + (stderr ? `\n[stderr]\n${stderr}` : '')
        resolve({
          success: code === 0,
          content: output || `(exit code: ${code})`,
          summary: code === 0 ? `指令完成` : `指令失敗 (exit ${code})`
        })
      })
      child.on('error', (err) => {
        resolve({
          success: false,
          content: `Command error: ${err.message}`,
          summary: '指令執行錯誤'
        })
      })
    })
  }
}

const handlers: Record<Exclude<ToolName, 'web_search'>, ToolHandler> = {
  read_file: readFileHandler,
  write_file: writeFileHandler,
  edit_file: editFileHandler,
  list_files: listFilesHandler,
  run_command: runCommandHandler
}

export async function executeTool(
  toolName: ToolName,
  args: Record<string, unknown>,
  approvedFolders: string[]
): Promise<ToolExecutionResult> {
  if (toolName === 'web_search') {
    return { success: false, content: 'web_search is handled by Anthropic API', summary: '' }
  }
  const handler = handlers[toolName]
  if (!handler) {
    return { success: false, content: `Unknown tool: ${toolName}`, summary: '未知工具' }
  }
  return handler.execute(args, approvedFolders)
}
