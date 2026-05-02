import {
  collection,
  onSnapshot,
  query,
  type FirestoreError,
  type QuerySnapshot,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from './firestore'
import type { UserProfileDoc } from './userProfile'

const USERS = 'users'

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
  // MVP discovery strategy: load the full signed-in directory snapshot and apply client-side substring filtering.
  // If this collection grows substantially, move to dedicated search indexing.
  const q = query(collection(db, USERS))
  return onSnapshot(
    q,
    (snap: QuerySnapshot) => {
      const entries = snap.docs
        .map((docSnap) => {
          const data = docSnap.data() as Partial<UserProfileDoc>
          const uid = docSnap.id
          return {
            uid,
            displayName: toDisplayName(uid, data.displayName),
            subtitle: uid,
          }
        })
        .sort((a, b) =>
          a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }) || a.uid.localeCompare(b.uid),
        )
      onNext(entries)
    },
    onError,
  )
}
