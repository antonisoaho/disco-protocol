import { describe, expect, it } from 'vitest'
import { isCustomClaimsAdmin, isUserProfileAdmin } from './adminProfile'

describe('isUserProfileAdmin', () => {
  it('returns true only for explicit admin true', () => {
    expect(isUserProfileAdmin({ admin: true })).toBe(true)
    expect(isUserProfileAdmin({ admin: false })).toBe(false)
    expect(isUserProfileAdmin({ admin: 'true' })).toBe(false)
    expect(isUserProfileAdmin({})).toBe(false)
    expect(isUserProfileAdmin(null)).toBe(false)
  })
})

describe('isCustomClaimsAdmin', () => {
  it('returns true only for explicit admin true on claims', () => {
    expect(isCustomClaimsAdmin({ admin: true })).toBe(true)
    expect(isCustomClaimsAdmin({ admin: false })).toBe(false)
    expect(isCustomClaimsAdmin({ admin: 'true' })).toBe(false)
    expect(isCustomClaimsAdmin({})).toBe(false)
    expect(isCustomClaimsAdmin(null)).toBe(false)
    expect(isCustomClaimsAdmin(undefined)).toBe(false)
  })
})
