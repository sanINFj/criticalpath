/**
 * AI Circuit Assistant Runner Service (Electron Main Process)
 * CriticalPath EDA - Gemini & Groq Integration
 */

import type { AiChatRequest, AiChatResponse } from '../shared/ai'

const SYSTEM_PROMPT = `You are CriticalPath Copilot, an elite Electrical Engineering & SPICE simulation assistant built directly into the CriticalPath EDA application.

Your capabilities and traits:
1. Deep expertise in circuit theory: Ohm's Law, Kirchhoff's Laws (KCL/KVL), Thévenin/Norton equivalents, small-signal models, Bode frequency plots, and Fourier analysis.
2. Comprehensive understanding of components: BJTs (biasing, Q-point, saturation, active mode), MOSFETs, diodes (Zener, Schottky, LED), Op-Amps (inverting, non-inverting, filters, comparators), 555 timers, LC resonators, and transformers.
3. SPICE & ngspice diagnostics specialist:
   - Identify singular-matrix errors (missing DC path to ground, floating capacitor/inductor nodes).
   - Resolve "timestep too small" / convergence errors (suggesting gmin, rshunt, or uic).
   - Point out zero-resistance voltage source loops or short circuits.
   - Suggest proper simulation directives (.tran with Tstep & Tstop, .ac dec, .dc, .meas).
4. Proactive design advice:
   - When reviewing or suggesting steps, propose practical standard component values (E12 / E24 standard series).
   - Guide the user step-by-step on what to connect next.
   - Explain calculations clearly and concisely with formulas and step-by-step numbers.
   - Keep answers well-structured using clear GitHub markdown (bolding, bullet points, and code blocks for SPICE syntax).
5. Clean Mathematical & Formula Formatting:
   - NEVER output raw LaTeX syntax (do NOT use \frac, \text{}, \times, \Omega, \Longrightarrow, \approx, or \[ ... \] / [ ... ] equation delimiters).
   - Format all electrical formulas, equations, and calculations in clean, natural engineering text using standard Unicode symbols (e.g. "Av = 1 + (R1 / R2) = 4", "R2 = Vref / Idiv = 6 kΩ", "R1 = 4 × R2 = 24 kΩ", "fc = 1 / (2π · R · C)", "Ω", "kΩ", "MΩ", "µF", "pF", "×", "·", "≈", "Δ", "π", "→").
   - NEVER wrap formulas, equations, calculations, or numbers in ** asterisks. Present standalone formulas cleanly on their own lines without asterisks.
   - Only use ** bolding sparingly for key conceptual terms (e.g. **reference resistor**, **feedback loop**).`

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  hi: 'Hindi (हिन्दी)',
  mr: 'Marathi (मराठी)',
  bn: 'Bengali (বাংলা)',
  ta: 'Tamil (தமிழ்)',
  te: 'Telugu (తెలుగు)',
  gu: 'Gujarati (ગુજરાતી)',
  es: 'Spanish (Español)',
  fr: 'French (Français)',
  de: 'German (Deutsch)',
  zh: 'Chinese (中文)',
  ja: 'Japanese (日本語)',
}

export function buildSystemPrompt(language?: string): string {
  if (!language || language === 'en' || language.toLowerCase() === 'english') {
    return `${SYSTEM_PROMPT}\n\nMultilingual Expertise: You are fluent in multiple languages including English, Hindi, Telugu, Tamil, Marathi, Bengali, Gujarati, and other global languages. If the user addresses you in another language, seamlessly understand and respond in that language while preserving standard engineering and SPICE notation (e.g. VCC, GND, .tran, .ac).`
  }

  const langKey = language.split('-')[0].toLowerCase()
  const langName = LANGUAGE_NAMES[langKey] || language

  return `${SYSTEM_PROMPT}\n\nCRITICAL LANGUAGE DIRECTIVE: The user has selected ${langName} as their active interface language. You MUST write your ENTIRE response, including all greetings, circuit explanations, component calculations, theory, and guidance, fluently and naturally in ${langName}. Do NOT reply in English.
Technical Terms & Symbols Rule:
- Keep component designators (e.g. R1, C1, Q1, U1), node names (e.g. VCC, GND, IN, OUT), SPICE directives (e.g. .tran, .ac, .dc, .meas), and metric units (e.g. kΩ, µF, V, mA, Hz) in standard technical notation so they remain technically precise.
- All descriptive text, explanations, formulas breakdown, and design steps must be in ${langName}.`
}

