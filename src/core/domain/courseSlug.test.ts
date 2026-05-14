import { describe, expect, it } from 'vitest'
import { slugify } from '@core/domain/courseSlug'

describe('slugify', () => {
  it('normalizes text into a URL-friendly slug', () => {
    expect(slugify('  Blue Ribbon Pines  ')).toBe('blue-ribbon-pines')
  })

  it('falls back to "course" when no alphanumerics remain', () => {
    expect(slugify('!!!')).toBe('course')
  })
})
