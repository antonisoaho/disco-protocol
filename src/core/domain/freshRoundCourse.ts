import { slugify } from '@core/domain/courseSlug'
import type { CourseHoleTemplate, CourseTemplateDoc, CourseDoc } from '@core/domain/course'
import type { RoundCourseDraft } from '@core/domain/round'

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
  | 'invalid_hole_number'
  | 'invalid_par'
  | 'invalid_length'
  | 'missing_par'
  | 'missing_length'

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

export type PromotionReadyRoundCourseDraft = {
  name: string
  holes: {
    number: number
    par: number
    lengthMeters: number
  }[]
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

function isBlankNumeric(value: NumericLike): boolean {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '')
}

function normalizeParValue(params: {
  value: NumericLike
  path: string
  issues: FreshRoundDraftIssue[]
  required: boolean
}): number | null {
  if (isBlankNumeric(params.value)) {
    if (params.required) {
      params.issues.push({
        code: 'missing_par',
        path: params.path,
        message: 'Par is required before completing the round.',
      })
    }
    return null
  }

  const par = parseInteger(params.value)
  if (par === null || par < MIN_PAR || par > MAX_PAR) {
    params.issues.push({
      code: 'invalid_par',
      path: params.path,
      message: `Par must be an integer in range ${MIN_PAR}-${MAX_PAR}.`,
    })
    return null
  }

  return par
}

function normalizeLengthValue(params: {
  value: NumericLike
  path: string
  issues: FreshRoundDraftIssue[]
  required: boolean
}): number | null {
  if (isBlankNumeric(params.value)) {
    if (params.required) {
      params.issues.push({
        code: 'missing_length',
        path: params.path,
        message: 'Length is required before completing the round.',
      })
    }
    return null
  }

  const parsedLength = parseInteger(params.value)
  if (parsedLength === null || parsedLength < MIN_LENGTH_METERS || parsedLength > MAX_LENGTH_METERS) {
    params.issues.push({
      code: 'invalid_length',
      path: params.path,
      message: `Length must be an integer in range ${MIN_LENGTH_METERS}-${MAX_LENGTH_METERS} meters.`,
    })
    return null
  }

  return parsedLength
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
    const par = normalizeParValue({
      value: raw.par,
      path: `${pathPrefix}.par`,
      issues,
      required: false,
    })
    const lengthMeters = normalizeLengthValue({
      value: raw.lengthMeters,
      path: `${pathPrefix}.lengthMeters`,
      issues,
      required: false,
    })

    return {
      number: index + 1,
      par,
      lengthMeters,
    }
  })

  if (issues.length > 0) {
    throw new FreshRoundDraftValidationError(issues)
  }

  return { name, holes }
}

export function applyFreshHoleMetadataToDraft(params: {
  draft: RoundCourseDraft
  holeNumber: NumericLike
  par: NumericLike
  lengthMeters: NumericLike
}): RoundCourseDraft {
  const baseDraft = normalizeFreshCourseDraft({
    name: params.draft.name,
    holes: params.draft.holes.map((hole) => ({
      par: hole.par ?? null,
      lengthMeters: hole.lengthMeters ?? null,
    })),
  })

  const issues: FreshRoundDraftIssue[] = []
  const holeNumber = parseInteger(params.holeNumber)
  if (holeNumber === null || holeNumber < MIN_HOLE_COUNT || holeNumber > baseDraft.holes.length) {
    issues.push({
      code: 'invalid_hole_number',
      path: 'holeNumber',
      message: `Hole must be an integer in range ${MIN_HOLE_COUNT}-${baseDraft.holes.length}.`,
    })
    throw new FreshRoundDraftValidationError(issues)
  }
  const holeIndex = holeNumber - 1
  const pathPrefix = `holes.${holeIndex}`
  const par = normalizeParValue({
    value: params.par,
    path: `${pathPrefix}.par`,
    issues,
    required: false,
  })
  const lengthMeters = normalizeLengthValue({
    value: params.lengthMeters,
    path: `${pathPrefix}.lengthMeters`,
    issues,
    required: false,
  })
  if (issues.length > 0) {
    throw new FreshRoundDraftValidationError(issues)
  }

  return {
    ...baseDraft,
    holes: baseDraft.holes.map((hole, index) =>
      index === holeIndex ? { ...hole, par, lengthMeters } : hole,
    ),
  }
}

export function normalizeFreshCourseDraftForPromotion(
  draft: RoundCourseDraft | null | undefined,
): PromotionReadyRoundCourseDraft {
  const issues: FreshRoundDraftIssue[] = []
  const normalizedName = normalizeName(draft?.name ?? '')
  if (normalizedName.length === 0) {
    issues.push({
      code: 'invalid_name',
      path: 'name',
      message: 'Course name is required.',
    })
  }

  const rawHoles = draft?.holes ?? []
  if (rawHoles.length < MIN_HOLE_COUNT || rawHoles.length > MAX_HOLE_COUNT) {
    issues.push({
      code: 'invalid_hole_count',
      path: 'holes',
      message: `Fresh rounds must include ${MIN_HOLE_COUNT}-${MAX_HOLE_COUNT} holes.`,
    })
  }

  const holes = rawHoles.map((raw, index) => {
    const pathPrefix = `holes.${index}`
    const expectedNumber = index + 1
    const number = parseInteger(raw.number)
    if (number === null || number !== expectedNumber) {
      issues.push({
        code: 'invalid_hole_number',
        path: `${pathPrefix}.number`,
        message: `Hole numbering must be sequential (expected ${expectedNumber}).`,
      })
    }

    const par = normalizeParValue({
      value: raw.par,
      path: `${pathPrefix}.par`,
      issues,
      required: true,
    })
    const lengthMeters = normalizeLengthValue({
      value: raw.lengthMeters,
      path: `${pathPrefix}.lengthMeters`,
      issues,
      required: true,
    })

    return {
      number: expectedNumber,
      par: par ?? MIN_PAR,
      lengthMeters: lengthMeters ?? MIN_LENGTH_METERS,
    }
  })

  if (issues.length > 0) {
    throw new FreshRoundDraftValidationError(issues)
  }

  return {
    name: normalizedName,
    holes,
  }
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
  const normalizedDraft = normalizeFreshCourseDraftForPromotion(params.draft)
  const refs = resolveFreshRoundCourseRefs(params.roundId, normalizedDraft.name, params.existingRefs)
  const slugToken = refs.courseId.slice(-8).toLowerCase()
  return {
    courseId: refs.courseId,
    templateId: refs.templateId,
    course: {
      name: normalizedDraft.name,
      slug: `${slugify(normalizedDraft.name)}-${slugToken}`,
      organization: null,
      geo: null,
      createdBy: params.ownerId,
    },
    template: {
      label: 'Main',
      holes: normalizedDraft.holes.map(
        (hole): CourseHoleTemplate => ({
          number: hole.number,
          par: hole.par,
          lengthMeters: hole.lengthMeters,
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
