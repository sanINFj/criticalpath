import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import enCommon from '../locales/en/common.json'
import enWaveform from '../locales/en/waveform.json'

import hiCommon from '../locales/hi/common.json'
import hiWaveform from '../locales/hi/waveform.json'

import mrCommon from '../locales/mr/common.json'
import mrWaveform from '../locales/mr/waveform.json'

import bnCommon from '../locales/bn/common.json'
import bnWaveform from '../locales/bn/waveform.json'

import taCommon from '../locales/ta/common.json'
import taWaveform from '../locales/ta/waveform.json'

import teCommon from '../locales/te/common.json'
import teWaveform from '../locales/te/waveform.json'

import guCommon from '../locales/gu/common.json'
import guWaveform from '../locales/gu/waveform.json'

export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
  { code: 'mr', name: 'Marathi', nativeName: 'मराठी' },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்' },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు' },
  { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી' }
] as const

export type SupportedLanguageCode = typeof SUPPORTED_LANGUAGES[number]['code']

export const resources = {
  en: { common: enCommon, waveform: enWaveform },
  hi: { common: hiCommon, waveform: hiWaveform },
  mr: { common: mrCommon, waveform: mrWaveform },
  bn: { common: bnCommon, waveform: bnWaveform },
  ta: { common: taCommon, waveform: taWaveform },
  te: { common: teCommon, waveform: teWaveform },
  gu: { common: guCommon, waveform: guWaveform }
} as const

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    defaultNS: 'common',
    interpolation: {
      escapeValue: false // React already escapes by default
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage']
    }
  })

export default i18n
