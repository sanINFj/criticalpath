import { useEffect, useRef, useState, type FormEvent } from 'react'
import { sendMessage } from '../../services/assistantService'
import type { ChatMessage } from './types'
import './Assistant.css'

type Language = 'auto' | 'en' | 'hi' | 'ta' | 'bn' | 'mr' | 'te' | 'gu'
type SupportedLanguage = Exclude<Language, 'auto'>

const languages: { code: Language; label: string }[] = [
  { code: 'auto', label: 'Auto-detect' },
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी (Hindi)' },
  { code: 'ta', label: 'தமிழ் (Tamil)' },
  { code: 'bn', label: 'বাংলা (Bengali)' },
  { code: 'mr', label: 'मराठी (Marathi)' },
  { code: 'te', label: 'తెలుగు (Telugu)' },
  { code: 'gu', label: 'ગુજરાતી (Gujarati)' },
]

const translations: Record<
 SupportedLanguage,
  {
    title: string
    status: string
    welcome: string
    you: string
    assistant: string
    placeholder: string
    send: string
    sending: string
    loading: string
    language: string
    footnote: string
    backendError: string
    requestError: string
  }
> = {
  en: {
    title: 'CriticalPath Assistant',
    status: 'Chat interface ready',
    welcome:
      "Hi! I'm your CriticalPath assistant. I can help you understand circuits, discuss simulation results, and explore electronics concepts.",
    you: 'You',
    assistant: 'Assistant',
    placeholder: 'Ask about circuits, waveforms, or electronics…',
    send: 'Send ↑',
    sending: 'Sending…',
    loading: 'Preparing response…',
    language: 'Language',
    footnote: 'AI answers require a configured backend. Do not share passwords or API keys.',
    backendError: 'The AI service is not connected yet. Your message was not answered by an AI.',
    requestError: 'Something went wrong while contacting the AI service.',
  },
  hi: {
    title: 'CriticalPath सहायक',
    status: 'चैट इंटरफ़ेस तैयार है',
    welcome:
      'नमस्ते! मैं आपका CriticalPath सहायक हूँ। मैं सर्किट, सिमुलेशन परिणाम और इलेक्ट्रॉनिक्स की अवधारणाओं को समझने में मदद कर सकता हूँ।',
    you: 'आप',
    assistant: 'सहायक',
    placeholder: 'सर्किट, वेवफॉर्म या इलेक्ट्रॉनिक्स के बारे में पूछें…',
    send: 'भेजें ↑',
    sending: 'भेज रहे हैं…',
    loading: 'उत्तर तैयार हो रहा है…',
    language: 'भाषा',
    footnote: 'AI उत्तरों के लिए बैकएंड आवश्यक है। पासवर्ड या API कुंजियाँ साझा न करें।',
    backendError: 'AI सेवा अभी कनेक्ट नहीं है। आपके संदेश का उत्तर AI ने नहीं दिया।',
    requestError: 'AI सेवा से संपर्क करते समय समस्या हुई।',
  },
  ta: {
    title: 'CriticalPath உதவியாளர்',
    status: 'அரட்டை இடைமுகம் தயார்',
    welcome:
      'வணக்கம்! நான் உங்கள் CriticalPath உதவியாளர். சுற்றுகள், உருவகப்படுத்துதல் முடிவுகள் மற்றும் மின்னணுவியல் கருத்துகளைப் புரிந்துகொள்ள உதவுவேன்.',
    you: 'நீங்கள்',
    assistant: 'உதவியாளர்',
    placeholder: 'சுற்றுகள், அலைவடிவங்கள் அல்லது மின்னணுவியல் பற்றி கேளுங்கள்…',
    send: 'அனுப்பு ↑',
    sending: 'அனுப்புகிறது…',
    loading: 'பதில் தயாராகிறது…',
    language: 'மொழி',
    footnote: 'AI பதில்களுக்கு பின்தள இணைப்பு தேவை. கடவுச்சொற்கள் அல்லது API விசைகளைப் பகிர வேண்டாம்.',
    backendError: 'AI சேவை இன்னும் இணைக்கப்படவில்லை. உங்கள் செய்திக்கு AI பதில் அளிக்கவில்லை.',
    requestError: 'AI சேவையைத் தொடர்புகொள்ளும்போது பிழை ஏற்பட்டது.',
  },
  bn: {
    title: 'CriticalPath সহায়ক',
    status: 'চ্যাট ইন্টারফেস প্রস্তুত',
    welcome:
      'নমস্কার! আমি আপনার CriticalPath সহায়ক। সার্কিট, সিমুলেশনের ফলাফল এবং ইলেকট্রনিক্সের ধারণা বুঝতে সাহায্য করতে পারি।',
    you: 'আপনি',
    assistant: 'সহায়ক',
    placeholder: 'সার্কিট, তরঙ্গরূপ বা ইলেকট্রনিক্স সম্পর্কে জিজ্ঞাসা করুন…',
    send: 'পাঠান ↑',
    sending: 'পাঠানো হচ্ছে…',
    loading: 'উত্তর প্রস্তুত হচ্ছে…',
    language: 'ভাষা',
    footnote: 'AI উত্তরের জন্য ব্যাকএন্ড প্রয়োজন। পাসওয়ার্ড বা API কী শেয়ার করবেন না।',
    backendError: 'AI পরিষেবা এখনও সংযুক্ত নয়। আপনার বার্তার উত্তর AI দেয়নি।',
    requestError: 'AI পরিষেবার সঙ্গে যোগাযোগ করতে সমস্যা হয়েছে।',
  },
  mr: {
    title: 'CriticalPath सहाय्यक',
    status: 'चॅट इंटरफेस तयार आहे',
    welcome:
      'नमस्कार! मी तुमचा CriticalPath सहाय्यक आहे. सर्किट, सिम्युलेशनचे निकाल आणि इलेक्ट्रॉनिक्सच्या संकल्पना समजून घेण्यास मदत करू शकतो.',
    you: 'तुम्ही',
    assistant: 'सहाय्यक',
    placeholder: 'सर्किट, वेव्हफॉर्म किंवा इलेक्ट्रॉनिक्सबद्दल विचारा…',
    send: 'पाठवा ↑',
    sending: 'पाठवत आहे…',
    loading: 'उत्तर तयार होत आहे…',
    language: 'भाषा',
    footnote: 'AI उत्तरांसाठी बॅकएंड आवश्यक आहे. पासवर्ड किंवा API की शेअर करू नका.',
    backendError: 'AI सेवा अद्याप जोडलेली नाही. तुमच्या संदेशाचे उत्तर AI ने दिलेले नाही.',
    requestError: 'AI सेवेशी संपर्क साधताना समस्या आली.',
  },
  te: {
    title: 'CriticalPath సహాయకుడు',
    status: 'చాట్ ఇంటర్‌ఫేస్ సిద్ధంగా ఉంది',
    welcome:
      'నమస్కారం! నేను మీ CriticalPath సహాయకుడిని. సర్క్యూట్లు, సిమ్యులేషన్ ఫలితాలు మరియు ఎలక్ట్రానిక్స్ భావనలను అర్థం చేసుకోవడంలో సహాయం చేస్తాను.',
    you: 'మీరు',
    assistant: 'సహాయకుడు',
    placeholder: 'సర్క్యూట్లు, తరంగరూపాలు లేదా ఎలక్ట్రానిక్స్ గురించి అడగండి…',
    send: 'పంపండి ↑',
    sending: 'పంపుతోంది…',
    loading: 'సమాధానం సిద్ధమవుతోంది…',
    language: 'భాష',
    footnote: 'AI సమాధానాలకు బ్యాకెండ్ అవసరం. పాస్‌వర్డ్‌లు లేదా API కీలను పంచుకోవద్దు.',
    backendError: 'AI సేవ ఇంకా కనెక్ట్ కాలేదు. మీ సందేశానికి AI సమాధానం ఇవ్వలేదు.',
    requestError: 'AI సేవను సంప్రదించడంలో సమస్య ఏర్పడింది.',
  },
  gu: {
    title: 'CriticalPath સહાયક',
    status: 'ચેટ ઇન્ટરફેસ તૈયાર છે',
    welcome:
      'નમસ્તે! હું તમારો CriticalPath સહાયક છું. સર્કિટ, સિમ્યુલેશનના પરિણામો અને ઇલેક્ટ્રોનિક્સના ખ્યાલો સમજવામાં મદદ કરી શકું છું.',
    you: 'તમે',
    assistant: 'સહાયક',
    placeholder: 'સર્કિટ, વેવફોર્મ અથવા ઇલેક્ટ્રોનિક્સ વિશે પૂછો…',
    send: 'મોકલો ↑',
    sending: 'મોકલી રહ્યું છે…',
    loading: 'જવાબ તૈયાર થઈ રહ્યો છે…',
    language: 'ભાષા',
    footnote: 'AI જવાબો માટે બેકએન્ડ જરૂરી છે. પાસવર્ડ અથવા API કી શેર કરશો નહીં.',
    backendError: 'AI સેવા હજી જોડાયેલી નથી. તમારા સંદેશનો જવાબ AI દ્વારા આપવામાં આવ્યો નથી.',
    requestError: 'AI સેવાનો સંપર્ક કરતી વખતે સમસ્યા આવી.',
  },
}

