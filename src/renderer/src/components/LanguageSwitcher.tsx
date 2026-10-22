import React, { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Globe, ChevronDown } from 'lucide-react'
import { SUPPORTED_LANGUAGES, SupportedLanguageCode } from '../i18n'

export const LanguageSwitcher: React.FC = () => {
  const { i18n, t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Current language matching
  const currentLangCode = (i18n.language?.split('-')[0] || 'en') as SupportedLanguageCode
  const currentLang = SUPPORTED_LANGUAGES.find((l) => l.code === currentLangCode) || SUPPORTED_LANGUAGES[0]

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const handleSelectLanguage = (code: string) => {
    i18n.changeLanguage(code)
    setIsOpen(false)
  }

  return (
    <div className="menu-item-container" ref={menuRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className={`menu-trigger ${isOpen ? 'active' : ''}`}
        onClick={(e) => {
          e.stopPropagation()
          setIsOpen(!isOpen)
        }}
        title={t('language')}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
          height: '22px',
          fontSize: '11.5px',
          padding: '2px 8px',
          borderRadius: '2px',
          cursor: 'pointer'
        }}
      >
        <Globe size={13} />
        <span style={{ fontWeight: 500 }}>{currentLang.nativeName}</span>
        <ChevronDown size={11} style={{ opacity: 0.7 }} />
      </button>

      {isOpen && (
        <div
          className="dropdown-menu"
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            left: 'auto',
            minWidth: '150px',
            zIndex: 999
          }}
        >
          {SUPPORTED_LANGUAGES.map((lang) => {
            const isSelected = lang.code === currentLang.code
            return (
              <button
                key={lang.code}
                type="button"
                className="dropdown-item"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontWeight: isSelected ? 600 : 400,
                  background: isSelected ? '#e5f1fb' : undefined
                }}
                onClick={() => handleSelectLanguage(lang.code)}
              >
                <span>{lang.nativeName}</span>
                <span className="shortcut" style={{ fontSize: '10px', color: '#666' }}>
                  {lang.name}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default LanguageSwitcher
