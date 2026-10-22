/**
 * Shared AI Circuit Assistant Types and IPC Contracts
 * CriticalPath EDA
 */

export interface AiChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
}

export interface CircuitAiContext {
  circuitName?: string
  componentSummary?: string
  netlist?: string
  simError?: string
  simStatus?: string
  ercErrors?: string[]
}

export interface AiChatRequest {
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[]
  context?: CircuitAiContext
  apiKey?: string
  provider?: 'gemini' | 'groq'
  language?: string
}

export interface AiChatResponse {
  success: boolean
  reply?: string
  error?: string
  providerUsed?: string
}
