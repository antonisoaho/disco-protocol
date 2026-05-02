type AdminProfileCandidate = {
  admin?: unknown
} | null

/**
 * Uses `users/{uid}.admin` as the source of truth for admin UI gating.
 */
export function isUserProfileAdmin(profile: AdminProfileCandidate): boolean {
  return profile?.admin === true
}
