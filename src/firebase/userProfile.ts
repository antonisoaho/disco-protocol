import { updateProfile, type User } from 'firebase/auth'
import {
  arrayRemove,
  arrayUnion,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Timestamp,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from './firestore'

export type UserProfileDoc = {
  displayName: string
  photoUrl: string | null
  favoriteCourseIds?: string[]
  /** Set by trusted backend tooling; never client-assigned. */
  admin?: boolean
  createdAt: Timestamp
}

const USERS = 'users'

/** Ensures `users/{uid}` exists after sign-in. Idempotent for existing profiles. */
export async function ensureUserProfile(authUser: User): Promise<void> {
  const ref = doc(db, USERS, authUser.uid)
  const snap = await getDoc(ref)
  if (snap.exists()) return

  const displayName =
    authUser.displayName?.trim() ||
    authUser.email?.split('@')[0] ||
    'Player'

  await setDoc(ref, {
    displayName,
    photoUrl: authUser.photoURL ?? null,
    createdAt: serverTimestamp(),
  })

  if (!authUser.displayName?.trim()) {
    await updateProfile(authUser, { displayName })
  }
}

function normalizeFavoriteCourseIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const deduped = new Set<string>()
  for (const item of value) {
    if (typeof item !== 'string') continue
    const normalized = item.trim()
    if (normalized.length === 0) continue
    deduped.add(normalized)
  }
  return Array.from(deduped)
}

export function readFavoriteCourseIds(profile: unknown): string[] {
  if (!profile || typeof profile !== 'object') return []
  const candidate = profile as { favoriteCourseIds?: unknown }
  return normalizeFavoriteCourseIds(candidate.favoriteCourseIds)
}

export function subscribeFavoriteCourseIds(
  uid: string,
  onNext: (favoriteCourseIds: string[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const ref = doc(db, USERS, uid)
  return onSnapshot(
    ref,
    (snapshot) => {
      onNext(readFavoriteCourseIds(snapshot.data() ?? null))
    },
    (error) => onError?.(error as Error),
  )
}

export async function setCourseFavorite(params: {
  uid: string
  courseId: string
  isFavorite: boolean
}): Promise<void> {
  const courseId = params.courseId.trim()
  if (!courseId) return
  const ref = doc(db, USERS, params.uid)
  await updateDoc(ref, {
    favoriteCourseIds: params.isFavorite ? arrayUnion(courseId) : arrayRemove(courseId),
  })
}
