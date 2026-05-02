import { describe, expect, it } from 'vitest'
import { DISPLAY_NAME_MAX_LENGTH, normalizeDisplayName, validateDisplayName } from './displayName'

describe('displayName helpers', () => {
  it('normalizes surrounding and repeated whitespace', () => {
    expect(normalizeDisplayName('  Ada   Lovelace  ')).toBe('Ada Lovelace')
  })

  it('rejects empty display names', () => {
    expect(validateDisplayName('   ')).toBe('empty')
  })

  it('rejects display names that exceed max length', () => {
    expect(validateDisplayName('x'.repeat(DISPLAY_NAME_MAX_LENGTH + 1))).toBe('tooLong')
  })

  it('accepts non-empty names up to max length', () => {
    expect(validateDisplayName('x'.repeat(DISPLAY_NAME_MAX_LENGTH))).toBeNull()
  })
})
