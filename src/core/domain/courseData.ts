import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from '@core/firebase/firestore'
import type { CourseDoc, CourseHoleTemplate, CourseTemplateDoc } from '@core/domain/course'
import { COLLECTIONS } from '@core/firebase/paths'
import { slugify } from '@core/domain/courseSlug'
import {
  createTemplateDraft,
  normalizeCourseCity,
  normalizeCourseName,
  normalizeHoleCount,
  normalizeTemplateHolesForSave,
  normalizeTemplateLabel,
} from '@core/domain/templateDraft'

export type CourseWithId = CourseDoc & { id: string }
export type CourseTemplateWithId = CourseTemplateDoc & { id: string }
export type CourseRoundSelection = {
  courseId: string
  courseName: string
  templateId: string
  templateLabel: string
  holeCount: number
}

/** Result of resolving a saved course + canonical template for starting a round. */
export type SavedRoundTemplateResolution = {
  selection: CourseRoundSelection
  /** Number of template documents under the course (for UX: single vs multi-layout). */
  templateCount: number
}

export function subscribeCourses(
  onNext: (rows: CourseWithId[]) => void,
  onError?: (e: Error) => void,
): Unsubscribe {
  const q = query(collection(db, COLLECTIONS.courses), orderBy('name'))
  return onSnapshot(
    q,
    (snap) => {
      onNext(snap.docs.map((d) => ({ id: d.id, ...(d.data() as CourseDoc) })))
    },
    (err) => onError?.(err as Error),
  )
}

export function subscribeTemplates(
  courseId: string,
  onNext: (rows: CourseTemplateWithId[]) => void,
  onError?: (e: Error) => void,
): Unsubscribe {
  const q = query(
    collection(db, COLLECTIONS.courses, courseId, COLLECTIONS.templates),
    orderBy('label'),
  )
  return onSnapshot(
    q,
    (snap) => {
      onNext(snap.docs.map((d) => ({ id: d.id, ...(d.data() as CourseTemplateDoc) })))
    },
    (err) => onError?.(err as Error),
  )
}

export type RoundHoleLengthChoice = 9 | 18

/**
 * Picks the layout used for scoring: `isDefault` template, else first by `orderBy('label')` snapshot order.
 * With a single template doc, callers should treat that row as the only layout (no template choice).
 */
export function pickCanonicalCourseTemplate(templates: CourseTemplateWithId[]): CourseTemplateWithId | null {
  if (templates.length === 0) return null
  if (templates.length === 1) return templates[0] ?? null
  return templates.find((row) => row.isDefault === true) ?? templates[0] ?? null
}

export async function loadRoundSelectionForCourse(params: {
  courseId: string
  courseName: string
  preferredTemplateId?: string | null
}): Promise<CourseRoundSelection | null> {
  const templatesSnapshot = await getDocs(
    query(collection(db, COLLECTIONS.courses, params.courseId, COLLECTIONS.templates), orderBy('label')),
  )
  const templates = templatesSnapshot.docs.map((docSnapshot) => ({
    id: docSnapshot.id,
    ...(docSnapshot.data() as CourseTemplateDoc),
  }))
  if (templates.length === 0) {
    return null
  }
  const explicit =
    params.preferredTemplateId != null && params.preferredTemplateId !== ''
      ? templates.find((template) => template.id === params.preferredTemplateId)
      : undefined
  const preferredTemplate = explicit ?? pickCanonicalCourseTemplate(templates)
  if (!preferredTemplate) {
    return null
  }

  return {
    courseId: params.courseId,
    courseName: params.courseName,
    templateId: preferredTemplate.id,
    templateLabel: preferredTemplate.label,
    holeCount: preferredTemplate.holes.length,
  }
}

