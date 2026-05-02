import { describe, expect, it } from 'vitest'
import {
  createTemplateDraft,
  normalizeCourseCity,
  normalizeCourseName,
  normalizeHoleCount,
  normalizeTemplateLabel,
  validateCourseName,
} from './templateDraft'

describe('templateDraft helpers', () => {
  it('normalizes course name spacing', () => {
    expect(normalizeCourseName('  Blue   Ribbon   Pines  ')).toBe('Blue Ribbon Pines')
  })

  it('normalizes city and returns null for blank city', () => {
    expect(normalizeCourseCity('  East   Bethel  ')).toBe('East Bethel')
    expect(normalizeCourseCity('   ')).toBeNull()
  })

  it('validates blank course names', () => {
    expect(validateCourseName('   ')).toBe('Course name is required')
    expect(validateCourseName('Maple Hill')).toBeNull()
  })

  it('normalizes hole count to supported range', () => {
    expect(normalizeHoleCount(18)).toBe(18)
    expect(normalizeHoleCount(0)).toBe(9)
    expect(normalizeHoleCount(50)).toBe(27)
  })

  it('normalizes template labels with fallback', () => {
    expect(normalizeTemplateLabel('  Long tees  ')).toBe('Long tees')
    expect(normalizeTemplateLabel('   ')).toBe('Main')
  })

  it('creates canonical hole templates from label + hole count', () => {
    const draft = createTemplateDraft({ label: '  Blue Layout ', holeCount: 3 })
    expect(draft.label).toBe('Blue Layout')
    expect(draft.holes).toEqual([
      { number: 1, par: 3, lengthMeters: null, notes: null },
      { number: 2, par: 3, lengthMeters: null, notes: null },
      { number: 3, par: 3, lengthMeters: null, notes: null },
    ])
  })
})
