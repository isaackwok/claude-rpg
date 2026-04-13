import { execFile } from 'child_process'
import { promisify } from 'util'
import type { SlashCommand } from '../../shared/dialogue-control-types'

const execFileAsync = promisify(execFile)

const FALLBACK_COMMANDS: SlashCommand[] = [
  { name: 'brainstorm', description: 'Brainstorm ideas collaboratively' },
  { name: 'simplify', description: 'Simplify and refine code' },
  { name: 'review', description: 'Review code changes' },
  { name: 'plan', description: 'Create an implementation plan' },
  { name: 'compact', description: 'Compact conversation history' },
  { name: 'clear', description: 'Clear conversation' }
]

export class SlashCommandRegistry {
  private cachedCommands: SlashCommand[] | null = null

  async getCommands(): Promise<SlashCommand[]> {
    if (this.cachedCommands) return this.cachedCommands

    try {
      const { stdout } = await execFileAsync('claude', ['--help'], { timeout: 5_000 })
      const commands = this.parseHelpOutput(stdout)
      this.cachedCommands = commands.length > 0 ? commands : FALLBACK_COMMANDS
    } catch {
      this.cachedCommands = FALLBACK_COMMANDS
    }

    return this.cachedCommands
  }

  private parseHelpOutput(output: string): SlashCommand[] {
    // Parse lines matching "  /command  Description text"
    const commands: SlashCommand[] = []
    const lines = output.split('\n')
    for (const line of lines) {
      const match = line.match(/^\s+\/(\w[\w-]*)\s{2,}(.+)$/)
      if (match) {
        commands.push({ name: match[1], description: match[2].trim() })
      }
    }
    return commands
  }

  clearCache(): void {
    this.cachedCommands = null
  }
}
