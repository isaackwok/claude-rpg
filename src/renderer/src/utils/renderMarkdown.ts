import { marked } from 'marked'
import DOMPurify from 'dompurify'

// Configure marked: GFM + treat newlines as <br>
marked.setOptions({ breaks: true, gfm: true })

/**
 * Converts a markdown string to sanitized HTML.
 * Used by MessageBubble to render assistant responses.
 */
export function renderMarkdown(content: string): string {
  const raw = marked.parse(content, { async: false }) as string
  return DOMPurify.sanitize(raw)
}
