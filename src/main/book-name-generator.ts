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

/** Generate an RPG-style book name using Haiku, with template fallback. */
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

    const formatExample =
      locale === 'en'
        ? 'Format: "Tome of [Genre]: [Topic]" — e.g., "Tome of Research: Web Performance"'
        : '格式：「[類別]之書：[主題]」— 例如：「研究之書：網頁效能優化」'

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 30,
      messages: [
        {
          role: 'user',
          content: `Generate ONE short RPG book name (under 20 characters, one line only, no explanation) in ${locale}. ${formatExample}\nRespond with ONLY the name on a single line, nothing else.\n\nContent:\n${snippet}`
        }
      ]
    })

    let text = response.content[0]?.type === 'text' ? response.content[0].text.trim() : ''
    // Strip any markdown or explanation the model might add
    text = text
      .replace(/^[#*\s]+/, '')
      .replace(/[*]+/g, '')
      .split('\n')[0]
      .trim()

    if (text && text.length <= 30) return text
    return generateFallbackName(npcName, itemCount + 1, locale)
  } catch {
    return generateFallbackName(npcName, itemCount + 1, locale)
  }
}
