export const DISPLAY_NAME_MAX_LENGTH = 80

export type DisplayNameValidationError = 'empty' | 'tooLong'

export function normalizeDisplayName(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

export function validateDisplayName(value: string): DisplayNameValidationError | null {
  const normalized = normalizeDisplayName(value)
  if (!normalized) return 'empty'
  if (normalized.length > DISPLAY_NAME_MAX_LENGTH) return 'tooLong'
  return null
}