/** Resolves course + template for starting a saved round with a 9/18 hole choice. */
export async function loadRoundSelectionForCourseAndHoleChoice(params: {
  courseId: string
  courseName: string
  holeChoice: RoundHoleLengthChoice
}): Promise<SavedRoundTemplateResolution | null> {
  const templatesSnapshot = await getDocs(
    query(collection(db, COLLECTIONS.courses, params.courseId, COLLECTIONS.templates), orderBy('label')),
  )
  const templates = templatesSnapshot.docs.map((docSnapshot) => ({
    id: docSnapshot.id,
    ...(docSnapshot.data() as CourseTemplateDoc),
  }))
  const templateCount = templates.length
  if (templates.length === 0) {
    return null
  }
  const picked = pickCanonicalCourseTemplate(templates)
  if (!picked) {
    return null
  }
  const cap =
    params.holeChoice === 9 ? Math.min(9, picked.holes.length) : Math.min(18, picked.holes.length)
  return {
    templateCount,
    selection: {
      courseId: params.courseId,
      courseName: params.courseName,
      templateId: picked.id,
      templateLabel: picked.label,
      holeCount: Math.max(1, cap),
    },
  }
}

/** Creates a course and a starter “Main” template so the picker always has a layout row. */
export async function createCourseWithDefaultTemplate(params: {
  name: string
  uid: string
  city?: string | null
  organization?: string | null
  holeCount?: number
}): Promise<{ courseId: string; templateId: string }> {
  const normalizedName = normalizeCourseName(params.name)
  const slug = `${slugify(normalizedName)}-${params.uid.slice(0, 8)}`

  const courseRef = await addDoc(collection(db, COLLECTIONS.courses), {
    name: normalizedName,
    city: normalizeCourseCity(params.city ?? ''),
    slug,
    organization: params.organization ?? null,
    geo: null,
    createdBy: params.uid,
    createdAt: serverTimestamp(),
  })

  const layoutHoles = params.holeCount === 18 ? 18 : 9
  const draft = createTemplateDraft({
    label: 'Main',
    holeCount: layoutHoles,
  })

  const templateRef = await addDoc(
    collection(db, COLLECTIONS.courses, courseRef.id, COLLECTIONS.templates),
    {
      label: draft.label,
      holes: draft.holes,
      source: 'crowd',
      createdBy: params.uid,
      createdAt: serverTimestamp(),
      isDefault: true,
    },
  )

  return { courseId: courseRef.id, templateId: templateRef.id }
}

export async function createTemplate(params: {
  courseId: string
  uid: string
  label: string
  holeCount: number
  holes?: CourseHoleTemplate[] | null
  isDefault?: boolean
}): Promise<string> {
  const holeCount = normalizeHoleCount(params.holeCount)
  const holes =
    params.holes && params.holes.length === holeCount
      ? normalizeTemplateHolesForSave(params.holes)
      : createTemplateDraft({ label: params.label, holeCount }).holes
  const label = normalizeTemplateLabel(params.label)
  const templateRef = await addDoc(collection(db, COLLECTIONS.courses, params.courseId, COLLECTIONS.templates), {
    label,
    holes,
    source: 'crowd',
    createdBy: params.uid,
    createdAt: serverTimestamp(),
    isDefault: params.isDefault === true,
  })
  return templateRef.id
}

export async function updateTemplate(params: {
  courseId: string
  templateId: string
  label: string
  holes: CourseHoleTemplate[]
}): Promise<void> {
  const holes = normalizeTemplateHolesForSave(params.holes)
  const label = normalizeTemplateLabel(params.label)
  await updateDoc(doc(db, COLLECTIONS.courses, params.courseId, COLLECTIONS.templates, params.templateId), {
    label,
    holes,
  })
}

/** Canonical course rename (admin-gated by Firestore rules). */
export async function updateCourseDetails(params: {
  courseId: string
  name: string
  city: string | null
}): Promise<void> {
  await updateDoc(doc(db, COLLECTIONS.courses, params.courseId), {
    name: normalizeCourseName(params.name),
    city: normalizeCourseCity(params.city ?? ''),
  })
}

/** Admin-only helper: remove templates first, then the parent course document. */
export async function deleteCourseWithTemplates(courseId: string): Promise<void> {
  const templatesRef = collection(db, COLLECTIONS.courses, courseId, COLLECTIONS.templates)
  const templatesSnapshot = await getDocs(templatesRef)

  for (const templateSnapshot of templatesSnapshot.docs) {
    await deleteDoc(templateSnapshot.ref)
  }

  await deleteDoc(doc(db, COLLECTIONS.courses, courseId))
}
