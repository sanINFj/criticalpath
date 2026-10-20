
type AssistantLanguage = 'auto' | 'en' | 'hi' | 'ta' | 'bn' | 'mr' | 'te' | 'gu'

export async function sendMessage(
  message: string,
  language: AssistantLanguage = 'auto',
): Promise<string> {
  const content = message.trim()

  if (!content) {
    throw new Error('Please enter a message.')
  }

  try {
    const response = await window.api.sendAssistantMessage(content, language)

    if (!response || !response.trim()) {
      throw new Error('The AI returned an empty response.')
    }

    return response.trim()
  } catch (error) {
    if (error instanceof Error) {
      throw error
    }

    throw new Error('Failed to contact the AI service.')
  }
}
