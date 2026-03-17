/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest'
import { renderMarkdown } from './renderMarkdown'

describe('renderMarkdown', () => {
  describe('basic formatting', () => {
    it('renders bold text', () => {
      const html = renderMarkdown('**hello**')
      expect(html).toContain('<strong>hello</strong>')
    })

    it('renders italic text', () => {
      const html = renderMarkdown('*emphasis*')
      expect(html).toContain('<em>emphasis</em>')
    })

    it('renders inline code', () => {
      const html = renderMarkdown('use `console.log`')
      expect(html).toContain('<code>console.log</code>')
    })

    it('renders links', () => {
      const html = renderMarkdown('[click](https://example.com)')
      expect(html).toContain('<a href="https://example.com">click</a>')
    })
  })

  describe('block elements', () => {
    it('renders unordered lists', () => {
      const html = renderMarkdown('- item one\n- item two')
      expect(html).toContain('<ul>')
      expect(html).toContain('<li>item one</li>')
      expect(html).toContain('<li>item two</li>')
    })

    it('renders ordered lists', () => {
      const html = renderMarkdown('1. first\n2. second')
      expect(html).toContain('<ol>')
      expect(html).toContain('<li>first</li>')
    })

    it('renders code blocks', () => {
      const html = renderMarkdown('```js\nconst x = 1\n```')
      expect(html).toContain('<pre>')
      expect(html).toContain('<code')
      expect(html).toContain('const x = 1')
    })

    it('renders blockquotes', () => {
      const html = renderMarkdown('> wise words')
      expect(html).toContain('<blockquote>')
      expect(html).toContain('wise words')
    })

    it('renders headings', () => {
      const html = renderMarkdown('## Section Title')
      expect(html).toContain('<h2')
      expect(html).toContain('Section Title')
    })

    it('renders horizontal rules', () => {
      const html = renderMarkdown('above\n\n---\n\nbelow')
      expect(html).toContain('<hr')
    })
  })

  describe('GFM features', () => {
    it('renders tables', () => {
      const md = '| A | B |\n|---|---|\n| 1 | 2 |'
      const html = renderMarkdown(md)
      expect(html).toContain('<table>')
      expect(html).toContain('<th>A</th>')
      expect(html).toContain('<td>1</td>')
    })

    it('renders strikethrough', () => {
      const html = renderMarkdown('~~deleted~~')
      expect(html).toContain('<del>deleted</del>')
    })
  })

  describe('line breaks', () => {
    it('converts single newlines to <br> (breaks: true)', () => {
      const html = renderMarkdown('line one\nline two')
      expect(html).toContain('<br')
    })
  })

  describe('sanitization', () => {
    it('strips script tags', () => {
      const html = renderMarkdown('<script>alert("xss")</script>')
      expect(html).not.toContain('<script>')
      expect(html).not.toContain('alert')
    })

    it('strips onerror attributes', () => {
      const html = renderMarkdown('<img src=x onerror="alert(1)">')
      expect(html).not.toContain('onerror')
    })

    it('strips javascript: URLs', () => {
      const html = renderMarkdown('[click](javascript:alert(1))')
      expect(html).not.toContain('javascript:')
    })

    it('preserves safe HTML elements from markdown', () => {
      const html = renderMarkdown('**safe** content')
      expect(html).toContain('<strong>safe</strong>')
    })
  })

  describe('edge cases', () => {
    it('handles empty string', () => {
      const html = renderMarkdown('')
      expect(html).toBe('')
    })

    it('handles plain text without markdown', () => {
      const html = renderMarkdown('just plain text')
      expect(html).toContain('just plain text')
    })

    it('handles Chinese text with markdown', () => {
      const html = renderMarkdown('**你好世界**')
      expect(html).toContain('<strong>你好世界</strong>')
    })

    it('handles mixed markdown and plain text', () => {
      const html = renderMarkdown('Hello **world**, use `code` and:\n- item')
      expect(html).toContain('<strong>world</strong>')
      expect(html).toContain('<code>code</code>')
      expect(html).toContain('<li>item</li>')
    })
  })
})
