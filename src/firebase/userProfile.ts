import { updateProfile, type User } from 'firebase/auth'
import { doc, getDoc, serverTimestamp, setDoc, type Timestamp } from 'firebase/firestore'
import { db } from './firestore'

export type UserProfileDoc = {
  displayName: string
  photoUrl: string | null
  bio?: string
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
    bio: '',
    createdAt: serverTimestamp(),
  })

  if (!authUser.displayName?.trim()) {
    await updateProfile(authUser, { displayName })
  }
}
