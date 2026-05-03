import { createContext } from 'react'
import type { User } from 'firebase/auth'

export type AuthContextValue = {
  user: User | null
  loading: boolean
  /** From Firestore profile flag `users/{uid}.admin`; used for course ops UI hints. */
  isAdmin: boolean
  /** Normalized `users/{uid}.displayName` when the profile document exists. */
  profileDisplayName: string | null
  /** Set when creating the Firestore profile after sign-in fails after retries. */
  userProfileProvisionError: string | null
  /** Re-run profile provisioning (e.g. after going back online). */
  retryUserProfileProvision: () => Promise<void>
  signInWithEmail: (email: string, password: string) => Promise<void>
  signUpWithEmail: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
