import { updateProfile, type User } from 'firebase/auth'
import {
  arrayRemove,
  arrayUnion,
  doc,
  getDoc,
  getDocFromServer,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Timestamp,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from './firestore'
import {
  DISPLAY_NAME_MAX_LENGTH,
  normalizeDisplayName,
  validateDisplayName,
} from '../profile/displayName'
export {
  DISPLAY_NAME_MAX_LENGTH,
  normalizeDisplayName,
  validateDisplayName,
  type DisplayNameValidationError,
} from '../profile/displayName'

export type UserProfileDoc = {
  displayName: string
  photoUrl: string | null
  favoriteCourseIds?: string[]
  /** Set by trusted backend tooling; never client-assigned. */
  admin?: boolean
  createdAt: Timestamp
}

const USERS = 'users'

const PROFILE_WRITE_ATTEMPTS = 5
const PROFILE_WRITE_BASE_DELAY_MS = 450

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function readUserDocPreferServer(ref: ReturnType<typeof doc>): Promise<Awaited<ReturnType<typeof getDoc>>> {
  try {
    return await getDocFromServer(ref)
  } catch {
    return getDoc(ref)
  }
}

/**
 * Best-effort sync of Firebase Auth display name. Some projects disallow
 * `updateProfile`; failures are ignored so Firestore remains canonical.
 */
export async function trySyncAuthDisplayName(authUser: User, displayName: string): Promise<void> {
  if (authUser.displayName?.trim()) return
  const trimmed = displayName.trim()
  if (!trimmed) return
  try {
    await updateProfile(authUser, { displayName: trimmed })
  } catch {
    // Non-fatal: app uses Firestore `users.displayName` as source of truth.
  }
}

/** Ensures `users/{uid}` exists after sign-in. Idempotent for existing profiles. */
export async function ensureUserProfile(authUser: User): Promise<void> {
  const ref = doc(db, USERS, authUser.uid)
  const initial = await getDoc(ref)
  if (initial.exists()) {
    const data = initial.data() as { displayName?: unknown } | undefined
    const fromDoc =
      typeof data?.displayName === 'string' ? normalizeDisplayName(data.displayName) : ''
    const seed =
      fromDoc ||
      normalizeDisplayName(authUser.displayName ?? '') ||
      authUser.email?.split('@')[0] ||
      'Player'
    await trySyncAuthDisplayName(authUser, seed.slice(0, DISPLAY_NAME_MAX_LENGTH) || 'Player')
    return
  }

  const seedDisplayName =
    authUser.displayName ||
    authUser.email?.split('@')[0] ||
    'Player'
  const normalizedSeed = normalizeDisplayName(seedDisplayName)
  const displayName = normalizedSeed.slice(0, DISPLAY_NAME_MAX_LENGTH) || 'Player'

  const payload = {
    displayName,
    photoUrl: authUser.photoURL ?? null,
    createdAt: serverTimestamp(),
  }

  let lastError: unknown
  for (let attempt = 0; attempt < PROFILE_WRITE_ATTEMPTS; attempt += 1) {
    const preexisting = await getDoc(ref)
    if (preexisting.exists()) {
      await trySyncAuthDisplayName(authUser, displayName)
      return
    }
    try {
      await setDoc(ref, payload)
      const verify = await readUserDocPreferServer(ref)
      if (verify.exists()) {
        await trySyncAuthDisplayName(authUser, displayName)
        return
      }
      const local = await getDoc(ref)
      if (local.exists()) {
        await trySyncAuthDisplayName(authUser, displayName)
        return
      }
    } catch (error) {
      lastError = error
    }
    await delay(PROFILE_WRITE_BASE_DELAY_MS * (attempt + 1))
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Could not create your player profile. Check your connection and try again.')
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

export async function updateUserDisplayName(params: {
  uid: string
  displayName: string
}): Promise<string> {
  const nextDisplayName = normalizeDisplayName(params.displayName)
  const validationError = validateDisplayName(nextDisplayName)
  if (validationError === 'empty') {
    throw new Error('Display name is required.')
  }
  if (validationError === 'tooLong') {
    throw new Error(`Display name must be at most ${DISPLAY_NAME_MAX_LENGTH} characters.`)
  }
  const ref = doc(db, USERS, params.uid)
  await updateDoc(ref, { displayName: nextDisplayName })
  return nextDisplayName
}
