import { describe, it, expect } from 'vitest'
import { ConversationHistoryManager } from '../chat/history'

describe('ConversationHistoryManager', () => {
  describe('getOrCreate', () => {
    it('returns empty array for new agent', () => {
      const mgr = new ConversationHistoryManager()
      const history = mgr.getOrCreate('wizard')
      expect(history).toEqual([])
    })

    it('returns same array on subsequent calls', () => {
      const mgr = new ConversationHistoryManager()
      const h1 = mgr.getOrCreate('wizard')
      h1.push({ role: 'user', content: 'hello' })
      const h2 = mgr.getOrCreate('wizard')
      expect(h2).toBe(h1)
      expect(h2).toHaveLength(1)
    })
  })

  describe('trim', () => {
    it('returns messages unchanged when under limit', () => {
      const mgr = new ConversationHistoryManager()
      const msgs = [
        { role: 'user' as const, content: 'hello' },
        { role: 'assistant' as const, content: 'hi' }
      ]
      expect(mgr.trim(msgs)).toBe(msgs)
    })

    it('trims to last 50 messages starting from a user message', () => {
      const mgr = new ConversationHistoryManager()
      const msgs = Array.from({ length: 60 }, (_, i) => ({
        role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
        content: `msg-${i}`
      }))
      const trimmed = mgr.trim(msgs)
      expect(trimmed.length).toBeLessThanOrEqual(50)
      expect(trimmed[0].role).toBe('user')
    })
  })

  describe('repairOrphanedToolUse', () => {
    it('inserts error results for tool_use without matching tool_result', () => {
      const mgr = new ConversationHistoryManager()
      const history = [
        { role: 'user' as const, content: 'do something' },
        {
          role: 'assistant' as const,
          content: [{ type: 'tool_use' as const, id: 'tool-1', name: 'read_file', input: {} }]
        }
        // Missing tool_result user message
      ]
      mgr.repairOrphanedToolUse(history)
      expect(history).toHaveLength(3)
      const repaired = history[2]
      expect(repaired.role).toBe('user')
      expect(Array.isArray(repaired.content)).toBe(true)
      const blocks = repaired.content as unknown as Array<{
        type: string
        tool_use_id: string
        is_error: boolean
      }>
      expect(blocks[0].type).toBe('tool_result')
      expect(blocks[0].tool_use_id).toBe('tool-1')
      expect(blocks[0].is_error).toBe(true)
    })

    it('does nothing when tool_results are present', () => {
      const mgr = new ConversationHistoryManager()
      const history = [
        { role: 'user' as const, content: 'do something' },
        {
          role: 'assistant' as const,
          content: [{ type: 'tool_use' as const, id: 'tool-1', name: 'read_file', input: {} }]
        },
        {
          role: 'user' as const,
          content: [{ type: 'tool_result' as const, tool_use_id: 'tool-1', content: 'ok' }]
        }
      ]
      mgr.repairOrphanedToolUse(history)
      expect(history).toHaveLength(3)
    })
  })

  describe('clear', () => {
    it('removes history for specified agent', () => {
      const mgr = new ConversationHistoryManager()
      const h = mgr.getOrCreate('wizard')
      h.push({ role: 'user', content: 'hello' })
      mgr.clear('wizard')
      const h2 = mgr.getOrCreate('wizard')
      expect(h2).toEqual([])
    })
  })
})
