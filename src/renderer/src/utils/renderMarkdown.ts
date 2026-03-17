import { Marked } from 'marked'
import DOMPurify from 'dompurify'

// Dedicated instance — avoids mutating the global marked singleton
const md = new Marked({ breaks: true, gfm: true })

/**
 * Converts a markdown string to sanitized HTML.
 * Used by MessageBubble to render assistant responses.
 */
export function renderMarkdown(content: string): string {
  try {
    const raw = md.parse(content, { async: false }) as string
    return DOMPurify.sanitize(raw)
  } catch (err) {
    console.error('[renderMarkdown] Failed to parse markdown:', err)
    return DOMPurify.sanitize(content)
  }
}
