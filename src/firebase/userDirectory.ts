import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  type FirestoreError,
  type QuerySnapshot,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from './firestore'
import type { UserProfileDoc } from './userProfile'

const USERS = 'users'
const MAX_DIRECTORY_RESULTS = 100

export type UserDirectoryEntry = {
  uid: string
  displayName: string
  subtitle: string
}

function toDisplayName(uid: string, raw: unknown): string {
  if (typeof raw === 'string' && raw.trim().length > 0) {
    return raw.trim()
  }
  return uid
}

export function subscribeUserDirectory(
  onNext: (entries: UserDirectoryEntry[]) => void,
  onError?: (error: FirestoreError) => void,
): Unsubscribe {
  const q = query(collection(db, USERS), orderBy('displayName'), limit(MAX_DIRECTORY_RESULTS))
  return onSnapshot(
    q,
    (snap: QuerySnapshot) => {
      const entries = snap.docs.map((docSnap) => {
        const data = docSnap.data() as Partial<UserProfileDoc>
        const uid = docSnap.id
        return {
          uid,
          displayName: toDisplayName(uid, data.displayName),
          subtitle: uid,
        }
      })
      onNext(entries)
    },
    onError,
  )
}
