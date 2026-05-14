export const SUPPORTED_LOCALES = ['en', 'sv'] as const
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]

const SUPPORTED_LOCALE_SET = new Set<string>(SUPPORTED_LOCALES)
const FALLBACK_LOCALE: SupportedLocale = 'en'

export function normalizeLocale(candidate: string | null | undefined): SupportedLocale {
  if (!candidate) return FALLBACK_LOCALE
  const normalized = candidate.trim().toLowerCase()
  if (SUPPORTED_LOCALE_SET.has(normalized)) {
    return normalized as SupportedLocale
  }

  const languageCode = normalized.split('-')[0]?.split('_')[0]
  if (languageCode && SUPPORTED_LOCALE_SET.has(languageCode)) {
    return languageCode as SupportedLocale
  }

  return FALLBACK_LOCALE
}

function navigatorLocale(): string | null {
  if (typeof navigator === 'undefined') return null
  return navigator.language ?? null
}

function intlLocale(): string | null {
  if (typeof Intl === 'undefined') return null
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale ?? null
  } catch {
    return null
  }
}

export function detectDeviceLocale(): SupportedLocale {
  return normalizeLocale(navigatorLocale() ?? intlLocale())
}
