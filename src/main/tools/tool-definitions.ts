import type { AgentId, ToolName } from '../../shared/types'
import type Anthropic from '@anthropic-ai/sdk'

type ToolDefinition = Anthropic.Messages.Tool

export const TOOL_SCHEMAS: Record<Exclude<ToolName, 'web_search'>, ToolDefinition> = {
  read_file: {
    name: 'read_file',
    description: '讀取指定路徑的檔案內容。路徑必須在冒險者核發的通行令範圍內。檔案大小上限 100KB。',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: '要讀取的檔案絕對路徑' }
      },
      required: ['path']
    }
  },
  write_file: {
    name: 'write_file',
    description: '將內容寫入指定路徑的檔案。若檔案不存在會自動建立（含父目錄）。',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: '要寫入的檔案絕對路徑' },
        content: { type: 'string', description: '要寫入的完整內容' }
      },
      required: ['path', 'content']
    }
  },
  edit_file: {
    name: 'edit_file',
    description: '在檔案中進行搜尋與取代。old_text 必須完全匹配檔案中的內容。',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: '要編輯的檔案絕對路徑' },
        old_text: { type: 'string', description: '要被取代的原始文字（必須完全匹配）' },
        new_text: { type: 'string', description: '取代後的新文字' }
      },
      required: ['path', 'old_text', 'new_text']
    }
  },
  list_files: {
    name: 'list_files',
    description: '列出指定目錄的檔案與子目錄。上限 500 個項目。',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: '要列出的目錄絕對路徑' }
      },
      required: ['path']
    }
  },
  run_command: {
    name: 'run_command',
    description: '在 shell 中執行指令。逾時 30 秒，輸出上限 1MB。工作目錄須在核發的通行令範圍內。',
    input_schema: {
      type: 'object' as const,
      properties: {
        command: { type: 'string', description: '要執行的 shell 指令' },
        cwd: { type: 'string', description: '工作目錄絕對路徑（須在核准範圍內）' }
      },
      required: ['command']
    }
  }
}

export const AGENT_TOOLS: Record<string, ToolName[]> = {
  wizard: ['read_file', 'write_file', 'edit_file', 'list_files', 'run_command'],
  scribe: ['read_file', 'write_file', 'edit_file', 'list_files'],
  herald: ['read_file', 'write_file', 'edit_file', 'list_files'],
  commander: ['read_file', 'write_file', 'list_files', 'run_command'],
  merchant: ['read_file', 'write_file', 'list_files'],
  artisan: ['read_file', 'write_file', 'list_files'],
  scholar: ['read_file', 'list_files', 'web_search'],
  elder: ['read_file', 'list_files', 'web_search'],
  guildMaster: ['read_file', 'list_files']
  // bartender: no tools
}

export function getToolsForAgent(
  agentId: AgentId
): (ToolDefinition | Anthropic.Messages.WebSearchTool20250305)[] {
  const toolNames = AGENT_TOOLS[agentId]
  if (!toolNames || toolNames.length === 0) return []

  const tools: (ToolDefinition | Anthropic.Messages.WebSearchTool20250305)[] = []
  for (const name of toolNames) {
    if (name === 'web_search') {
      tools.push({ type: 'web_search_20250305', name: 'web_search' })
    } else {
      tools.push(TOOL_SCHEMAS[name])
    }
  }
  return tools
}