export async function executeAiChat(request: AiChatRequest): Promise<AiChatResponse> {
  const apiKey = request.apiKey?.trim() || process.env.GEMINI_API_KEY || process.env.CRITICALPATH_AI_KEY

  // If no user API key is configured
  if (!apiKey) {
    return {
      success: false,
      error:
        'No API Key configured. Please enter a free Google Gemini API key in the AI Assistant settings to enable instant AI circuit analysis.',
    }
  }

  // Construct context string to prepend if circuit context is provided
  let contextBlock = ''
  if (request.context) {
    const ctx = request.context
    const parts: string[] = []
    if (ctx.circuitName) parts.push(`Active Schematic: ${ctx.circuitName}`)
    if (ctx.componentSummary) parts.push(`Components on Canvas: ${ctx.componentSummary}`)
    if (ctx.simStatus) parts.push(`Simulation Status: ${ctx.simStatus}`)
    if (ctx.simError) parts.push(`Recent Simulation Error: ${ctx.simError}`)
    if (ctx.ercErrors && ctx.ercErrors.length > 0) {
      parts.push(`Electrical Rule Checks: ${ctx.ercErrors.join('; ')}`)
    }
    if (ctx.netlist) {
      let netlistText = ctx.netlist.trim()
      if (netlistText.length > 3000) {
        netlistText = netlistText.slice(0, 3000) + '\n... [Netlist truncated to save tokens] ...\n.end'
      }
      parts.push(`Generated SPICE Netlist:\n\`\`\`spice\n${netlistText}\n\`\`\``)
    }
    if (parts.length > 0) {
      contextBlock = `[CURRENT SCHEMATIC CONTEXT]\n${parts.join('\n\n')}\n[END CONTEXT]\n\n`
    }
  }

  // Determine provider: default to Gemini 2.0 Flash
  const provider = request.provider || (apiKey.startsWith('gsk_') ? 'groq' : 'gemini')

  if (provider === 'groq' || apiKey.startsWith('gsk_')) {
    return callGroqApi(apiKey, request.messages, contextBlock, request.language)
  } else {
    return callGeminiApi(apiKey, request.messages, contextBlock, request.language)
  }
}

async function callGeminiApi(
  apiKey: string,
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[],
  contextBlock: string,
  language?: string,
): Promise<AiChatResponse> {
  const candidateModels = ['gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-1.5-pro']
  const promptToUse = buildSystemPrompt(language)

  // Format messages for Gemini API
  const contents = messages.map((m, idx) => {
    let text = m.content
    // Inject circuit context into the last user message
    if (idx === messages.length - 1 && m.role === 'user' && contextBlock) {
      text = `${contextBlock}User question: ${text}`
    }
    return {
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text }],
    }
  })

  let lastError = ''
  for (const model of candidateModels) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: promptToUse }],
          },
          contents,
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 2048,
          },
        }),
      })

      if (res.status === 404 || res.status === 503 || res.status === 429) {
        // Model not available or experiencing high demand, try next candidate
        const errText = await res.text().catch(() => '')
        lastError = `Model ${model} status ${res.status}: ${errText}`
        continue
      }

      if (!res.ok) {
        const errText = await res.text()
        let parsedMessage = errText
        try {
          const parsed = JSON.parse(errText)
          if (parsed.error?.message) {
            parsedMessage = parsed.error.message
          }
        } catch {}

        if (res.status === 429) {
          return {
            success: false,
            error: 'Rate limit reached (15 requests/minute). Please wait a few seconds and try again.',
            providerUsed: model,
          }
        }

        return {
          success: false,
          error: `Gemini API error (${res.status}): ${parsedMessage}`,
          providerUsed: model,
        }
      }

      const data = await res.json()
      const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated.'
      return {
        success: true,
        reply,
        providerUsed: model,
      }
    } catch (err: any) {
      lastError = err.message
    }
  }

  return {
    success: false,
    error: `Network error reaching Gemini: ${lastError || 'No available Gemini model responded.'}`,
    providerUsed: 'Gemini',
  }
}

let cachedGroqModels: string[] | null = null
let lastGroqModelsFetchTime = 0
const GROQ_CACHE_TTL_MS = 1000 * 60 * 60 // 1 hour cache

