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
  Key,
  ExternalLink,
  Bot,
  Zap,
  Square,
  Maximize2,
  Minimize2,
  Eye,
  EyeOff,
  Cpu,
  FileCode,
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

export const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  hi: 'Hindi (हिन्दी)',
  mr: 'Marathi (मराठी)',
  bn: 'Bengali (বাংলা)',
  ta: 'Tamil (தமிழ்)',
  te: 'Telugu (తెలుగు)',
  gu: 'Gujarati (ગુજરાતી)',
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

export const createWelcomeMessage = (lang?: string): AiChatMessage => {
  const normLang = (lang || 'en').split('-')[0].toLowerCase()
  let content =
    '👋 **Hello! I am CriticalPath Copilot**, your real-time circuit and SPICE engineering assistant.\n\nAsk me **any question** about your schematic, component sizing, circuit theory, or SPICE errors! What are you building today?'

  if (normLang === 'hi') {
    content =
      '👋 **नमस्ते! मैं CriticalPath Copilot हूँ**, आपका सर्किट और SPICE इंजीनियरिंग सहायक।\n\nअपने सर्किट, कंपोनेंट वैल्यू या सिमुलेशन के बारे में मुझसे कोई भी प्रश्न पूछें! आज आप क्या बना रहे हैं?'
  } else if (normLang === 'mr') {
    content =
      '👋 **नमस्कार! मी CriticalPath Copilot आहे**, तुमचा सर्किट आणि SPICE अभियांत्रिकी सहाय्यक।\n\nतुमच्या सर्किट, कंपोनंट मूल्य किंवा सिम्युलेशनबद्दल मला काहीही विचारा! आज तुम्ही काय डिझाइन करत आहात?'
  } else if (normLang === 'te') {
    content =
      '👋 **నమస్కారం! నేను CriticalPath Copilot ని**, మీ సర్క్యూట్ మరియు SPICE ఇంజనీరింగ్ అసిస్టెంట్.\n\nమీ సర్క్యూట్, కాంపోనెంట్ విలువల లేదా సిమ్యులేషన్ గురించి నన్ను ఏదైనా అడగండి! ఈ రోజు మీరు ఏమి తయారు చేస్తున్నారు?'
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
  const [aiLanguage, setAiLanguage] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY_AI_LANGUAGE) || 'auto'
    } catch {
      return 'auto'
    }
  })

  const currentUiLang = (i18n.language?.split('-')[0] || 'en').toLowerCase()
  const effectiveLanguage = aiLanguage === 'auto' ? currentUiLang : aiLanguage

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
  const [isExpanded, setIsExpanded] = useState(false)
  const [showKeyText, setShowKeyText] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
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

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150)
    }
  }, [isOpen])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

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
      const updated = prev.filter((s) => s.id !== sessionId)
      let finalSessions = updated
      if (finalSessions.length === 0) {
        finalSessions = [createNewSession(context.circuitName, effectiveLanguage)]
      }
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
        content: '⏹ *Task stopped by user.*',
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
              '⚠️ **API Key Required**\n\nTo enable instant answers, please enter a free **Google Gemini API Key** (or Groq Key) in settings.\n\n1. Get your free key instantly at [Google AI Studio](https://aistudio.google.com/app/apikey) (Takes ~10 seconds).\n2. Click the ⚙️ Settings icon in the top right to paste it.',
            timestamp: Date.now(),
          },
        ])
        setIsLoading(false)
      }, 400)
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
        // Direct browser fetch fallback so it works immediately without restarting Electron dev process
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
            content: `❌ **Assistant Error**: ${response.error || 'Failed to generate response.'}`,
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

  const clearChat = () => {
    updateSessionMessages(() => [createWelcomeMessage(effectiveLanguage)])
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
        width: isExpanded ? 640 : 450,
        maxWidth: '96vw',
        background: '#f8fafc',
        borderLeft: '1px solid #cbd5e1',
        boxShadow: '-10px 0 32px rgba(15, 23, 42, 0.12), -2px 0 8px rgba(15, 23, 42, 0.04)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 1000,
        fontFamily: 'Inter, -apple-system, sans-serif',
        transition: 'width 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
        animation: 'copilotSlideIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      <style>{`
        @keyframes copilotSlideIn {
          from { transform: translateX(100%); opacity: 0.5; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes copilotPulseWave {
          0%, 100% { transform: scaleY(0.4); opacity: 0.4; }
          50% { transform: scaleY(1); opacity: 1; }
        }
        .copilot-pulse-bar {
          display: inline-block;
          width: 3px;
          height: 14px;
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
        .copilot-scroll::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 4px;
        }
        .copilot-scroll::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
      `}</style>

      {/* Sleek Top Header */}
      <div
        style={{
          padding: '10px 16px',
          background: 'linear-gradient(135deg, #090d16 0%, #0f172a 60%, #1e1b4b 100%)',
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)',
              border: '1px solid rgba(168, 85, 247, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 12px rgba(168, 85, 247, 0.45)',
            }}
          >
            <AiCopilotLogo size={18} active glow />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 7, letterSpacing: '-0.01em' }}>
              CriticalPath Copilot
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3.5,
                  fontSize: 9.5,
                  padding: '1.5px 6px',
                  borderRadius: 10,
                  background: 'rgba(16, 185, 129, 0.15)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  color: '#34d399',
                  fontWeight: 600,
                  letterSpacing: '0.02em',
                }}
              >
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#34d399' }} />
                Online
              </span>
            </div>
            <div style={{ fontSize: 10.5, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 5 }}>
              <span>{activeSession.title.slice(0, 22)}{activeSession.title.length > 22 ? '...' : ''}</span>
            </div>
          </div>
        </div>

        {/* Header Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          {/* New Chat Quick Button */}
          <button
            onClick={handleCreateNewSession}
            title="Start New Conversation"
            style={{
              ...headerBtnStyle,
              background: 'rgba(255, 255, 255, 0.08)',
              color: '#ffffff',
              borderRadius: 5,
              padding: '3px 8px',
              fontSize: 11,
              fontWeight: 600,
              gap: 4,
            }}
          >
            <Plus size={12} /> New
          </button>

          {/* History Panel Button */}
          <button
            onClick={() => setShowHistory(!showHistory)}
            title="Saved Chat History"
            style={{
              ...headerBtnStyle,
              background: showHistory ? 'rgba(99, 102, 241, 0.35)' : 'transparent',
              color: showHistory ? '#c084fc' : '#94a3b8',
            }}
          >
            <History size={15} />
          </button>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            title={isExpanded ? 'Standard width (450px)' : 'Expand width (640px)'}
            style={headerBtnStyle}
          >
            {isExpanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
          {/* Active AI Language Indicator */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            title={`Active Language: ${LANGUAGE_NAMES[effectiveLanguage] || 'English'}. Click to configure.`}
            style={{
              ...headerBtnStyle,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              fontSize: 10,
              fontWeight: 600,
              padding: '2px 6px',
              borderRadius: 4,
              background: 'rgba(99, 102, 241, 0.25)',
              color: '#c7d2fe',
              border: '1px solid rgba(165, 180, 252, 0.3)',
            }}
          >
            <Globe size={11} color="#a5b4fc" />
            <span>{(LANGUAGE_NAMES[effectiveLanguage] || 'English').split(' ')[0]}</span>
          </button>

          <button
            onClick={() => setShowSettings(!showSettings)}
            title="AI Engine & API Key Settings"
            style={{
              ...headerBtnStyle,
              background: showSettings ? 'rgba(99, 102, 241, 0.3)' : 'transparent',
              color: showSettings ? '#a5b4fc' : '#94a3b8',
            }}
          >
            <Settings size={15} />
          </button>
          <button
            onClick={clearChat}
            title="Clear Chat History"
            style={headerBtnStyle}
          >
            <Trash2 size={15} />
          </button>
          <button
            onClick={onClose}
            title="Close Assistant"
            style={{ ...headerBtnStyle, marginLeft: 2 }}
          >
            <X size={17} />
          </button>
        </div>
      </div>

      {/* Slide-over Chat History Section */}
      {showHistory && (
        <div
          style={{
            position: 'absolute',
            top: 52,
            left: 0,
            right: 0,
            bottom: 0,
            background: '#ffffff',
            zIndex: 30,
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
          }}
        >
          {/* History Section Header */}
          <div
            style={{
              padding: '10px 14px',
              background: '#0f172a',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid #334155',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                onClick={() => setShowHistory(false)}
                title="Back to current conversation"
                style={{ ...headerBtnStyle, padding: 3 }}
              >
                <ChevronLeft size={16} />
              </button>
              <span style={{ fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
                <History size={13} color="#c084fc" /> Saved Conversations ({sessions.length})
              </span>
            </div>

            <button
              onClick={handleCreateNewSession}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '3px 8px',
                borderRadius: 5,
                background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                color: '#ffffff',
                border: 'none',
                fontSize: 10.5,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Plus size={11} /> New Chat
            </button>
          </div>

          {/* Search Bar */}
          <div style={{ padding: '8px 12px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: 6,
                padding: '5px 8px',
              }}
            >
              <Search size={12} color="#94a3b8" />
              <input
                type="text"
                placeholder="Search conversations..."
                value={searchHistoryQuery}
                onChange={(e) => setSearchHistoryQuery(e.target.value)}
                style={{
                  flex: 1,
                  border: 'none',
                  outline: 'none',
                  fontSize: 11,
                  background: 'transparent',
                  color: '#0f172a',
                }}
              />
              {searchHistoryQuery && (
                <button
                  onClick={() => setSearchHistoryQuery('')}
                  style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0 }}
                >
                  <X size={11} />
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
              padding: '10px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              background: '#f8fafc',
            }}
          >
            {filteredSessions.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
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
                      padding: '9px 12px',
                      borderRadius: 8,
                      background: '#ffffff',
                      border: isActive ? '1.5px solid #6366f1' : '1px solid #e2e8f0',
                      boxShadow: isActive ? '0 0 0 1px #6366f1, 0 2px 6px rgba(99, 102, 241, 0.08)' : '0 1px 2px rgba(0,0,0,0.02)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        <MessageSquare size={13} color={isActive ? '#6366f1' : '#94a3b8'} />
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: isActive ? 700 : 600,
                            color: isActive ? '#4338ca' : '#0f172a',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {s.title}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, color: '#64748b' }}>
                        <span
                          style={{
                            padding: '1px 5px',
                            borderRadius: 3,
                            background: '#f1f5f9',
                            color: '#475569',
                            fontSize: 9.5,
                            fontWeight: 600,
                          }}
                        >
                          {s.circuitName || 'Schematic'}
                        </span>
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
                        opacity: 0.65,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = '#ef4444'
                        e.currentTarget.style.background = '#fee2e2'
                        e.currentTarget.style.opacity = '1'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = '#94a3b8'
                        e.currentTarget.style.background = 'transparent'
                        e.currentTarget.style.opacity = '0.65'
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

      {/* Settings Modal Drawer (if open) */}
      {showSettings && (
        <div
          style={{
            padding: '14px 16px',
            background: '#ffffff',
            borderBottom: '1px solid #e2e8f0',
            boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Cpu size={14} color="#6366f1" /> AI Engine Configuration
            </span>
            <span style={{ fontSize: 10.5, color: '#64748b' }}>
              Choose your preferred provider
            </span>
          </div>

          {/* Provider Selection Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
            <div
              onClick={() => handleToggleProvider('gemini')}
              style={{
                padding: '9px 10px',
                borderRadius: 8,
                border: provider === 'gemini' ? '2px solid #6366f1' : '1px solid #cbd5e1',
                background: provider === 'gemini' ? '#f5f3ff' : '#f8fafc',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontWeight: 700, fontSize: 11.5, color: '#1e1b4b', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Sparkles size={13} color="#6366f1" /> Google Gemini
                </span>
                {provider === 'gemini' && <Check size={13} color="#6366f1" />}
              </div>
              <div style={{ fontSize: 10, color: '#64748b', lineHeight: 1.3 }}>
                Gemini 3.8 Flash · Free 1,500 req/day · Best for theory & formulas
              </div>
            </div>

            <div
              onClick={() => handleToggleProvider('groq')}
              style={{
                padding: '9px 10px',
                borderRadius: 8,
                border: provider === 'groq' ? '2px solid #10b981' : '1px solid #cbd5e1',
                background: provider === 'groq' ? '#f0fdf4' : '#f8fafc',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontWeight: 700, fontSize: 11.5, color: '#064e3b', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Zap size={13} color="#10b981" /> Groq Cloud
                </span>
                {provider === 'groq' && <Check size={13} color="#10b981" />}
              </div>
              <div style={{ fontSize: 10, color: '#64748b', lineHeight: 1.3 }}>
                Ultra-fast ~300ms · LPU speed · Best for SPICE netlists & code
              </div>
            </div>
          </div>

          {/* Response Language Selection */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#334155', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Globe size={12} color="#6366f1" /> Response Language
              </label>
              <span style={{ fontSize: 10, color: '#6366f1', fontWeight: 600 }}>
                {aiLanguage === 'auto' ? `Auto (${LANGUAGE_NAMES[currentUiLang] || 'English'})` : LANGUAGE_NAMES[aiLanguage] || aiLanguage}
              </span>
            </div>
            <select
              value={aiLanguage}
              onChange={(e) => handleSelectAiLanguage(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 10px',
                borderRadius: 6,
                border: '1px solid #cbd5e1',
                fontSize: 11.5,
                background: '#f8fafc',
                color: '#0f172a',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <option value="auto">🌐 Auto (Follow Active EDA Language)</option>
              <option value="en">English</option>
              <option value="hi">हिन्दी (Hindi)</option>
              <option value="mr">मराठी (Marathi)</option>
              <option value="te">తెలుగు (Telugu)</option>
              <option value="ta">தமிழ் (Tamil)</option>
              <option value="bn">বাংলা (Bengali)</option>
              <option value="gu">ગુજરાતી (Gujarati)</option>
            </select>
          </div>

          {/* API Key Input Field */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#334155', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Key size={12} color="#6366f1" /> API Key ({provider === 'groq' ? 'Groq Key' : 'Google AI Studio Key'})
              </label>
              {apiKey && (
                <span style={{ fontSize: 10, color: '#16a34a', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
                  <Check size={10} /> Saved locally
                </span>
              )}
            </div>

            <div style={{ display: 'flex', gap: 6 }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <input
                  type={showKeyText ? 'text' : 'password'}
                  placeholder={provider === 'groq' ? 'gsk_...' : 'AIzaSy...'}
                  value={tempApiKey}
                  onChange={(e) => setTempApiKey(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '7px 32px 7px 10px',
                    borderRadius: 6,
                    border: '1px solid #cbd5e1',
                    fontSize: 11.5,
                    fontFamily: 'Consolas, monospace',
                    background: '#f8fafc',
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowKeyText(!showKeyText)}
                  title={showKeyText ? 'Hide Key' : 'Show Key'}
                  style={{
                    position: 'absolute',
                    right: 6,
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

              <button
                onClick={handleSaveSettings}
                style={{
                  padding: '7px 14px',
                  borderRadius: 6,
                  background: 'linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)',
                  color: '#ffffff',
                  border: 'none',
                  fontWeight: 600,
                  fontSize: 11.5,
                  cursor: 'pointer',
                  boxShadow: '0 1px 3px rgba(79, 70, 229, 0.3)',
                }}
              >
                Save
              </button>
            </div>
          </div>

          {/* Links & Help */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 6, borderTop: '1px solid #f1f5f9', fontSize: 10.5 }}>
            <span style={{ color: '#64748b' }}>Keys are stored only on your device.</span>
            <a
              href={provider === 'groq' ? 'https://console.groq.com/keys' : 'https://aistudio.google.com/app/apikey'}
              target="_blank"
              rel="noreferrer"
              style={{
                color: '#4f46e5',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
                fontWeight: 600,
              }}
            >
              Get Free {provider === 'groq' ? 'Groq' : 'Gemini'} Key <ExternalLink size={10} />
            </a>
          </div>
        </div>
      )}

      {/* Schematic Telemetry Ribbon */}
      <div
        style={{
          padding: '6px 14px',
          background: '#ffffff',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 11,
          color: '#334155',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 7px',
              borderRadius: 4,
              background: '#f1f5f9',
              border: '1px solid #e2e8f0',
              fontWeight: 600,
              color: '#0f172a',
            }}
          >
            <FileCode size={11} color="#6366f1" /> {context.circuitName || 'Schematic'}
          </span>
          <span style={{ color: '#64748b', fontSize: 10.5 }}>
            {context.componentSummary || 'Empty canvas'}
          </span>
        </div>

        {context.simError ? (
          <span
            style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#dc2626',
              padding: '2px 8px',
              borderRadius: 12,
              fontSize: 10,
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              flexShrink: 0,
            }}
          >
            <AlertTriangle size={10} /> SPICE Error
          </span>
        ) : (
          <span
            style={{
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              color: '#15803d',
              padding: '2px 8px',
              borderRadius: 12,
              fontSize: 10,
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              flexShrink: 0,
            }}
          >
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#22c55e' }} /> Netlist Synced
          </span>
        )}
      </div>

      {/* Prompt Suggestions Carousel */}
      <div
        className="copilot-scroll"
        style={{
          padding: '8px 12px',
          display: 'flex',
          gap: 6,
          overflowX: 'auto',
          background: '#ffffff',
          borderBottom: '1px solid #f1f5f9',
        }}
      >
        {context.simError && (
          <button
            onClick={() => handleSendMessage(`Explain this simulation error and tell me step-by-step how to resolve it: ${context.simError}`)}
            style={{
              ...suggestionChipStyle,
              background: '#fef2f2',
              borderColor: '#fca5a5',
              color: '#b91c1c',
            }}
          >
            <AlertTriangle size={12} color="#dc2626" /> Fix SPICE Error
          </button>
        )}
        <button
          onClick={() => handleSendMessage('Suggest what I should connect or do next on this schematic.')}
          style={suggestionChipStyle}
        >
          <Lightbulb size={12} color="#f59e0b" /> Suggest Next Step
        </button>
        <button
          onClick={() => handleSendMessage('Review my current schematic and check for any wiring mistakes, missing grounds, or floating nets.')}
          style={suggestionChipStyle}
        >
          <HelpCircle size={12} color="#3b82f6" /> Review Schematic
        </button>
        <button
          onClick={() => handleSendMessage('How should I choose and calculate the component values (resistors, capacitors, bias) for this circuit?')}
          style={suggestionChipStyle}
        >
          <Calculator size={12} color="#8b5cf6" /> Component Sizing
        </button>
        <button
          onClick={() => handleSendMessage('What SPICE simulation parameters (.tran, .ac, .dc) are best suited for testing this circuit?')}
          style={suggestionChipStyle}
        >
          <Cpu size={12} color="#10b981" /> Simulation Settings
        </button>
      </div>

      {/* Message Thread */}
      <div
        className="copilot-scroll"
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          background: '#f8fafc',
        }}
      >
        {messages.map((m) => {
          const isUser = m.role === 'user'
          return (
            <div
              key={m.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                alignSelf: isUser ? 'flex-end' : 'flex-start',
                maxWidth: isUser ? '85%' : '98%',
              }}
            >
              {isUser ? (
                <div
                  style={{
                    background: 'linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)',
                    color: '#ffffff',
                    padding: '10px 14px',
                    borderRadius: '16px 16px 4px 16px',
                    fontSize: 12.5,
                    lineHeight: 1.5,
                    boxShadow: '0 2px 6px rgba(79, 70, 229, 0.2)',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {m.content}
                </div>
              ) : (
                <div
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: 12,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                    overflow: 'hidden',
                    width: '100%',
                    boxSizing: 'border-box',
                  }}
                >
                  {/* Assistant Header */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '7px 12px',
                      background: '#fafafa',
                      borderBottom: '1px solid #f1f5f9',
                      fontSize: 11,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: 5,
                          background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#ffffff',
                        }}
                      >
                        <Bot size={12} />
                      </div>
                      <span style={{ fontWeight: 650, color: '#1e293b' }}>CriticalPath Copilot</span>
                    </div>

                    <button
                      onClick={() => handleCopy(m.content, m.id)}
                      title="Copy full response"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 3.5,
                        background: copiedId === m.id ? '#ecfdf5' : '#ffffff',
                        border: `1px solid ${copiedId === m.id ? '#a7f3d0' : '#cbd5e1'}`,
                        borderRadius: 4,
                        padding: '2px 7px',
                        fontSize: 10.5,
                        color: copiedId === m.id ? '#059669' : '#64748b',
                        fontWeight: 500,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {copiedId === m.id ? (
                        <>
                          <Check size={11} color="#059669" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy size={11} /> Copy
                        </>
                      )}
                    </button>
                  </div>

                  {/* Assistant Body */}
                  <div style={{ padding: '12px 14px', fontSize: 12.5, lineHeight: 1.55, color: '#0f172a' }}>
                    <MarkdownMessage content={m.content} />
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {/* Thinking / Running State */}
        {isLoading && (
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: 12,
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              alignSelf: 'flex-start',
              width: '100%',
              boxSizing: 'border-box',
              boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', height: 16 }}>
                <span className="copilot-pulse-bar" />
                <span className="copilot-pulse-bar" />
                <span className="copilot-pulse-bar" />
              </div>
              <span style={{ fontSize: 12, color: '#475569', fontWeight: 500 }}>
                Copilot is computing SPICE netlist & analyzing...
              </span>
            </div>

            <button
              onClick={handleStopTask}
              title="Stop generation (Esc)"
              style={{
                background: '#fee2e2',
                color: '#dc2626',
                border: '1px solid #fca5a5',
                borderRadius: 5,
                padding: '3px 9px',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                flexShrink: 0,
              }}
            >
              <Square size={9} fill="currentColor" /> Stop
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Floating Composer */}
      <div
        style={{
          padding: '12px 14px',
          borderTop: '1px solid #e2e8f0',
          background: '#ffffff',
        }}
      >
        <div
          style={{
            background: '#f8fafc',
            border: isFocused ? '1px solid #6366f1' : '1px solid #cbd5e1',
            boxShadow: isFocused ? '0 0 0 3px rgba(99, 102, 241, 0.12)' : '0 1px 2px rgba(0,0,0,0.02)',
            borderRadius: 8,
            transition: 'all 0.15s ease',
            padding: '8px 10px',
          }}
        >
          <textarea
            ref={inputRef}
            rows={2}
            placeholder="Ask any question about your circuit, SPICE, components..."
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

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 6, borderTop: '1px solid #f1f5f9' }}>
            {/* Model fast switcher button */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                type="button"
                onClick={() => handleToggleProvider(provider === 'gemini' ? 'groq' : 'gemini')}
                title="Click to toggle between Gemini and Groq"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '2.5px 7px',
                  borderRadius: 5,
                  background: provider === 'groq' ? '#f0fdf4' : '#eff6ff',
                  border: `1px solid ${provider === 'groq' ? '#86efac' : '#bfdbfe'}`,
                  color: provider === 'groq' ? '#15803d' : '#1d4ed8',
                  fontSize: 10.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {provider === 'groq' ? <Zap size={10} color="#16a34a" /> : <Sparkles size={10} color="#2563eb" />}
                {provider === 'groq' ? 'Groq LPU' : 'Gemini 3.8'}
              </button>

              <span style={{ fontSize: 10, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#10b981' }} />
                Schematic Synced
              </span>
            </div>

            {/* Send or Stop Button */}
            {isLoading ? (
              <button
                onClick={handleStopTask}
                title="Stop task (Esc)"
                style={{
                  height: 28,
                  padding: '0 10px',
                  borderRadius: 5,
                  background: '#ef4444',
                  color: '#ffffff',
                  border: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  cursor: 'pointer',
                  fontSize: 11,
                  fontWeight: 600,
                  boxShadow: '0 1px 4px rgba(239, 68, 68, 0.35)',
                }}
              >
                <Square size={11} fill="currentColor" /> Stop
              </button>
            ) : (
              <button
                onClick={() => handleSendMessage()}
                disabled={!inputText.trim()}
                title="Send message (Enter)"
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 5,
                  background: !inputText.trim() ? '#94a3b8' : 'linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)',
                  color: '#ffffff',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: !inputText.trim() ? 'default' : 'pointer',
                  transition: 'background 0.15s ease',
                  flexShrink: 0,
                  boxShadow: !inputText.trim() ? 'none' : '0 1px 4px rgba(79, 70, 229, 0.35)',
                }}
              >
                <Send size={13} />
              </button>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10, color: '#94a3b8' }}>
          <span>Press <strong>Enter</strong> to send, <strong>Shift+Enter</strong> for newline</span>
          <span>{isLoading ? 'Press Esc to cancel' : 'CriticalPath AI EDA'}</span>
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
  padding: 5,
  borderRadius: 5,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'all 0.15s ease',
}

const suggestionChipStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: '5px 11px',
  borderRadius: 16,
  background: '#ffffff',
  border: '1px solid #cbd5e1',
  fontSize: 11,
  fontWeight: 600,
  color: '#334155',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
  transition: 'all 0.15s ease',
  flexShrink: 0,
}

const SYSTEM_PROMPT = `You are CriticalPath Copilot, an elite Electrical Engineering & SPICE simulation assistant built directly into the CriticalPath EDA application.
You have deep expertise in circuit theory, analog electronics, semiconductor devices (BJTs, MOSFETs, diodes, op-amps), SPICE netlist syntax, and ngspice convergence/singular-matrix troubleshooting.
Give clear, direct, and technically accurate explanations. Suggest practical standard component values (E12/E24 series). Use clean Markdown with code blocks for SPICE syntax.`

function buildDirectSystemPrompt(language?: string): string {
  if (!language || language === 'auto' || language === 'en' || language.toLowerCase() === 'english') {
    return `${SYSTEM_PROMPT}\n\nMultilingual Expertise: You are fluent in multiple languages including English, Hindi, Telugu, Tamil, Marathi, Bengali, Gujarati, and other global languages. If the user addresses you in another language, seamlessly understand and respond in that language while preserving standard engineering and SPICE notation (e.g. VCC, GND, .tran, .ac).`
  }

  const langKey = language.split('-')[0].toLowerCase()
  const langName = LANGUAGE_NAMES[langKey] || language

  return `${SYSTEM_PROMPT}\n\nLanguage Directive: The user has selected ${langName} as their active interface language. Please provide all your explanations, calculations, analysis, and circuit advice fluently and naturally in ${langName}. Always retain standard electrical engineering terms, component designators (e.g. R1, C1, Q1), node names (VCC, GND), metric units (kΩ, µF, V, mA), and SPICE directives (e.g. .tran, .ac, .dc, .meas) in standard technical notation so they remain technically precise.`
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
      parts.push(`Generated SPICE Netlist:\n\`\`\`spice\n${context.netlist}\n\`\`\``)
    }
    if (parts.length > 0) {
      contextBlock = `[CURRENT SCHEMATIC CONTEXT]\n${parts.join('\n\n')}\n[END CONTEXT]\n\n`
    }
  }

  if (provider === 'groq' || apiKey.startsWith('gsk_')) {
    const url = 'https://api.groq.com/openai/v1/chat/completions'
    const formattedMessages = [
      { role: 'system', content: promptToUse },
      ...messages.map((m, idx) => {
        let content = m.content
        if (idx === messages.length - 1 && m.role === 'user' && contextBlock) {
          content = `${contextBlock}User question: ${content}`
        }
        return { role: m.role, content }
      }),
    ]
    let groqCandidates = [
      'openai/gpt-oss-120b',
      'openai/gpt-oss-20b',
      'qwen/qwen3.8-27b',
      'qwen/qwen3.6-27b',
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant',
    ]

    try {
      const modelsRes = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal,
      })
      if (modelsRes.ok) {
        const modelsData = await modelsRes.json()
        if (Array.isArray(modelsData?.data)) {
          const excluded = ['whisper', 'guard', 'orpheus', 'embed', 'safeguard', 'vision', 'tts']
          const liveModels: string[] = modelsData.data
            .map((m: any) => m.id as string)
            .filter((id: string) => id && !excluded.some((ex) => id.toLowerCase().includes(ex)))

          if (liveModels.length > 0) {
            liveModels.sort((a, b) => {
              const score = (id: string) => {
                if (id.includes('gpt-oss-120b')) return 100
                if (id.includes('gpt-oss-20b')) return 90
                if (id.includes('qwen3.8')) return 80
                if (id.includes('qwen3.6')) return 70
                if (id.includes('llama')) return 50
                return 10
              }
              return score(b) - score(a)
            })
            groqCandidates = liveModels
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError' || signal?.aborted) {
        return { success: false, error: 'ABORTED' }
      }
    }

    let lastError = ''
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
            max_tokens: 2048,
          }),
          signal,
        })

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
    return { success: false, error: `Groq error: ${lastError || 'No accessible model found.'}` }
  } else {
    // Gemini candidate models, prioritized by modern availability
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
          // If model is 404 (not found) or 503 (high demand spike), automatically failover to next model
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
    return { success: false, error: `Gemini servers are currently experiencing peak load. Please try again or switch to Groq in settings: ${lastError}` }
  }
}

