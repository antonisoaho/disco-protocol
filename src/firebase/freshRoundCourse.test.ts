import { describe, expect, it } from 'vitest'
import {
  FreshRoundDraftValidationError,
  buildFreshCoursePromotionPlan,
  normalizeFreshCourseDraft,
  resolveFreshRoundCourseRefs,
} from './freshRoundCourse'

describe('normalizeFreshCourseDraft', () => {
  it('normalizes course name and hole rows from user input', () => {
    const normalized = normalizeFreshCourseDraft({
      name: '  Lake   View   Meadows  ',
      holes: [
        { par: '3', lengthMeters: '87' },
        { par: 4, lengthMeters: '' },
      ],
    })

    expect(normalized).toEqual({
      name: 'Lake View Meadows',
      holes: [
        { number: 1, par: 3, lengthMeters: 87 },
        { number: 2, par: 4, lengthMeters: null },
      ],
    })
  })

  it('rejects blank course names', () => {
    expect(() =>
      normalizeFreshCourseDraft({
        name: '   ',
        holes: [{ par: 3, lengthMeters: null }],
      }),
    ).toThrow(FreshRoundDraftValidationError)
  })

  it('rejects invalid hole values with issue details', () => {
    try {
      normalizeFreshCourseDraft({
        name: 'Maple',
        holes: [{ par: 1, lengthMeters: -3 }],
      })
      throw new Error('expected validation to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(FreshRoundDraftValidationError)
      const typed = error as FreshRoundDraftValidationError
      expect(typed.issues.map((issue) => issue.code).sort()).toEqual(['invalid_length', 'invalid_par'])
      expect(typed.issues.map((issue) => issue.path).sort()).toEqual([
        'holes.0.lengthMeters',
        'holes.0.par',
      ])
    }
  })
})

describe('resolveFreshRoundCourseRefs', () => {
  it('derives deterministic refs from round id and draft name', () => {
    expect(resolveFreshRoundCourseRefs('roundABC123', '  Lake View Meadows  ')).toEqual({
      courseId: 'fresh-lake-view-meadows-roundABC',
      templateId: 'roundABC-main',
    })
  })

  it('uses explicit refs when provided', () => {
    expect(
      resolveFreshRoundCourseRefs('roundABC123', 'Lake View Meadows', {
        courseId: 'course-42',
        templateId: 'layout-99',
      }),
    ).toEqual({
      courseId: 'course-42',
      templateId: 'layout-99',
    })
  })
})

describe('buildFreshCoursePromotionPlan', () => {
  it('maps a round draft to canonical course/template payloads', () => {
    const draft = normalizeFreshCourseDraft({
      name: 'Lake View Meadows',
      holes: [
        { par: 3, lengthMeters: 82 },
        { par: 4, lengthMeters: 106 },
      ],
    })

    const plan = buildFreshCoursePromotionPlan({
      roundId: 'roundABC123',
      ownerId: 'user-1',
      draft,
    })

    expect(plan.courseId).toBe('fresh-lake-view-meadows-roundABC')
    expect(plan.templateId).toBe('roundABC-main')
    expect(plan.course).toEqual({
      name: 'Lake View Meadows',
      slug: 'lake-view-meadows-roundabc',
      organization: null,
      geo: null,
      createdBy: 'user-1',
    })
    expect(plan.template).toEqual({
      label: 'Main',
      holes: [
        { number: 1, par: 3, lengthMeters: 82, notes: null },
        { number: 2, par: 4, lengthMeters: 106, notes: null },
      ],
      source: 'derived',
      createdBy: 'user-1',
      derivedFromRoundId: 'roundABC123',
      isDefault: true,
    })
  })
})