async function getLiveGroqModels(apiKey: string): Promise<string[]> {
  const now = Date.now()
  if (cachedGroqModels && cachedGroqModels.length > 0 && now - lastGroqModelsFetchTime < GROQ_CACHE_TTL_MS) {
    return cachedGroqModels
  }

  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (res.ok) {
      const data = await res.json()
      if (Array.isArray(data?.data)) {
        const excluded = ['whisper', 'guard', 'orpheus', 'embed', 'safeguard', 'vision', 'tts']
        const models: string[] = data.data
          .map((m: any) => m.id as string)
          .filter((id: string) => id && !excluded.some((ex) => id.toLowerCase().includes(ex)))

        if (models.length > 0) {
          models.sort((a, b) => {
            const score = (id: string) => {
              if (id.includes('llama-3.3-70b')) return 100
              if (id.includes('llama-3.1-8b')) return 90
              if (id.includes('gpt-oss-120b')) return 80
              if (id.includes('qwen3.8')) return 70
              return 10
            }
            return score(b) - score(a)
          })
          cachedGroqModels = models
          lastGroqModelsFetchTime = now
          return models
        }
      }
    }
  } catch {}

  const fallbackModels = [
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
    'openai/gpt-oss-120b',
    'openai/gpt-oss-20b',
    'qwen/qwen3.8-27b',
  ]
  cachedGroqModels = fallbackModels
  lastGroqModelsFetchTime = now
  return fallbackModels
}

async function callGroqApi(
  apiKey: string,
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[],
  contextBlock: string,
  language?: string,
): Promise<AiChatResponse> {
  const url = 'https://api.groq.com/openai/v1/chat/completions'
  const promptToUse = buildSystemPrompt(language)

  // Sliding window: Retain at most the last 6 messages to cap token usage and prevent hitting TPM limits
  const recentMessages = messages.length > 6 ? messages.slice(-6) : messages

  const formattedMessages = [
    { role: 'system', content: promptToUse },
    ...recentMessages.map((m, idx) => {
      let content = m.content
      if (idx === recentMessages.length - 1 && m.role === 'user' && contextBlock) {
        content = `${contextBlock}User question: ${content}`
      }
      return { role: m.role, content }
    }),
  ]

  const groqCandidates = await getLiveGroqModels(apiKey)

  let lastError = ''
  let retryAfterSeconds = 0

  for (const model of groqCandidates) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: formattedMessages,
          temperature: 0.4,
          max_tokens: 1536,
        }),
      })

      // Rate limit (429) handling: automatically fall back to next model (e.g., 70B -> 8B-instant)
      if (res.status === 429) {
        const retryHeader = res.headers.get('retry-after')
        if (retryHeader) {
          const parsed = parseInt(retryHeader, 10)
          if (!isNaN(parsed) && parsed > 0) retryAfterSeconds = parsed
        }
        lastError = `Rate limit (429) on ${model}`
        // Try fallback model (especially 8b-instant which has 5x higher TPM)
        continue
      }

      if (res.status === 404 || res.status === 400) {
        const errText = await res.text().catch(() => '')
        if (
          errText.includes('model') ||
          errText.includes('decommissioned') ||
          errText.includes('not exist') ||
          res.status === 404
        ) {
          lastError = `Model ${model}: ${errText}`
          continue
        }
        return {
          success: false,
          error: `Groq API error (${res.status}): ${errText}`,
          providerUsed: `Groq (${model})`,
        }
      }

      if (res.status === 401) {
        return {
          success: false,
          error: 'Invalid Groq API Key. Please verify your key at console.groq.com.',
          providerUsed: 'Groq',
        }
      }

      if (!res.ok) {
        const errText = await res.text()
        return {
          success: false,
          error: `Groq API error (${res.status}): ${errText}`,
          providerUsed: `Groq (${model})`,
        }
      }

      const data = await res.json()
      const reply = data?.choices?.[0]?.message?.content || 'No response generated.'
      return {
        success: true,
        reply,
        providerUsed: `Groq (${model})`,
      }
    } catch (err: any) {
      lastError = err.message
    }
  }

  const rateLimitMsg = retryAfterSeconds > 0
    ? `Groq rate limit reached (TPM). Please wait ${retryAfterSeconds}s or switch to Gemini in settings.`
    : `Groq rate limit reached. Please wait a few seconds or switch to Gemini in settings.`

  return {
    success: false,
    error: lastError.includes('429') ? rateLimitMsg : `Groq API error: ${lastError || 'No accessible model found.'}`,
    providerUsed: 'Groq',
  }
}
