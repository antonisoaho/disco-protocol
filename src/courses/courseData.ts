import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from '../firebase/firestore'
import type { CourseDoc, CourseHoleTemplate, CourseTemplateDoc } from '../firebase/models/course'
import { COLLECTIONS } from '../firebase/paths'
import { slugify } from './slug'

export type CourseWithId = CourseDoc & { id: string }
export type CourseTemplateWithId = CourseTemplateDoc & { id: string }

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

const DEFAULT_HOLE_COUNT = 9
const DEFAULT_PAR = 3

function defaultHoles(count: number): CourseHoleTemplate[] {
  return Array.from({ length: count }, (_, i) => ({
    number: i + 1,
    par: DEFAULT_PAR,
    lengthMeters: null,
    notes: null,
  }))
}

/** Creates a course and a starter “Main” template so the picker always has a layout row. */
export async function createCourseWithDefaultTemplate(params: {
  name: string
  uid: string
  organization?: string | null
  holeCount?: number
}): Promise<{ courseId: string; templateId: string }> {
  const holeCount = params.holeCount ?? DEFAULT_HOLE_COUNT
  const slug = `${slugify(params.name)}-${params.uid.slice(0, 8)}`

  const courseRef = await addDoc(collection(db, COLLECTIONS.courses), {
    name: params.name.trim(),
    slug,
    organization: params.organization ?? null,
    geo: null,
    createdBy: params.uid,
    createdAt: serverTimestamp(),
  })

  const templateRef = await addDoc(
    collection(db, COLLECTIONS.courses, courseRef.id, COLLECTIONS.templates),
    {
      label: 'Main',
      holes: defaultHoles(holeCount),
      source: 'crowd',
      createdBy: params.uid,
      createdAt: serverTimestamp(),
      isDefault: true,
    },
  )

  return { courseId: courseRef.id, templateId: templateRef.id }
}
