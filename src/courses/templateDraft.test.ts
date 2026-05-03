import { describe, expect, it } from 'vitest'
import {
  createTemplateDraft,
  normalizeCourseCity,
  normalizeCourseName,
  normalizeHoleCount,
  normalizeTemplateHolesForSave,
  normalizeTemplateLabel,
  parseLengthMetersInput,
  resizeTemplateHoles,
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

  it('resizes template holes while preserving overlapping metadata', () => {
    const base = [
      { number: 1, par: 4, lengthMeters: 120, notes: null },
      { number: 2, par: 3, lengthMeters: null, notes: null },
    ] as const
    const shrunk = resizeTemplateHoles([...base], 1)
    expect(shrunk).toEqual([{ number: 1, par: 4, lengthMeters: 120, notes: null }])
    const grown = resizeTemplateHoles([...base], 3)
    expect(grown[0]).toEqual({ number: 1, par: 4, lengthMeters: 120, notes: null })
    expect(grown[1]).toEqual({ number: 2, par: 3, lengthMeters: null, notes: null })
    expect(grown[2]).toEqual({ number: 3, par: 3, lengthMeters: null, notes: null })
  })

  it('parses length input and normalizes holes for save', () => {
    expect(parseLengthMetersInput('')).toBeNull()
    expect(parseLengthMetersInput('  88  ')).toBe(88)
    const normalized = normalizeTemplateHolesForSave([
      { number: 2, par: 9, lengthMeters: -1, notes: '  x  ' },
      { number: 1, par: 2, lengthMeters: 2001, notes: null },
    ])
    expect(normalized[0].number).toBe(1)
    expect(normalized[0].par).toBe(6)
    expect(normalized[0].lengthMeters).toBeNull()
    expect(normalized[0].notes).toBe('x')
    expect(normalized[1].number).toBe(2)
    expect(normalized[1].par).toBe(2)
    expect(normalized[1].lengthMeters).toBe(2000)
    expect(normalized[1].notes).toBeNull()
  })
})
