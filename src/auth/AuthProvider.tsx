import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { auth } from '../firebase/auth'
import { db } from '../firebase/firestore'
import { COLLECTIONS } from '../firebase/paths'
import { ensureUserProfile } from '../firebase/userProfile'
import { isUserProfileAdmin } from './adminProfile'
import { AuthContext } from './auth-context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null
    const unsubscribeAuth = onAuthStateChanged(auth, (u) => {
      if (unsubscribeProfile) {
        unsubscribeProfile()
        unsubscribeProfile = null
      }
      // Update React state immediately; do not block on Firestore or the UI
      // stays on the sign-in form after a successful Firebase sign-in.
      setUser(u)
      setLoading(false)
      if (u) {
        void ensureUserProfile(u).catch((err) => {
          console.error('ensureUserProfile failed', err)
        })
      }
      if (!u) {
        setIsAdmin(false)
        return
      }

      unsubscribeProfile = onSnapshot(
        doc(db, COLLECTIONS.users, u.uid),
        (snapshot) => {
          setIsAdmin(isUserProfileAdmin((snapshot.data() ?? null) as { admin?: unknown } | null))
        },
        () => {
          setIsAdmin(false)
        },
      )
    })
    return () => {
      if (unsubscribeProfile) {
        unsubscribeProfile()
      }
      unsubscribeAuth()
    }
  }, [])

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email.trim(), password)
  }, [])

  const signUpWithEmail = useCallback(async (email: string, password: string) => {
    await createUserWithEmailAndPassword(auth, email.trim(), password)
  }, [])

  const signOut = useCallback(async () => {
    await firebaseSignOut(auth)
  }, [])

  const value = useMemo(
    () => ({
      user,
      loading,
      isAdmin,
      signInWithEmail,
      signUpWithEmail,
      signOut,
    }),
    [user, loading, isAdmin, signInWithEmail, signUpWithEmail, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