const makeWelcomeMessage = (language: Language): ChatMessage => ({
  id: crypto.randomUUID(),
  role: 'assistant',
  content: translations[language === 'auto' ? 'en' : language].welcome,
  timestamp: Date.now(),
})

export default function Assistant() {
  const [language, setLanguage] = useState<Language>('en')
  const [messages, setMessages] = useState<ChatMessage[]>([makeWelcomeMessage('en')])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
 const t = translations[language === 'auto' ? 'en' : language]

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  function handleLanguageChange(nextLanguage: Language) {
    setLanguage(nextLanguage)
    setMessages((current) => {
      const withoutWelcome = current.filter((message) => message.id !== 'welcome')
      return [makeWelcomeMessage(nextLanguage), ...withoutWelcome]
    })
    setError('')
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const content = input.trim()

    if (!content || loading) return

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: Date.now(),
    }

    setMessages((current) => [...current, userMessage])
    setInput('')
    setError('')
    setLoading(true)

    try {
      const response = await sendMessage(content, language)

      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: response,
          timestamp: Date.now(),
        },
      ])
    } catch (err) {
      setError(
        err instanceof Error && err.message.includes('not connected')
          ? t.backendError
          : t.requestError,
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="assistant">
      <header className="assistant__header">
        <div className="assistant__avatar" aria-hidden="true">
          AI
        </div>

        <div className="assistant__heading">
          <h2>{t.title}</h2>
          <p>
            <span className="assistant__status-dot" />
            {t.status}
          </p>
        </div>

        <span className="assistant__badge">BETA</span>
      </header>

      <div className="assistant__language">
        <label htmlFor="assistant-language">{t.language}</label>
        <select
          id="assistant-language"
          value={language}
          onChange={(event) => handleLanguageChange(event.target.value as Language)}
        >
          {languages.map((item) => (
            <option key={item.code} value={item.code}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      <div
        className="assistant__messages"
        role="log"
        aria-label="Chat messages"
        aria-live="polite"
      >
        {messages.map((message) => (
          <article
            key={message.id}
            className={`assistant__message assistant__message--${message.role}`}
          >
            <span className="assistant__message-label">
              {message.role === 'user' ? t.you : t.assistant}
            </span>
            <p>{message.content}</p>
          </article>
        ))}

        {loading && (
          <div className="assistant__loading" role="status">
            {t.loading}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {error && (
        <div className="assistant__error" role="alert">
          {error}
        </div>
      )}

      <form className="assistant__composer" onSubmit={handleSubmit}>
        <label className="assistant__sr-only" htmlFor="assistant-input">
          {t.placeholder}
        </label>

        <textarea
          id="assistant-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={t.placeholder}
          rows={2}
          maxLength={4000}
          disabled={loading}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              event.currentTarget.form?.requestSubmit()
            }
          }}
        />

        <button
          type="submit"
          disabled={!input.trim() || loading}
          aria-label={t.send}
        >
          {loading ? t.sending : t.send}
        </button>
      </form>

      <p className="assistant__footnote">{t.footnote}</p>
    </section>
  )
}
