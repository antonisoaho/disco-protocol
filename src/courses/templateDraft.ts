import type { CourseHoleTemplate } from '../firebase/models/course'

const DEFAULT_TEMPLATE_LABEL = 'Main'
const DEFAULT_HOLE_COUNT = 9
const MAX_HOLE_COUNT = 27
const DEFAULT_PAR = 3
const MIN_PAR = 2
const MAX_PAR = 6
const MAX_LENGTH_METERS = 2000

export function normalizeCourseName(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

export function normalizeCourseCity(value: string): string | null {
  const normalized = value.trim().replace(/\s+/g, ' ')
  return normalized.length > 0 ? normalized : null
}

export function validateCourseName(value: string): string | null {
  return normalizeCourseName(value).length > 0 ? null : 'Course name is required'
}

export function normalizeTemplateLabel(value: string): string {
  const next = value.trim()
  return next.length > 0 ? next : DEFAULT_TEMPLATE_LABEL
}

export function normalizeHoleCount(value: number): number {
  if (!Number.isFinite(value) || value < 1) return DEFAULT_HOLE_COUNT
  return Math.min(MAX_HOLE_COUNT, Math.floor(value))
}

export function createTemplateDraft(params: {
  label: string
  holeCount: number
}): { label: string; holes: CourseHoleTemplate[] } {
  const holeCount = normalizeHoleCount(params.holeCount)
  const holes: CourseHoleTemplate[] = Array.from({ length: holeCount }, (_, i) => ({
    number: i + 1,
    par: DEFAULT_PAR,
    lengthMeters: null,
    notes: null,
  }))
  return {
    label: normalizeTemplateLabel(params.label),
    holes,
  }
}

export function clampPar(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_PAR
  return Math.min(MAX_PAR, Math.max(MIN_PAR, Math.round(value)))
}

export function normalizeLengthMeters(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  if (value <= 0) return null
  return Math.min(MAX_LENGTH_METERS, Math.round(value))
}

/** Interprets layout hole length field: empty string → unknown length. */
export function parseLengthMetersInput(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed.length === 0) return null
  const n = Number(trimmed)
  if (!Number.isFinite(n) || n < 0) return null
  if (n === 0) return null
  return Math.min(MAX_LENGTH_METERS, Math.round(n))
}

/**
 * Keeps hole metadata when shrinking/growing layout size; new indices use defaults.
 */
export function resizeTemplateHoles(previous: CourseHoleTemplate[], holeCount: number): CourseHoleTemplate[] {
  const n = normalizeHoleCount(holeCount)
  const byNumber = new Map<number, CourseHoleTemplate>()
  for (const hole of previous) {
    if (hole && typeof hole.number === 'number' && Number.isInteger(hole.number)) {
      byNumber.set(hole.number, hole)
    }
  }
  const next: CourseHoleTemplate[] = []
  for (let i = 1; i <= n; i += 1) {
    const existing = byNumber.get(i)
    if (existing) {
      next.push({
        number: i,
        par: clampPar(existing.par),
        lengthMeters: normalizeLengthMeters(existing.lengthMeters),
        notes: typeof existing.notes === 'string' && existing.notes.trim().length > 0 ? existing.notes.trim() : null,
      })
    } else {
      next.push({
        number: i,
        par: DEFAULT_PAR,
        lengthMeters: null,
        notes: null,
      })
    }
  }
  return next
}

/** Normalizes sequential hole numbers and par/length before Firestore write. */
export function normalizeTemplateHolesForSave(holes: CourseHoleTemplate[]): CourseHoleTemplate[] {
  if (!Array.isArray(holes) || holes.length === 0) {
    return createTemplateDraft({ label: 'x', holeCount: 1 }).holes
  }
  return holes.map((hole, index) => ({
    number: index + 1,
    par: clampPar(hole?.par),
    lengthMeters: normalizeLengthMeters(hole?.lengthMeters),
    notes: typeof hole?.notes === 'string' && hole.notes.trim().length > 0 ? hole.notes.trim() : null,
  }))
}
