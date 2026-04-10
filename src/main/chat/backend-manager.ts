import { execFile } from 'child_process'
import { promisify } from 'util'
import type { IChatBackend } from './types'
import type { AuthType } from '../../shared/types'
import { ApiKeyChatBackend } from './api-key-backend'

const execFileAsync = promisify(execFile)

export interface BackendManagerDeps {
  getApiKey: () => string | null
}

export class BackendManager {
  private currentBackend: IChatBackend
  private currentAuthType: AuthType
  private deps: BackendManagerDeps

  constructor(authType: AuthType, deps: BackendManagerDeps) {
    this.deps = deps
    this.currentAuthType = authType
    this.currentBackend = this.createBackend(authType)
  }

  private createBackend(authType: AuthType): IChatBackend {
    switch (authType) {
      case 'api_key':
        return new ApiKeyChatBackend(this.deps.getApiKey)
      case 'claude_cli':
        // ClaudeCliChatBackend will be added in Task 4
        throw new Error('Claude CLI backend not yet implemented')
    }
  }

  getBackend(): IChatBackend {
    return this.currentBackend
  }

  getAuthType(): AuthType {
    return this.currentAuthType
  }

  switchBackend(authType: AuthType): void {
    if (authType === this.currentAuthType) return
    this.currentBackend = this.createBackend(authType)
    this.currentAuthType = authType
  }

  /** Check if claude CLI is installed and authenticated.
   *  Uses execFile (not exec) — args are passed as array, no shell injection risk. */
  async checkCli(): Promise<{ installed: boolean; authenticated: boolean }> {
    try {
      await execFileAsync('claude', ['--version'])
    } catch {
      return { installed: false, authenticated: false }
    }
    try {
      await execFileAsync('claude', ['--print', '--max-turns', '0', 'test'], { timeout: 10_000 })
      return { installed: true, authenticated: true }
    } catch {
      return { installed: true, authenticated: false }
    }
  }

  /** Validate an API key by making a lightweight API call */
  async validateApiKey(key: string): Promise<{ valid: boolean; error?: string }> {
    try {
      const { default: Anthropic } = await import('@anthropic-ai/sdk')
      const client = new Anthropic({ apiKey: key })
      await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }]
      })
      return { valid: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { valid: false, error: message }
    }
  }
}
