import { spawn } from 'child_process'
import type { AgentId } from '../../shared/types'
import type { IChatBackend, ChatOpts, StreamEvent, ToolResult } from './types'
import { ConversationHistoryManager } from './history'

/**
 * IChatBackend that delegates to the Claude CLI (`claude --print`).
 * Uses child_process.spawn with explicit args array — no shell, no injection risk.
 */
export class ClaudeCliChatBackend implements IChatBackend {
  private history = new ConversationHistoryManager()
  private activeProcesses = new Map<AgentId, { kill: () => void }>()
  private pendingToolResults = new Map<AgentId, { resolve: (results: ToolResult[]) => void }>()

  async *sendMessage(opts: ChatOpts, message: string): AsyncIterable<StreamEvent> {
    const history = this.history.getOrCreate(opts.agentId)

    // Avoid duplicate on retry
    const last = history[history.length - 1]
    if (!(last?.role === 'user' && last.content === message)) {
      history.push({ role: 'user', content: message })
    }

    // Build full prompt from history for --print mode
    const conversationPrompt = history
      .map((m) => (m.role === 'user' ? `Human: ${m.content}` : `Assistant: ${m.content}`))
      .join('\n\n')

    try {
      const result = await this.runClaude(opts, conversationPrompt)
      history.push({ role: 'assistant', content: result })
      yield { type: 'text', chunk: result }
      yield { type: 'end' }
    } catch (err) {
      const isAbort =
        err instanceof Error && (err.name === 'AbortError' || err.message.includes('killed'))
      if (isAbort) {
        yield { type: 'end' }
      } else {
        const error = err instanceof Error ? err.message : String(err)
        console.error(`[ClaudeCliChatBackend] Error for agent ${opts.agentId}:`, err)
        yield { type: 'error', error }
      }
    } finally {
      this.activeProcesses.delete(opts.agentId)
    }
  }

  /** Spawn claude CLI with explicit args array — no shell, safe against injection. */
  private runClaude(opts: ChatOpts, prompt: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const args = [
        '--print',
        '--model',
        opts.model,
        '--max-tokens',
        String(opts.maxTokens),
        '--system-prompt',
        opts.systemPrompt
      ]

      const proc = spawn('claude', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env }
      })

      this.activeProcesses.set(opts.agentId, { kill: () => proc.kill('SIGTERM') })

      let stdout = ''
      let stderr = ''

      proc.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString()
      })

      proc.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString()
      })

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(stdout.trim())
        } else {
          reject(new Error(stderr.trim() || `claude exited with code ${code}`))
        }
      })

      proc.on('error', (err) => {
        reject(err)
      })

      // Write prompt to stdin and close
      proc.stdin.write(prompt)
      proc.stdin.end()
    })
  }

  supplyToolResults(agentId: AgentId, results: ToolResult[]): void {
    const pending = this.pendingToolResults.get(agentId)
    if (pending) {
      this.pendingToolResults.delete(agentId)
      pending.resolve(results)
    }
  }

  cancelStream(agentId: AgentId): void {
    const proc = this.activeProcesses.get(agentId)
    if (proc) {
      proc.kill()
    }
  }

  clearHistory(agentId: AgentId): void {
    this.history.clear(agentId)
  }
}
