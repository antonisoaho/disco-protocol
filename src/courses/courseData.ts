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
import { db } from '../firebase/firestore'
import type { CourseDoc, CourseTemplateDoc } from '../firebase/models/course'
import { COLLECTIONS } from '../firebase/paths'
import { slugify } from './slug'
import { createTemplateDraft, normalizeCourseCity, normalizeCourseName } from './templateDraft'

export type CourseWithId = CourseDoc & { id: string }
export type CourseTemplateWithId = CourseTemplateDoc & { id: string }
export type CourseRoundSelection = {
  courseId: string
  courseName: string
  templateId: string
  templateLabel: string
  holeCount: number
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
  const preferredTemplate =
    (params.preferredTemplateId
      ? templates.find((template) => template.id === params.preferredTemplateId)
      : null) ??
    templates.find((template) => template.isDefault) ??
    templates[0]

  return {
    courseId: params.courseId,
    courseName: params.courseName,
    templateId: preferredTemplate.id,
    templateLabel: preferredTemplate.label,
    holeCount: preferredTemplate.holes.length,
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

  const draft = createTemplateDraft({
    label: 'Main',
    holeCount: params.holeCount ?? 9,
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
  isDefault?: boolean
}): Promise<string> {
  const draft = createTemplateDraft({
    label: params.label,
    holeCount: params.holeCount,
  })
  const templateRef = await addDoc(collection(db, COLLECTIONS.courses, params.courseId, COLLECTIONS.templates), {
    label: draft.label,
    holes: draft.holes,
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
  holeCount: number
}): Promise<void> {
  const draft = createTemplateDraft({
    label: params.label,
    holeCount: params.holeCount,
  })
  await updateDoc(doc(db, COLLECTIONS.courses, params.courseId, COLLECTIONS.templates, params.templateId), {
    label: draft.label,
    holes: draft.holes,
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
