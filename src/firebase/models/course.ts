import type { GeoPoint, Timestamp } from 'firebase/firestore'

/** One hole on a reusable layout (canonical or crowd-sourced). */
export type CourseHoleTemplate = {
  number: number
  par: number
  /** Meters; optional when unknown. */
  lengthMeters?: number | null
  notes?: string | null
}

export type CourseTemplateSource = 'official' | 'crowd' | 'derived'

/**
 * `courses/{courseId}/templates/{templateId}`
 * Normalized holes; rounds snapshot `templateId` at start.
 */
export type CourseTemplateDoc = {
  label: string
  holes: CourseHoleTemplate[]
  source: CourseTemplateSource
  createdBy: string
  createdAt: Timestamp
  /** When `source === 'derived'`, links back to the completed round that produced this row. */
  derivedFromRoundId?: string | null
  /** Optional default layout for this course in UIs. */
  isDefault?: boolean
}

export type CourseAdminMetadata = {
  lastRenamedAt?: Timestamp
  lastRenamedByUid?: string | null
  notes?: string | null
}

/**
 * `courses/{courseId}` — logical course (venue). Canonical naming/geo are admin-only to change after create.
 */
export type CourseDoc = {
  name: string
  city?: string | null
  /** URL-safe unique-ish handle within project; enforce uniqueness in app or Cloud Function later. */
  slug: string
  organization?: string | null
  geo?: GeoPoint | null
  createdBy: string
  createdAt: Timestamp
  adminMetadata?: CourseAdminMetadata
}
