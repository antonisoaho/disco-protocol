import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore'
import { firebaseApp } from './app'

/**
 * Firestore offline cache: enable with `VITE_FIRESTORE_PERSISTENCE=true` once Auth
 * and multi-tab behavior are validated (see Auth epic). Default is memory cache for CI and fresh clones.
 */
function createFirestore(): Firestore {
  if (import.meta.env.VITE_FIRESTORE_PERSISTENCE === 'true') {
    return initializeFirestore(firebaseApp, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    })
  }
  return getFirestore(firebaseApp)
}

export const db: Firestore = createFirestore()
