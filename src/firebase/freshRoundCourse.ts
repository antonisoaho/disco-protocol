import { slugify } from '../courses/slug'
import type { CourseHoleTemplate, CourseTemplateDoc, CourseDoc } from './models/course'
import type { RoundCourseDraft } from './roundTypes'

const MIN_HOLE_COUNT = 1
const MAX_HOLE_COUNT = 36
const MIN_PAR = 2
const MAX_PAR = 9
const MIN_LENGTH_METERS = 1
const MAX_LENGTH_METERS = 5000

type NumericLike = number | string | null | undefined

export type FreshHoleInput = {
  par: NumericLike
  lengthMeters?: NumericLike
}

export type FreshCourseDraftInput = {
  name: string
  holes: FreshHoleInput[]
}

export type FreshRoundDraftIssueCode =
  | 'invalid_name'
  | 'invalid_hole_count'
  | 'invalid_par'
  | 'invalid_length'

export type FreshRoundDraftIssue = {
  code: FreshRoundDraftIssueCode
  path: string
  message: string
}

export class FreshRoundDraftValidationError extends Error {
  issues: FreshRoundDraftIssue[]

  constructor(issues: FreshRoundDraftIssue[]) {
    super(
      `Fresh round draft validation failed: ${issues
        .map((issue) => `${issue.path} (${issue.code})`)
        .join(', ')}`,
    )
    this.name = 'FreshRoundDraftValidationError'
    this.issues = issues
  }
}

export type FreshRoundCourseRefs = {
  courseId: string
  templateId: string
}

export type FreshCoursePromotionPlan = {
  courseId: string
  templateId: string
  course: Omit<CourseDoc, 'createdAt'>
  template: Omit<CourseTemplateDoc, 'createdAt'>
}

function parseInteger(value: NumericLike): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value
  }
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) {
    const parsed = Number(value)
    return Number.isSafeInteger(parsed) ? parsed : null
  }
  return null
}

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

export function normalizeFreshCourseDraft(input: FreshCourseDraftInput): RoundCourseDraft {
  const issues: FreshRoundDraftIssue[] = []
  const name = normalizeName(input.name)
  if (name.length === 0) {
    issues.push({
      code: 'invalid_name',
      path: 'name',
      message: 'Course name is required.',
    })
  }

  if (input.holes.length < MIN_HOLE_COUNT || input.holes.length > MAX_HOLE_COUNT) {
    issues.push({
      code: 'invalid_hole_count',
      path: 'holes',
      message: `Fresh rounds must include ${MIN_HOLE_COUNT}-${MAX_HOLE_COUNT} holes.`,
    })
  }

  const holes: RoundCourseDraft['holes'] = input.holes.map((raw, index) => {
    const pathPrefix = `holes.${index}`
    const par = parseInteger(raw.par)
    if (par === null || par < MIN_PAR || par > MAX_PAR) {
      issues.push({
        code: 'invalid_par',
        path: `${pathPrefix}.par`,
        message: `Par must be an integer in range ${MIN_PAR}-${MAX_PAR}.`,
      })
    }

    let lengthMeters: number | null = null
    const rawLength = raw.lengthMeters
    if (rawLength !== undefined && rawLength !== null && !(typeof rawLength === 'string' && rawLength.trim() === '')) {
      const parsedLength = parseInteger(rawLength)
      if (parsedLength === null || parsedLength < MIN_LENGTH_METERS || parsedLength > MAX_LENGTH_METERS) {
        issues.push({
          code: 'invalid_length',
          path: `${pathPrefix}.lengthMeters`,
          message: `Length must be an integer in range ${MIN_LENGTH_METERS}-${MAX_LENGTH_METERS} meters.`,
        })
      } else {
        lengthMeters = parsedLength
      }
    }

    return {
      number: index + 1,
      par: par ?? MIN_PAR,
      lengthMeters,
    }
  })

  if (issues.length > 0) {
    throw new FreshRoundDraftValidationError(issues)
  }

  return { name, holes }
}

export function resolveFreshRoundCourseRefs(
  roundId: string,
  draftName: string,
  existing?: Partial<FreshRoundCourseRefs> | null,
): FreshRoundCourseRefs {
  const roundToken = roundId.trim().slice(0, 8) || 'round'
  return {
    courseId: existing?.courseId?.trim() || `fresh-${slugify(draftName)}-${roundToken}`,
    templateId: existing?.templateId?.trim() || `${roundToken}-main`,
  }
}

export function buildFreshCoursePromotionPlan(params: {
  roundId: string
  ownerId: string
  draft: RoundCourseDraft
  existingRefs?: Partial<FreshRoundCourseRefs> | null
}): FreshCoursePromotionPlan {
  const refs = resolveFreshRoundCourseRefs(params.roundId, params.draft.name, params.existingRefs)
  const slugToken = refs.courseId.slice(-8).toLowerCase()
  return {
    courseId: refs.courseId,
    templateId: refs.templateId,
    course: {
      name: params.draft.name,
      slug: `${slugify(params.draft.name)}-${slugToken}`,
      organization: null,
      geo: null,
      createdBy: params.ownerId,
    },
    template: {
      label: 'Main',
      holes: params.draft.holes.map(
        (hole): CourseHoleTemplate => ({
          number: hole.number,
          par: hole.par,
          lengthMeters: hole.lengthMeters ?? null,
          notes: null,
        }),
      ),
      source: 'derived',
      createdBy: params.ownerId,
      derivedFromRoundId: params.roundId,
      isDefault: true,
    },
  }
}
