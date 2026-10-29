import React, { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Sparkles,
  Send,
  X,
  Settings,
  Trash2,
  Copy,
  Check,
  HelpCircle,
  Lightbulb,
  AlertTriangle,
  Calculator,
  ExternalLink,
  Zap,
  Square,
  Maximize2,
  Minimize2,
  Eye,
  EyeOff,
  Cpu,
  History,
  Plus,
  Search,
  MessageSquare,
  ChevronLeft,
  Globe,
} from 'lucide-react'
import type { AiChatMessage, CircuitAiContext } from '../../../../shared/ai'
import { MarkdownMessage } from './MarkdownMessage'
import { AiCopilotLogo } from './AiCopilotLogo'

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

export interface AiChatSession {
  id: string
  title: string
  circuitName: string
  createdAt: number
  updatedAt: number
  messages: AiChatMessage[]
}

interface AiCircuitAssistantProps {
  isOpen: boolean
  onClose: () => void
  context: CircuitAiContext
}

const STORAGE_KEY_AI = 'criticalpath_ai_key'
const STORAGE_KEY_PROVIDER = 'criticalpath_ai_provider'
const STORAGE_KEY_AI_LANGUAGE = 'criticalpath_ai_language'
const STORAGE_KEY_SESSIONS = 'criticalpath_ai_chat_sessions'
const STORAGE_KEY_CURRENT_SESSION_ID = 'criticalpath_ai_current_session_id'
const STORAGE_KEY_WIDTH = 'criticalpath_ai_drawer_width'

export const createWelcomeMessage = (lang?: string): AiChatMessage => {
  const normLang = (lang || 'en').split('-')[0].toLowerCase()
  let content =
    '👋 **Hello! I am CriticalPath Copilot**, your engineering assistant for circuit design and SPICE simulations.\n\nAsk me anything about schematic design, component sizing, circuit theory, or SPICE error troubleshooting.'

  if (normLang === 'hi') {
    content =
      '👋 **नमस्ते! मैं CriticalPath Copilot हूँ**, आपका सर्किट और SPICE इंजीनियरिंग सहायक।\n\nअपने सर्किट, कंपोनेंट वैल्यू या सिमुलेशन के बारे में मुझसे कोई भी प्रश्न पूछें!'
  } else if (normLang === 'mr') {
    content =
      '👋 **नमस्कार! मी CriticalPath Copilot आहे**, तुमचा सर्किट आणि SPICE अभियांत्रिकी सहाय्यक।\n\nतुमच्या सर्किट, कंपोनंट मूल्य किंवा सिम्युलेशनबद्दल मला काहीही विचारा!'
  } else if (normLang === 'te') {
    content =
      '👋 **నమస్కారం! నేను CriticalPath Copilot ని**, మీ సర్క్యూట్ మరియు SPICE ఇంజనీరింగ్ అసిస్టెంట్.\n\nమీ సర్క్యూట్, కాంపోనెంట్ విలువల లేదా సిమ్యులేషన్ గురించి నన్ను ఏదైనా అడగండి!'
  } else if (normLang === 'ta') {
    content =
      '👋 **வணக்கம்! நான் CriticalPath Copilot**, உங்கள் மின்சுற்று மற்றும் SPICE பொறியியல் உதவியாளர்.\n\nஉங்கள் மின்சுற்று அல்லது உருவகப்படுத்துதல் பிழைகள் பற்றி என்னிடம் எதையும் கேளுங்கள்!'
  } else if (normLang === 'bn') {
    content =
      '👋 **নমস্কার! আমি CriticalPath Copilot**, আপনার সার্কিট এবং SPICE ইঞ্জিনিয়ারিং সহকারী।\n\nআপনার স্কিম্যাটিক, কম্পোনেন্ট বা সিমুলেশন সম্পর্কে আমাকে যেকোনো প্রশ্ন জিজ্ঞাসা করুন!'
  } else if (normLang === 'gu') {
    content =
      '👋 **નમસ્તે! હું CriticalPath Copilot છું**, તમારો સર્કિટ અને SPICE એન્જિનિયરિંગ સહાયક.\n\nતમારા સ્કીમેટિક અથવા સિમ્યુલેશન વિશે મને કોઈપણ પ્રશ્ન પૂછો!'
  }

  return {
    id: 'welcome',
    role: 'assistant',
    content,
    timestamp: Date.now(),
  }
}

export const createNewSession = (circuitName?: string, lang?: string): AiChatSession => ({
  id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  title: 'New Conversation',
  circuitName: circuitName || 'Schematic',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  messages: [createWelcomeMessage(lang)],
})

