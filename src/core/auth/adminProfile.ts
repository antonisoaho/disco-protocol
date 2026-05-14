type AdminProfileCandidate = {
  admin?: unknown
} | null

/**
 * Firestore profile flag `users/{uid}.admin` (must stay in sync with rules for non-claim admins).
 */
export function isUserProfileAdmin(profile: AdminProfileCandidate): boolean {
  return profile?.admin === true
}

/** Firebase Auth custom claim `admin: true` from `getIdTokenResult().claims`. */
export function isCustomClaimsAdmin(claims: Record<string, unknown> | null | undefined): boolean {
  return claims?.admin === true
}
