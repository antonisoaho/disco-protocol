import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { detectDeviceLocale } from './detectLanguage'
import { commonEn } from './locales/en/common'
import { commonSv } from './locales/sv/common'

const resources = {
  en: {
    common: commonEn,
  },
  sv: {
    common: commonSv,
  },
} as const

void i18n.use(initReactI18next).init({
  resources,
  lng: detectDeviceLocale(),
  fallbackLng: 'en',
  supportedLngs: ['en', 'sv'],
  defaultNS: 'common',
  interpolation: {
    escapeValue: false,
  },
})

export { i18n }
