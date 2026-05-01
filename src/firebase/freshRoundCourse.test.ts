import { describe, expect, it } from 'vitest'
import {
  FreshRoundDraftValidationError,
  applyFreshHoleMetadataToDraft,
  buildFreshCoursePromotionPlan,
  normalizeFreshCourseDraft,
  normalizeFreshCourseDraftForPromotion,
  resolveFreshRoundCourseRefs,
} from './freshRoundCourse'

describe('normalizeFreshCourseDraft', () => {
  it('normalizes course name and accepts empty hole metadata at round start', () => {
    const normalized = normalizeFreshCourseDraft({
      name: '  Lake   View   Meadows  ',
      holes: [
        { par: '', lengthMeters: '' },
        { par: null, lengthMeters: undefined },
      ],
    })

    expect(normalized).toEqual({
      name: 'Lake View Meadows',
      holes: [
        { number: 1, par: null, lengthMeters: null },
        { number: 2, par: null, lengthMeters: null },
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

  it('rejects invalid provided hole values with issue details', () => {
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

describe('applyFreshHoleMetadataToDraft', () => {
  it('updates metadata for one hole while preserving others', () => {
    const draft = normalizeFreshCourseDraft({
      name: 'Lake View Meadows',
      holes: [
        { par: '', lengthMeters: '' },
        { par: '', lengthMeters: '' },
      ],
    })

    const updated = applyFreshHoleMetadataToDraft({
      draft,
      holeNumber: 2,
      par: '4',
      lengthMeters: '112',
    })

    expect(updated.holes).toEqual([
      { number: 1, par: null, lengthMeters: null },
      { number: 2, par: 4, lengthMeters: 112 },
    ])
  })
})

describe('normalizeFreshCourseDraftForPromotion', () => {
  it('returns a promotion-ready draft with required values', () => {
    const draft = normalizeFreshCourseDraft({
      name: 'Lake View Meadows',
      holes: [
        { par: 3, lengthMeters: 82 },
        { par: 4, lengthMeters: 106 },
      ],
    })

    const normalized = normalizeFreshCourseDraftForPromotion(draft)
    expect(normalized).toEqual({
      name: 'Lake View Meadows',
      holes: [
        { number: 1, par: 3, lengthMeters: 82 },
        { number: 2, par: 4, lengthMeters: 106 },
      ],
    })
  })

  it('lists missing required fields per hole', () => {
    const draft = normalizeFreshCourseDraft({
      name: 'Lake View Meadows',
      holes: [
        { par: '', lengthMeters: '' },
        { par: 4, lengthMeters: '' },
      ],
    })

    try {
      normalizeFreshCourseDraftForPromotion(draft)
      throw new Error('expected validation to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(FreshRoundDraftValidationError)
      const typed = error as FreshRoundDraftValidationError
      expect(typed.issues.map((issue) => issue.path)).toEqual([
        'holes.0.par',
        'holes.0.lengthMeters',
        'holes.1.lengthMeters',
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

  it('rejects incomplete metadata before promotion', () => {
    const draft = normalizeFreshCourseDraft({
      name: 'Lake View Meadows',
      holes: [{ par: '', lengthMeters: '' }],
    })

    expect(() =>
      buildFreshCoursePromotionPlan({
        roundId: 'roundABC123',
        ownerId: 'user-1',
        draft,
      }),
    ).toThrow(FreshRoundDraftValidationError)
  })
})
