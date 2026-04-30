import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth'
import { auth } from '../firebase/auth'
import { ensureUserProfile } from '../firebase/userProfile'
import { AuthContext } from './auth-context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      try {
        if (u) await ensureUserProfile(u)
      } catch (err) {
        console.error('ensureUserProfile failed', err)
      } finally {
        setUser(u)
        setLoading(false)
      }
      if (!u) {
        setIsAdmin(false)
        return
      }
      try {
        const r = await u.getIdTokenResult()
        setIsAdmin(r.claims.admin === true)
      } catch {
        setIsAdmin(false)
      }
    })
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
