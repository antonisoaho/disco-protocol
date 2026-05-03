import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { useTranslation } from 'react-i18next'
import { auth } from '../firebase/auth'
import { db } from '../firebase/firestore'
import { COLLECTIONS } from '../firebase/paths'
import { ensureUserProfile, normalizeDisplayName } from '../firebase/userProfile'
import { isUserProfileAdmin } from './adminProfile'
import { AuthContext } from './auth-context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation('common')
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [profileDisplayName, setProfileDisplayName] = useState<string | null>(null)
  const [userProfileProvisionError, setUserProfileProvisionError] = useState<string | null>(null)
  const userRef = useRef<User | null>(null)

  const runEnsureUserProfile = useCallback(
    async (nextUser: User) => {
      setUserProfileProvisionError(null)
      try {
        await ensureUserProfile(nextUser)
      } catch (error) {
        console.error('ensureUserProfile failed', error)
        setUserProfileProvisionError(t('shell.userProfileSyncFailed'))
      }
    },
    [t],
  )

  const retryUserProfileProvision = useCallback(async () => {
    const nextUser = userRef.current
    if (!nextUser) return
    await runEnsureUserProfile(nextUser)
  }, [runEnsureUserProfile])

  useEffect(() => {
    userRef.current = user
  }, [user])

  useEffect(() => {
    const onOnline = () => {
      const nextUser = userRef.current
      if (nextUser) {
        void runEnsureUserProfile(nextUser)
      }
    }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [runEnsureUserProfile])

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null
    const unsubscribeAuth = onAuthStateChanged(auth, (u) => {
      if (unsubscribeProfile) {
        unsubscribeProfile()
        unsubscribeProfile = null
      }
      setUser(u)
      setLoading(false)
      setProfileDisplayName(null)
      if (u) {
        void runEnsureUserProfile(u)
      } else {
        setIsAdmin(false)
        setUserProfileProvisionError(null)
        return
      }

      unsubscribeProfile = onSnapshot(
        doc(db, COLLECTIONS.users, u.uid),
        (snapshot) => {
          setIsAdmin(isUserProfileAdmin((snapshot.data() ?? null) as { admin?: unknown } | null))
          if (!snapshot.exists()) {
            setProfileDisplayName(null)
            return
          }
          const data = snapshot.data() as { displayName?: unknown } | undefined
          const raw = data?.displayName
          if (typeof raw === 'string') {
            const normalized = normalizeDisplayName(raw)
            setProfileDisplayName(normalized.length > 0 ? normalized : null)
          } else {
            setProfileDisplayName(null)
          }
        },
        () => {
          setIsAdmin(false)
          setProfileDisplayName(null)
        },
      )
    })
    return () => {
      if (unsubscribeProfile) {
        unsubscribeProfile()
      }
      unsubscribeAuth()
    }
  }, [runEnsureUserProfile])

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
      profileDisplayName,
      userProfileProvisionError,
      retryUserProfileProvision,
      signInWithEmail,
      signUpWithEmail,
      signOut,
    }),
    [
      user,
      loading,
      isAdmin,
      profileDisplayName,
      userProfileProvisionError,
      retryUserProfileProvision,
      signInWithEmail,
      signUpWithEmail,
      signOut,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
