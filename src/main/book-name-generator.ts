import { getApiKey } from './api-key'
import { getOrCreateClient } from './chat'

/** Strip markdown formatting and truncate for preview text. */
export function stripMarkdown(text: string, maxLength = 100): string {
  const stripped = text
    .replace(/```[\s\S]*?```/g, '') // code blocks (must be before inline)
    .replace(/^#{1,6}\s+/gm, '') // headers
    .replace(/\*\*(.+?)\*\*/g, '$1') // bold
    .replace(/\*(.+?)\*/g, '$1') // italic
    .replace(/`(.+?)`/g, '$1') // inline code
    .replace(/\[(.+?)\]\(.+?\)/g, '$1') // links
    .replace(/!\[.*?\]\(.+?\)/g, '') // images
    .replace(/\n+/g, ' ') // newlines
    .trim()
  return stripped.slice(0, maxLength)
}

/** Generate a template-based fallback name. */
export function generateFallbackName(npcName: string, count: number, locale: string): string {
  if (locale === 'en') {
    return `${npcName}'s Notes #${count}`
  }
  return `${npcName}的筆記 #${count}`
}

/** Generate an RPG-style book name using Sonnet, with template fallback. */
export async function generateBookName(
  content: string,
  locale: string,
  npcName: string,
  itemCount: number
): Promise<string> {
  const apiKey = getApiKey()
  if (!apiKey) {
    return generateFallbackName(npcName, itemCount + 1, locale)
  }

  try {
    const client = getOrCreateClient(apiKey)
    const snippet = content.slice(0, 500)

    const maxChars = locale === 'zh-TW' ? 15 : 30
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 30,
      system: `You are a book name generator for an RPG game. Output ONLY the bare book name. Do NOT wrap it in quotes, brackets, 「」, or any other punctuation. No markdown, no explanation. Maximum ${maxChars} characters.`,
      messages: [
        {
          role: 'user',
          content: `Generate a short RPG book name in ${locale} for this content:\n${snippet}`
        }
      ]
    })

    const text = (response.content[0]?.type === 'text' ? response.content[0].text : '')
      .trim()
      .replace(/^[「『"""'']+/, '')
      .replace(/[」』"""'']+$/, '')

    if (text.length > 0) return text.slice(0, maxChars)
    return generateFallbackName(npcName, itemCount + 1, locale)
  } catch {
    return generateFallbackName(npcName, itemCount + 1, locale)
  }
}