function formatSessionDate(timestamp: number): string {
  const now = new Date()
  const date = new Date(timestamp)
  const isToday =
    now.getDate() === date.getDate() &&
    now.getMonth() === date.getMonth() &&
    now.getFullYear() === date.getFullYear()

  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export const AiCircuitAssistant: React.FC<AiCircuitAssistantProps> = ({
  isOpen,
  onClose,
  context,
}) => {
  const [sessions, setSessions] = useState<AiChatSession[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_SESSIONS)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) return parsed
      }
    } catch {}
    return [createNewSession(context.circuitName)]
  })

  const { i18n } = useTranslation()
  const currentUiLang = (i18n.language?.split('-')[0] || 'en').toLowerCase()

  const [aiLanguage, setAiLanguage] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_AI_LANGUAGE)
      if (saved && saved !== 'auto') return saved
      return (i18n.language?.split('-')[0] || 'en').toLowerCase()
    } catch {
      return (i18n.language?.split('-')[0] || 'en').toLowerCase()
    }
  })

  const effectiveLanguage = aiLanguage || currentUiLang

  // Synchronize AI Response Language setting whenever project/app language changes
  useEffect(() => {
    const lang = (i18n.language?.split('-')[0] || 'en').toLowerCase()
    setAiLanguage(lang)
    try {
      localStorage.setItem(STORAGE_KEY_AI_LANGUAGE, lang)
    } catch {}

    // Also update any untouched welcome message to the new language
    setSessions((prev) =>
      prev.map((s) => {
        if (s.messages.length === 1 && s.messages[0].id === 'welcome') {
          return {
            ...s,
            messages: [createWelcomeMessage(lang)],
          }
        }
        return s
      }),
    )
  }, [i18n.language])

  const handleSelectAiLanguage = (lang: string) => {
    setAiLanguage(lang)
    try {
      localStorage.setItem(STORAGE_KEY_AI_LANGUAGE, lang)
    } catch {}
  }

  const [currentSessionId, setCurrentSessionId] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY_CURRENT_SESSION_ID) || ''
  })

  const [showHistory, setShowHistory] = useState(false)
  const [searchHistoryQuery, setSearchHistoryQuery] = useState('')
  const [inputText, setInputText] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showKeyText, setShowKeyText] = useState(false)
  const [width, setWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_WIDTH)
      if (saved) {
        const val = parseInt(saved, 10)
        if (!isNaN(val) && val >= 320 && val <= 1400) return val
      }
    } catch {}
    return 460
  })
  const [isDragging, setIsDragging] = useState(false)
  const [isHoveringHandle, setIsHoveringHandle] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const [dismissErrorBanner, setDismissErrorBanner] = useState(false)
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(STORAGE_KEY_AI) || '')
  const [provider, setProvider] = useState<'gemini' | 'groq'>(
    () => (localStorage.getItem(STORAGE_KEY_PROVIDER) as 'gemini' | 'groq') || 'gemini',
  )
  const [tempApiKey, setTempApiKey] = useState(apiKey)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Ensure valid currentSessionId
  useEffect(() => {
    if (!currentSessionId || !sessions.some((s) => s.id === currentSessionId)) {
      if (sessions.length > 0) {
        setCurrentSessionId(sessions[0].id)
        localStorage.setItem(STORAGE_KEY_CURRENT_SESSION_ID, sessions[0].id)
      }
    }
  }, [sessions, currentSessionId])

  const activeSession = sessions.find((s) => s.id === currentSessionId) || sessions[0]
  const messages = activeSession ? activeSession.messages : [createWelcomeMessage()]
  const hasUserMessages = messages.some((m) => m.role === 'user')

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150)
    }
  }, [isOpen])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  // Reset dismissed banner if simulation error changes
  useEffect(() => {
    if (context.simError) {
      setDismissErrorBanner(false)
    }
  }, [context.simError])

  const updateSessionMessages = (
    updater: (prevMessages: AiChatMessage[]) => AiChatMessage[]
  ) => {
    setSessions((prevSessions) => {
      const targetId = activeSession ? activeSession.id : prevSessions[0]?.id
      const current = prevSessions.find((s) => s.id === targetId) || prevSessions[0]
      const updatedMsgs = updater(current.messages)

      let title = current.title
      if (title === 'New Conversation' || title === 'Circuit Assistant') {
        const firstUserMsg = updatedMsgs.find((m) => m.role === 'user')
        if (firstUserMsg) {
          title = firstUserMsg.content.slice(0, 36) + (firstUserMsg.content.length > 36 ? '...' : '')
        }
      }

      const updatedSession: AiChatSession = {
        ...current,
        title,
        circuitName: context.circuitName || current.circuitName || 'Schematic',
        updatedAt: Date.now(),
        messages: updatedMsgs,
      }

      const newSessions = prevSessions.map((s) => (s.id === targetId ? updatedSession : s))
      try {
        localStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify(newSessions))
      } catch {}
      return newSessions
    })
  }

  const handleCreateNewSession = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
      setIsLoading(false)
    }
    const newSession = createNewSession(context.circuitName, effectiveLanguage)
    setSessions((prev) => {
      const updated = [newSession, ...prev]
      try {
        localStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify(updated))
      } catch {}
      return updated
    })
    setCurrentSessionId(newSession.id)
    localStorage.setItem(STORAGE_KEY_CURRENT_SESSION_ID, newSession.id)
    setShowHistory(false)
    setTimeout(() => inputRef.current?.focus(), 150)
  }

  const handleSelectSession = (sessionId: string) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
      setIsLoading(false)
    }
    setCurrentSessionId(sessionId)
    localStorage.setItem(STORAGE_KEY_CURRENT_SESSION_ID, sessionId)
    setShowHistory(false)
    setTimeout(() => inputRef.current?.focus(), 150)
  }

  const handleDeleteSession = (sessionId: string) => {
    setSessions((prev) => {
      const remaining = prev.filter((s) => s.id !== sessionId)
      const finalSessions = remaining.length > 0 ? remaining : [createNewSession(context.circuitName, effectiveLanguage)]
      try {
        localStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify(finalSessions))
      } catch {}
      if (sessionId === currentSessionId) {
        const nextId = finalSessions[0].id
        setCurrentSessionId(nextId)
        localStorage.setItem(STORAGE_KEY_CURRENT_SESSION_ID, nextId)
      }
      return finalSessions
    })
  }

  const handleSaveSettings = () => {
    const trimmed = tempApiKey.trim()
    setApiKey(trimmed)
    localStorage.setItem(STORAGE_KEY_AI, trimmed)
    localStorage.setItem(STORAGE_KEY_PROVIDER, provider)
    setShowSettings(false)
  }

  const handleToggleProvider = (newProv: 'gemini' | 'groq') => {
    setProvider(newProv)
    localStorage.setItem(STORAGE_KEY_PROVIDER, newProv)
  }

  const handleStopTask = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setIsLoading(false)
    updateSessionMessages((prev) => [
      ...prev,
      {
        id: `stop-${Date.now()}`,
        role: 'assistant',
        content: '⏹ *Response generation stopped.*',
        timestamp: Date.now(),
      },
    ])
  }

  const handleSendMessage = async (textToSend?: string) => {
    const messageContent = (textToSend || inputText).trim()
    if (!messageContent || isLoading) return

    const userMsg: AiChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: messageContent,
      timestamp: Date.now(),
    }

    updateSessionMessages((prev) => [...prev, userMsg])
    if (!textToSend) setInputText('')
    setIsLoading(true)

    const controller = new AbortController()
    abortControllerRef.current = controller

    // Check if key is present
    if (!apiKey) {
      setTimeout(() => {
        updateSessionMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: 'assistant',
            content:
              '⚠️ **API Key Required**\n\nTo enable instant circuit analysis, please provide a free **Google Gemini** or **Groq Cloud** API key.\n\n1. Get your free key at [Google AI Studio](https://aistudio.google.com/app/apikey) or [Groq Cloud Console](https://console.groq.com/keys).\n2. Click the **⚙️ Settings** icon in the header to save it.',
            timestamp: Date.now(),
          },
        ])
        setIsLoading(false)
      }, 300)
      return
    }

    try {
      const historyToSend = messages
        .filter((m) => m.id !== 'welcome')
        .concat(userMsg)
        .map((m) => ({ role: m.role, content: m.content }))

      let response: { success: boolean; reply?: string; error?: string }

      if (typeof window !== 'undefined' && window.api && typeof window.api.aiChat === 'function') {
        response = await window.api.aiChat({
          messages: historyToSend,
          context,
          apiKey,
          provider,
          language: effectiveLanguage,
        })
      } else {
        response = await callAiDirect(apiKey, provider, historyToSend, context, controller.signal, effectiveLanguage)
      }

      if (controller.signal.aborted || response.error === 'ABORTED') {
        return
      }

      if (response.success && response.reply) {
        updateSessionMessages((prev) => [
          ...prev,
          {
            id: `asst-${Date.now()}`,
            role: 'assistant',
            content: response.reply!,
            timestamp: Date.now(),
          },
        ])
      } else {
        updateSessionMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: 'assistant',
            content: `❌ **Error**: ${response.error || 'Failed to generate response.'}`,
            timestamp: Date.now(),
          },
        ])
      }
    } catch (err: any) {
      if (controller.signal.aborted || err.name === 'AbortError') {
        return
      }
      updateSessionMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: `❌ **Connection Error**: ${err.message || 'Unable to communicate with AI engine.'}`,
          timestamp: Date.now(),
        },
      ])
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false)
      }
      abortControllerRef.current = null
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape' && isLoading) {
      e.preventDefault()
      handleStopTask()
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!isLoading) {
        handleSendMessage()
      }
    }
  }

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
    const startX = e.clientX
    const startWidth = width

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = startX - moveEvent.clientX // moving left expands drawer width
      const rawWidth = startWidth + delta
      const minWidth = 320
      const maxWidth = Math.max(minWidth, window.innerWidth * 0.9)
      const clamped = Math.round(Math.min(Math.max(rawWidth, minWidth), maxWidth))
      setWidth(clamped)
    }

    const handleMouseUp = (upEvent: MouseEvent) => {
      setIsDragging(false)
      const delta = startX - upEvent.clientX
      const rawWidth = startWidth + delta
      const minWidth = 320
      const maxWidth = Math.max(minWidth, window.innerWidth * 0.9)
      const finalWidth = Math.round(Math.min(Math.max(rawWidth, minWidth), maxWidth))
      try {
        localStorage.setItem(STORAGE_KEY_WIDTH, String(finalWidth))
      } catch {}
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

  const toggleExpand = () => {
    const newWidth = width >= 640 ? 460 : 720
    setWidth(newWidth)
    try {
      localStorage.setItem(STORAGE_KEY_WIDTH, String(newWidth))
    } catch {}
  }

  const filteredSessions = sessions.filter((s) => {
    if (!searchHistoryQuery.trim()) return true
    const q = searchHistoryQuery.toLowerCase()
    return (
      s.title.toLowerCase().includes(q) ||
      (s.circuitName && s.circuitName.toLowerCase().includes(q)) ||
      s.messages.some((m) => m.content.toLowerCase().includes(q))
    )
  })

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width,
        maxWidth: '96vw',
        background: '#ffffff',
        borderLeft: '1px solid #e2e8f0',
        boxShadow: '-8px 0 24px rgba(15, 23, 42, 0.08)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 1000,
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        transition: isDragging ? 'none' : 'width 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
        userSelect: isDragging ? 'none' : 'auto',
        animation: 'copilotSlideIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {/* Left-edge Horizontal Drag Resize Handle */}
      <div
        onMouseDown={handleResizeMouseDown}
        onDoubleClick={toggleExpand}
        onMouseEnter={() => setIsHoveringHandle(true)}
        onMouseLeave={() => setIsHoveringHandle(false)}
        title="Drag horizontally to resize window (Double-click to toggle width)"
        style={{
          position: 'absolute',
          left: -4,
          top: 0,
          bottom: 0,
          width: 8,
          cursor: 'col-resize',
          zIndex: 60,
          background: 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: isDragging || isHoveringHandle ? 3 : 1,
            height: '100%',
            background: isDragging || isHoveringHandle ? '#6366f1' : 'transparent',
            boxShadow: isDragging || isHoveringHandle ? '0 0 6px rgba(99, 102, 241, 0.5)' : 'none',
            transition: 'all 0.15s ease',
          }}
        />
      </div>
      <style>{`
        @keyframes copilotSlideIn {
          from { transform: translateX(100%); opacity: 0.7; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes copilotPulseWave {
          0%, 100% { transform: scaleY(0.4); opacity: 0.4; }
          50% { transform: scaleY(1); opacity: 1; }
        }
        .copilot-pulse-bar {
          display: inline-block;
          width: 3px;
          height: 12px;
          background: #6366f1;
          border-radius: 2px;
          margin: 0 1.5px;
          animation: copilotPulseWave 1s infinite ease-in-out;
        }
        .copilot-pulse-bar:nth-child(2) { animation-delay: 0.15s; }
        .copilot-pulse-bar:nth-child(3) { animation-delay: 0.3s; }
        .copilot-scroll::-webkit-scrollbar {
          width: 5px;
          height: 5px;
        }
        .copilot-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .copilot-scroll::-webkit-scrollbar-thumb {
          background: #e2e8f0;
          border-radius: 4px;
        }
        .copilot-scroll::-webkit-scrollbar-thumb:hover {
          background: #cbd5e1;
        }
        .copilot-prompt-card:hover {
          border-color: #6366f1 !important;
          background: #f8fafc !important;
          transform: translateY(-1px);
        }
        .copilot-header-btn:hover {
          color: #ffffff !important;
          background: rgba(255, 255, 255, 0.1) !important;
        }
      `}</style>

      {/* Clean, Refined Header */}
      <div
        style={{
          height: 48,
          padding: '0 14px',
          background: '#0f172a',
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #1e293b',
          flexShrink: 0,
        }}
      >
        {/* Left: Logo & Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: 6,
              background: 'linear-gradient(135deg, #312e81 0%, #4338ca 100%)',
              border: '1px solid rgba(165, 180, 252, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <AiCopilotLogo size={14} active glow />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '-0.01em', color: '#f8fafc' }}>
              Copilot
            </span>
            <span
              style={{
                fontSize: 10,
                color: '#94a3b8',
                background: 'rgba(255, 255, 255, 0.06)',
                padding: '2px 7px',
                borderRadius: 4,
                fontWeight: 500,
                maxWidth: 130,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              title={context.circuitName || 'Schematic'}
            >
              {context.circuitName || 'Schematic'}
            </span>
          </div>
        </div>

        {/* Right: Actions Group */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {/* AI Response Language Selector (Left of + sign) */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', marginRight: 2 }}>
            <Globe
              size={12}
              color="#a5b4fc"
              style={{ position: 'absolute', left: 7, pointerEvents: 'none', zIndex: 1 }}
            />
            <select
              value={aiLanguage}
              onChange={(e) => handleSelectAiLanguage(e.target.value)}
              title={`AI Response Language (Active: ${LANGUAGE_NAMES[effectiveLanguage] || effectiveLanguage})`}
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                color: '#f1f5f9',
                border: '1px solid rgba(255, 255, 255, 0.16)',
                borderRadius: 5,
                padding: '2px 6px 2px 22px',
                fontSize: 11,
                fontWeight: 500,
                height: 25,
                cursor: 'pointer',
                outline: 'none',
                maxWidth: 105,
              }}
            >
              <option value="en" style={{ background: '#0f172a', color: '#f8fafc' }}>English</option>
              <option value="hi" style={{ background: '#0f172a', color: '#f8fafc' }}>हिन्दी (Hindi)</option>
              <option value="mr" style={{ background: '#0f172a', color: '#f8fafc' }}>मराठी (Marathi)</option>
              <option value="te" style={{ background: '#0f172a', color: '#f8fafc' }}>తెలుగు (Telugu)</option>
              <option value="ta" style={{ background: '#0f172a', color: '#f8fafc' }}>தமிழ் (Tamil)</option>
              <option value="bn" style={{ background: '#0f172a', color: '#f8fafc' }}>বাংলা (Bengali)</option>
              <option value="gu" style={{ background: '#0f172a', color: '#f8fafc' }}>ગુજરાતી (Gujarati)</option>
              <option value="es" style={{ background: '#0f172a', color: '#f8fafc' }}>Español</option>
              <option value="fr" style={{ background: '#0f172a', color: '#f8fafc' }}>Français</option>
              <option value="de" style={{ background: '#0f172a', color: '#f8fafc' }}>Deutsch</option>
              <option value="zh" style={{ background: '#0f172a', color: '#f8fafc' }}>中文</option>
              <option value="ja" style={{ background: '#0f172a', color: '#f8fafc' }}>日本語</option>
            </select>
          </div>

          {/* New Chat Button */}
          <button
            onClick={handleCreateNewSession}
            title="New Conversation"
            className="copilot-header-btn"
            style={headerBtnStyle}
          >
            <Plus size={15} />
          </button>

          {/* History Button */}
          <button
            onClick={() => {
              setShowHistory(!showHistory)
              setShowSettings(false)
            }}
            title="Chat History"
            className="copilot-header-btn"
            style={{
              ...headerBtnStyle,
              background: showHistory ? 'rgba(99, 102, 241, 0.25)' : 'transparent',
              color: showHistory ? '#c084fc' : '#94a3b8',
            }}
          >
            <History size={15} />
          </button>

          {/* Settings Button */}
          <button
            onClick={() => {
              setShowSettings(!showSettings)
              setShowHistory(false)
            }}
            title="Settings (API Key & Model)"
            className="copilot-header-btn"
            style={{
              ...headerBtnStyle,
              position: 'relative',
              background: showSettings ? 'rgba(99, 102, 241, 0.25)' : 'transparent',
              color: showSettings ? '#a5b4fc' : '#94a3b8',
            }}
          >
            <Settings size={15} />
            {!apiKey && (
              <span
                style={{
                  position: 'absolute',
                  top: 5,
                  right: 5,
                  width: 5,
                  height: 5,
                  borderRadius: '50%',
                  background: '#f59e0b',
                }}
              />
            )}
          </button>

          {/* Expand / Minimize Toggle */}
          <button
            onClick={toggleExpand}
            title={width >= 640 ? 'Standard width (460px)' : 'Expand width (720px)'}
            className="copilot-header-btn"
            style={headerBtnStyle}
          >
            {width >= 640 ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>

          {/* Close Drawer */}
          <button
            onClick={onClose}
            title="Close"
            className="copilot-header-btn"
            style={{ ...headerBtnStyle, marginLeft: 2 }}
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Slide-over: Chat History Drawer */}
      {showHistory && (
        <div
          style={{
            position: 'absolute',
            top: 48,
            left: 0,
            right: 0,
            bottom: 0,
            background: '#ffffff',
            zIndex: 30,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              padding: '10px 14px',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#f8fafc',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                onClick={() => setShowHistory(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#475569',
                  cursor: 'pointer',
                  padding: 4,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <ChevronLeft size={16} />
              </button>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>
                Conversation History ({sessions.length})
              </span>
            </div>
            <button
              onClick={handleCreateNewSession}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 9px',
                borderRadius: 5,
                background: '#4f46e5',
                color: '#ffffff',
                border: 'none',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Plus size={12} /> New Chat
            </button>
          </div>

          {/* Search Bar */}
          <div style={{ padding: '8px 12px', borderBottom: '1px solid #f1f5f9' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                borderRadius: 6,
                padding: '4px 8px',
              }}
            >
              <Search size={13} color="#94a3b8" />
              <input
                type="text"
                placeholder="Search history..."
                value={searchHistoryQuery}
                onChange={(e) => setSearchHistoryQuery(e.target.value)}
                style={{
                  flex: 1,
                  border: 'none',
                  outline: 'none',
                  fontSize: 11.5,
                  background: 'transparent',
                  color: '#0f172a',
                }}
              />
              {searchHistoryQuery && (
                <button
                  onClick={() => setSearchHistoryQuery('')}
                  style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0 }}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Sessions List */}
          <div
            className="copilot-scroll"
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '8px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            {filteredSessions.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
                No conversations found.
              </div>
            ) : (
              filteredSessions.map((s) => {
                const isActive = s.id === currentSessionId
                return (
                  <div
                    key={s.id}
                    onClick={() => handleSelectSession(s.id)}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 6,
                      background: isActive ? '#f0fdf4' : '#ffffff',
                      border: isActive ? '1px solid #bbf7d0' : '1px solid #e2e8f0',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <MessageSquare size={13} color={isActive ? '#16a34a' : '#64748b'} />
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: isActive ? 700 : 500,
                            color: isActive ? '#15803d' : '#0f172a',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {s.title}
                        </span>
                      </div>
                      <div style={{ fontSize: 10, color: '#94a3b8', display: 'flex', gap: 6 }}>
                        <span>{s.circuitName || 'Schematic'}</span>
                        <span>·</span>
                        <span>{s.messages.length} msg{s.messages.length === 1 ? '' : 's'}</span>
                        <span>·</span>
                        <span>{formatSessionDate(s.updatedAt)}</span>
                      </div>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteSession(s.id)
                      }}
                      title="Delete conversation"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#94a3b8',
                        cursor: 'pointer',
                        padding: 4,
                        borderRadius: 4,
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}

      {/* Slide-over: Settings Drawer */}
      {showSettings && (
        <div
          style={{
            position: 'absolute',
            top: 48,
            left: 0,
            right: 0,
            bottom: 0,
            background: '#ffffff',
            zIndex: 30,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              padding: '10px 14px',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#f8fafc',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                onClick={() => setShowSettings(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#475569',
                  cursor: 'pointer',
                  padding: 4,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <ChevronLeft size={16} />
              </button>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>
                AI Assistant Settings
              </span>
            </div>
            <button
              onClick={handleSaveSettings}
              style={{
                padding: '4px 12px',
                borderRadius: 5,
                background: '#4f46e5',
                color: '#ffffff',
                border: 'none',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Save Changes
            </button>
          </div>

          <div
            className="copilot-scroll"
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            {/* Model Provider Toggle */}
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>
                AI Engine Provider
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div
                  onClick={() => handleToggleProvider('gemini')}
                  style={{
                    padding: '10px',
                    borderRadius: 8,
                    border: provider === 'gemini' ? '2px solid #4f46e5' : '1px solid #e2e8f0',
                    background: provider === 'gemini' ? '#f5f3ff' : '#ffffff',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span style={{ fontWeight: 700, fontSize: 12, color: '#1e1b4b', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Sparkles size={13} color="#4f46e5" /> Google Gemini
                    </span>
                    {provider === 'gemini' && <Check size={13} color="#4f46e5" />}
                  </div>
                  <div style={{ fontSize: 10, color: '#64748b' }}>
                    Gemini 3.8 Flash · Free tier · Circuit theory & formulas
                  </div>
                </div>

                <div
                  onClick={() => handleToggleProvider('groq')}
                  style={{
                    padding: '10px',
                    borderRadius: 8,
                    border: provider === 'groq' ? '2px solid #10b981' : '1px solid #e2e8f0',
                    background: provider === 'groq' ? '#f0fdf4' : '#ffffff',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span style={{ fontWeight: 700, fontSize: 12, color: '#064e3b', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Zap size={13} color="#10b981" /> Groq Cloud
                    </span>
                    {provider === 'groq' && <Check size={13} color="#10b981" />}
                  </div>
                  <div style={{ fontSize: 10, color: '#64748b' }}>
                    Sub-second LPU speed · Best for SPICE netlists
                  </div>
                </div>
              </div>
            </div>

            {/* API Key */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <label style={{ fontSize: 11.5, fontWeight: 700, color: '#334155' }}>
                  API Key ({provider === 'groq' ? 'Groq Key' : 'Google AI Studio Key'})
                </label>
                {apiKey && (
                  <span style={{ fontSize: 10.5, color: '#16a34a', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
                    <Check size={11} /> Saved
                  </span>
                )}
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  type={showKeyText ? 'text' : 'password'}
                  placeholder={provider === 'groq' ? 'gsk_...' : 'AIzaSy...'}
                  value={tempApiKey}
                  onChange={(e) => setTempApiKey(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 34px 8px 10px',
                    borderRadius: 6,
                    border: '1px solid #cbd5e1',
                    fontSize: 12,
                    fontFamily: 'Consolas, monospace',
                    background: '#f8fafc',
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowKeyText(!showKeyText)}
                  title={showKeyText ? 'Hide' : 'Show'}
                  style={{
                    position: 'absolute',
                    right: 8,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: '#64748b',
                    cursor: 'pointer',
                    padding: 2,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  {showKeyText ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, fontSize: 10.5 }}>
                <span style={{ color: '#94a3b8' }}>Keys remain safely on your computer.</span>
                <a
                  href={provider === 'groq' ? 'https://console.groq.com/keys' : 'https://aistudio.google.com/app/apikey'}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: '#4f46e5', textDecoration: 'none', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }}
                >
                  Get free key <ExternalLink size={10} />
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Conditional SPICE Simulation Error Pill */}
      {context.simError && !dismissErrorBanner && !context.simError.toLowerCase().includes('empty') && context.componentSummary !== 'Empty canvas' && (
        <div
          style={{
            margin: '8px 12px 0 12px',
            padding: '7px 10px',
            borderRadius: 6,
            background: '#fef2f2',
            border: '1px solid #fecaca',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            fontSize: 11,
            color: '#991b1b',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <AlertTriangle size={13} color="#dc2626" style={{ flexShrink: 0 }} />
            <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              SPICE Error: {context.simError}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <button
              onClick={() => handleSendMessage(`Analyze and fix this SPICE simulation error step-by-step: ${context.simError}`)}
              style={{
                background: '#dc2626',
                color: '#ffffff',
                border: 'none',
                borderRadius: 4,
                padding: '2px 7px',
                fontSize: 10,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Diagnose
            </button>
            <button
              onClick={() => setDismissErrorBanner(true)}
              style={{ background: 'none', border: 'none', color: '#991b1b', cursor: 'pointer', padding: 2 }}
            >
              <X size={12} />
            </button>
          </div>
        </div>
      )}

      {/* Main Messages View */}
      <div
        className="copilot-scroll"
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          background: '#ffffff',
        }}
      >
        {/* Welcome Empty State (Only shown before user sends first message) */}
        {!hasUserMessages && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div
              style={{
                padding: '14px',
                borderRadius: 10,
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Sparkles size={15} color="#4f46e5" />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                  CriticalPath Copilot
                </span>
              </div>
              <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: '#475569' }}>
                Your engineering assistant for circuit design, component sizing, and SPICE simulation troubleshooting.
              </p>
            </div>

            {/* Clean Prompt Action Cards */}
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
                Suggested Prompts
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <button
                  onClick={() => handleSendMessage('Review my current schematic and check for any wiring mistakes, missing grounds, or floating nets.')}
                  className="copilot-prompt-card"
                  style={promptCardStyle}
                >
                  <HelpCircle size={14} color="#3b82f6" />
                  <div>
                    <div style={{ fontWeight: 600, color: '#0f172a' }}>Review Schematic</div>
                    <div style={{ fontSize: 10, color: '#64748b' }}>Check floating nets & grounds</div>
                  </div>
                </button>

                <button
                  onClick={() => handleSendMessage('How should I choose and calculate the component values (resistors, capacitors, bias) for this circuit?')}
                  className="copilot-prompt-card"
                  style={promptCardStyle}
                >
                  <Calculator size={14} color="#8b5cf6" />
                  <div>
                    <div style={{ fontWeight: 600, color: '#0f172a' }}>Component Sizing</div>
                    <div style={{ fontSize: 10, color: '#64748b' }}>Calculate standard values</div>
                  </div>
                </button>

                <button
                  onClick={() => handleSendMessage('What SPICE simulation parameters (.tran, .ac, .dc) are best suited for testing this circuit?')}
                  className="copilot-prompt-card"
                  style={promptCardStyle}
                >
                  <Cpu size={14} color="#10b981" />
                  <div>
                    <div style={{ fontWeight: 600, color: '#0f172a' }}>Simulation Setup</div>
                    <div style={{ fontSize: 10, color: '#64748b' }}>Recommend .tran / .ac directives</div>
                  </div>
                </button>

                <button
                  onClick={() => handleSendMessage('Suggest what I should connect or do next on this schematic.')}
                  className="copilot-prompt-card"
                  style={promptCardStyle}
                >
                  <Lightbulb size={14} color="#f59e0b" />
                  <div>
                    <div style={{ fontWeight: 600, color: '#0f172a' }}>Suggest Next Step</div>
                    <div style={{ fontSize: 10, color: '#64748b' }}>Circuit design advice</div>
                  </div>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Conversation Thread */}
        {messages.map((m) => {
          const isUser = m.role === 'user'
          return (
            <div
              key={m.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                alignSelf: isUser ? 'flex-end' : 'stretch',
                maxWidth: isUser ? '85%' : '100%',
              }}
            >
              {isUser ? (
                /* User Message Bubble */
                <div
                  style={{
                    background: '#4f46e5',
                    color: '#ffffff',
                    padding: '8px 12px',
                    borderRadius: '14px 14px 2px 14px',
                    fontSize: 12.5,
                    lineHeight: 1.5,
                    boxShadow: '0 1px 3px rgba(79, 70, 229, 0.15)',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {m.content}
                </div>
              ) : (
                /* Assistant Message View */
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    paddingBottom: 6,
                  }}
                >
                  {/* Assistant Message Header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: 4,
                          background: '#e0e7ff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Sparkles size={11} color="#4338ca" />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>
                        Copilot
                      </span>
                    </div>

                    <button
                      onClick={() => handleCopy(m.content, m.id)}
                      title="Copy response"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: copiedId === m.id ? '#16a34a' : '#94a3b8',
                        cursor: 'pointer',
                        padding: 3,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 3,
                        fontSize: 10,
                      }}
                    >
                      {copiedId === m.id ? (
                        <>
                          <Check size={11} /> Copied
                        </>
                      ) : (
                        <Copy size={11} />
                      )}
                    </button>
                  </div>

                  {/* Assistant Body */}
                  <div
                    style={{
                      fontSize: 12.5,
                      lineHeight: 1.6,
                      color: '#0f172a',
                    }}
                  >
                    <MarkdownMessage content={m.content} />
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {/* Generating / Loading State */}
        {isLoading && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              borderRadius: 8,
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', height: 14 }}>
                <span className="copilot-pulse-bar" />
                <span className="copilot-pulse-bar" />
                <span className="copilot-pulse-bar" />
              </div>
              <span style={{ fontSize: 11.5, color: '#475569', fontWeight: 500 }}>
                Copilot is analyzing your circuit...
              </span>
            </div>
            <button
              onClick={handleStopTask}
              title="Stop (Esc)"
              style={{
                background: '#fee2e2',
                color: '#dc2626',
                border: '1px solid #fca5a5',
                borderRadius: 4,
                padding: '2px 7px',
                fontSize: 10,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
              }}
            >
              <Square size={8} fill="currentColor" /> Stop
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Clean Composer Box */}
      <div
        style={{
          padding: '10px 14px 12px 14px',
          borderTop: '1px solid #e2e8f0',
          background: '#ffffff',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            background: '#f8fafc',
            border: isFocused ? '1px solid #6366f1' : '1px solid #cbd5e1',
            boxShadow: isFocused ? '0 0 0 2px rgba(99, 102, 241, 0.15)' : 'none',
            borderRadius: 8,
            padding: '8px 10px',
            transition: 'all 0.15s ease',
          }}
        >
          <textarea
            ref={inputRef}
            rows={2}
            placeholder="Ask about components, circuit calculations, SPICE..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            style={{
              width: '100%',
              border: 'none',
              background: 'transparent',
              outline: 'none',
              resize: 'none',
              fontSize: 12.5,
              fontFamily: 'inherit',
              lineHeight: 1.45,
              color: '#0f172a',
              boxSizing: 'border-box',
            }}
          />

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingTop: 6,
              borderTop: '1px solid #edf2f7',
              marginTop: 2,
            }}
          >
            {/* Model Toggle Pill */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                type="button"
                onClick={() => handleToggleProvider(provider === 'gemini' ? 'groq' : 'gemini')}
                title="Click to toggle model"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '2px 7px',
                  borderRadius: 4,
                  background: provider === 'groq' ? '#f0fdf4' : '#eff6ff',
                  border: `1px solid ${provider === 'groq' ? '#bbf7d0' : '#bfdbfe'}`,
                  color: provider === 'groq' ? '#15803d' : '#1d4ed8',
                  fontSize: 10.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {provider === 'groq' ? <Zap size={10} color="#16a34a" /> : <Sparkles size={10} color="#2563eb" />}
                {provider === 'groq' ? 'Groq LPU' : 'Gemini 3.8'}
              </button>

              <span style={{ fontSize: 10, color: '#94a3b8' }}>
                Synced
              </span>
            </div>

            {/* Send / Stop Button */}
            {isLoading ? (
              <button
                onClick={handleStopTask}
                title="Stop task (Esc)"
                style={{
                  height: 26,
                  padding: '0 8px',
                  borderRadius: 4,
                  background: '#ef4444',
                  color: '#ffffff',
                  border: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  cursor: 'pointer',
                  fontSize: 10.5,
                  fontWeight: 600,
                }}
              >
                <Square size={9} fill="currentColor" /> Stop
              </button>
            ) : (
              <button
                onClick={() => handleSendMessage()}
                disabled={!inputText.trim()}
                title="Send (Enter)"
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 4,
                  background: !inputText.trim() ? '#cbd5e1' : '#4f46e5',
                  color: '#ffffff',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: !inputText.trim() ? 'default' : 'pointer',
                  transition: 'background 0.15s ease',
                  flexShrink: 0,
                }}
              >
                <Send size={12} />
              </button>
            )}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: 4,
            fontSize: 9.5,
            color: '#94a3b8',
          }}
        >
          <span>Enter to send · Shift+Enter for newline</span>
          <span>CriticalPath Copilot</span>
        </div>
      </div>
    </div>
  )
}

const headerBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#94a3b8',
  cursor: 'pointer',
  padding: '5px 7px',
  borderRadius: 4,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'all 0.15s ease',
}

const promptCardStyle: React.CSSProperties = {
  padding: '10px',
  borderRadius: 8,
  background: '#ffffff',
  border: '1px solid #e2e8f0',
  textAlign: 'left',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
  fontSize: 11,
  lineHeight: 1.3,
  transition: 'all 0.15s ease',
  boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
}

const SYSTEM_PROMPT = `You are CriticalPath Copilot, an elite Electrical Engineering & SPICE simulation assistant built directly into the CriticalPath EDA application.
You have deep expertise in circuit theory, analog electronics, semiconductor devices (BJTs, MOSFETs, diodes, op-amps), SPICE netlist syntax, and ngspice convergence/singular-matrix troubleshooting.
Give clear, direct, and technically accurate explanations. Suggest practical standard component values (E12/E24 series). Use clean Markdown with code blocks for SPICE syntax.

Mathematical & Formula Formatting Rules:
- NEVER output raw LaTeX syntax (do NOT use \\frac, \\text{}, \\times, \\Omega, \\Longrightarrow, \\approx, or \\[ ... \\] / [ ... ] equation delimiters).
- Format all circuit formulas, equations, and calculations in clean, natural engineering text using standard Unicode symbols (e.g. "Av = 1 + (R1 / R2) = 4", "R2 = Vref / Idiv = 6 kΩ", "R1 = 4 × R2 = 24 kΩ", "fc = 1 / (2π · R · C)", "Ω", "kΩ", "MΩ", "µF", "pF", "×", "·", "≈", "Δ", "π", "→").
- NEVER wrap formulas, equations, calculations, or numbers in ** asterisks. Present standalone formulas cleanly on their own lines without asterisks.
- Only use ** bolding sparingly for key conceptual terms (e.g. **reference resistor**, **feedback loop**).`

function buildDirectSystemPrompt(language?: string): string {
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

async function callAiDirect(
  apiKey: string,
  provider: 'gemini' | 'groq',
  messages: { role: string; content: string }[],
  context: CircuitAiContext,
  signal?: AbortSignal,
  language?: string,
): Promise<{ success: boolean; reply?: string; error?: string }> {
  if (signal?.aborted) return { success: false, error: 'ABORTED' }

  const promptToUse = buildDirectSystemPrompt(language)

  let contextBlock = ''
  if (context) {
    const parts: string[] = []
    if (context.circuitName) parts.push(`Active Schematic: ${context.circuitName}`)
    if (context.componentSummary) parts.push(`Components on Canvas: ${context.componentSummary}`)
    if (context.simStatus) parts.push(`Simulation Status: ${context.simStatus}`)
    if (context.simError) parts.push(`Recent Simulation Error: ${context.simError}`)
    if (context.ercErrors && context.ercErrors.length > 0) {
      parts.push(`Electrical Rule Checks: ${context.ercErrors.join('; ')}`)
    }
    if (context.netlist) {
      let netlistText = context.netlist.trim()
      if (netlistText.length > 3000) {
        netlistText = netlistText.slice(0, 3000) + '\n... [Netlist truncated to save tokens] ...\n.end'
      }
      parts.push(`Generated SPICE Netlist:\n\`\`\`spice\n${netlistText}\n\`\`\``)
    }
    if (parts.length > 0) {
      contextBlock = `[CURRENT SCHEMATIC CONTEXT]\n${parts.join('\n\n')}\n[END CONTEXT]\n\n`
    }
  }

  if (provider === 'groq' || apiKey.startsWith('gsk_')) {
    const url = 'https://api.groq.com/openai/v1/chat/completions'
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
    const groqCandidates = [
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant',
      'openai/gpt-oss-120b',
      'openai/gpt-oss-20b',
      'qwen/qwen3.8-27b',
    ]

    let lastError = ''
    let retryAfterSeconds = 0
    for (const model of groqCandidates) {
      if (signal?.aborted) return { success: false, error: 'ABORTED' }
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
          signal,
        })

        // On 429 rate limit: capture wait time and fall back to 8b-instant
        if (res.status === 429) {
          const retryHeader = res.headers.get('retry-after')
          if (retryHeader) {
            const parsed = parseInt(retryHeader, 10)
            if (!isNaN(parsed) && parsed > 0) retryAfterSeconds = parsed
          }
          lastError = `Rate limit (429) on ${model}`
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
          return { success: false, error: `Groq error (${res.status}): ${errText}` }
        }

        if (res.status === 401) {
          return { success: false, error: 'Invalid Groq API Key. Please verify your key at console.groq.com.' }
        }

        if (!res.ok) {
          const errText = await res.text()
          return { success: false, error: `Groq error (${res.status}): ${errText}` }
        }

        const data = await res.json()
        return { success: true, reply: data?.choices?.[0]?.message?.content || 'No response generated.' }
      } catch (err: any) {
        if (err.name === 'AbortError' || signal?.aborted) {
          return { success: false, error: 'ABORTED' }
        }
        lastError = err.message
      }
    }

    const rateLimitMsg = retryAfterSeconds > 0
      ? `Groq rate limit reached (TPM). Please wait ${retryAfterSeconds}s or switch to Gemini in settings.`
      : `Groq rate limit reached. Please wait a few seconds or switch to Gemini in settings.`

    return {
      success: false,
      error: lastError.includes('429') ? rateLimitMsg : `Groq error: ${lastError || 'No accessible model found.'}`,
    }
  } else {
    const candidateModels = ['gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-1.5-pro']
    const contents = messages.map((m, idx) => {
      let text = m.content
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
      if (signal?.aborted) return { success: false, error: 'ABORTED' }
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
          signal,
        })

        if (res.status === 404 || res.status === 503 || res.status === 429) {
          const errText = await res.text().catch(() => '')
          lastError = `Model ${model} returned ${res.status}: ${errText}`
          continue
        }

        if (!res.ok) {
          const errText = await res.text()
          let parsedMsg = errText
          try {
            const parsed = JSON.parse(errText)
            if (parsed.error?.message) parsedMsg = parsed.error.message
          } catch { }
          return { success: false, error: `Gemini error (${res.status}): ${parsedMsg}` }
        }

        const data = await res.json()
        const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated.'
        return { success: true, reply }
      } catch (err: any) {
        if (err.name === 'AbortError' || signal?.aborted) {
          return { success: false, error: 'ABORTED' }
        }
        lastError = err.message
      }
    }
    return { success: false, error: `Gemini server error: ${lastError || 'No accessible model found.'}` }
  }
}
