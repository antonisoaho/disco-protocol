import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore'
import { firebaseApp } from '@core/firebase/app'

/**
 * IndexedDB-backed cache for offline scoring (Scoring epic). Opt out with `VITE_FIRESTORE_PERSISTENCE=false`
 * (e.g. tests or debugging). See `docs/scoring-concurrency-offline.md`.
 */
function createFirestore(): Firestore {
  if (import.meta.env.VITE_FIRESTORE_PERSISTENCE === 'false') {
    return getFirestore(firebaseApp)
  }
  return initializeFirestore(firebaseApp, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  })
}

export const db: Firestore = createFirestore()
