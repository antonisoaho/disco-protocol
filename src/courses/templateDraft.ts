import type { CourseHoleTemplate } from '../firebase/models/course'

const DEFAULT_TEMPLATE_LABEL = 'Main'
const DEFAULT_HOLE_COUNT = 9
const MAX_HOLE_COUNT = 27
const DEFAULT_PAR = 3

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
