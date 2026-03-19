import { describe, it, expect } from 'vitest'
import { generateFallbackName, stripMarkdown } from '../book-name-generator'

describe('book-name-generator', () => {
  describe('generateFallbackName()', () => {
    it('generates zh-TW fallback name with NPC name and count', () => {
      const name = generateFallbackName('書記官', 3, 'zh-TW')
      expect(name).toBe('書記官的筆記 #3')
    })

    it('generates en fallback name with NPC name and count', () => {
      const name = generateFallbackName('The Scribe', 1, 'en')
      expect(name).toBe("The Scribe's Notes #1")
    })

    it('defaults to zh-TW format for unknown locales', () => {
      const name = generateFallbackName('書記官', 1, 'ja')
      expect(name).toBe('書記官的筆記 #1')
    })
  })

  describe('stripMarkdown()', () => {
    it('strips headers, bold, italic, links, and code', () => {
      const result = stripMarkdown('# Title\n**bold** and *italic* with `code`')
      expect(result).toBe('Title bold and italic with code')
    })

    it('truncates to maxLength', () => {
      const long = 'A'.repeat(200)
      const result = stripMarkdown(long, 100)
      expect(result).toHaveLength(100)
    })

    it('handles empty string', () => {
      expect(stripMarkdown('')).toBe('')
    })

    it('strips code blocks', () => {
      const result = stripMarkdown('before\n```js\nconst x = 1\n```\nafter')
      expect(result).toBe('before after')
    })

    it('strips markdown links but keeps text', () => {
      const result = stripMarkdown('[click here](https://example.com)')
      expect(result).toBe('click here')
    })
  })
})
