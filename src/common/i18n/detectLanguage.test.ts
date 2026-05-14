import { describe, expect, it } from 'vitest'
import { normalizeLocale } from './detectLanguage'

describe('normalizeLocale', () => {
  it('keeps supported short locales', () => {
    expect(normalizeLocale('en')).toBe('en')
    expect(normalizeLocale('sv')).toBe('sv')
  })

  it('normalizes regional locales to supported language', () => {
    expect(normalizeLocale('sv-SE')).toBe('sv')
    expect(normalizeLocale('en_US')).toBe('en')
  })

  it('falls back to English when locale is unsupported or empty', () => {
    expect(normalizeLocale('fi-FI')).toBe('en')
    expect(normalizeLocale('')).toBe('en')
    expect(normalizeLocale(null)).toBe('en')
    expect(normalizeLocale(undefined)).toBe('en')
  })
})
