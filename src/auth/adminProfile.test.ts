import { describe, expect, it } from 'vitest'
import { isUserProfileAdmin } from './adminProfile'

describe('isUserProfileAdmin', () => {
  it('returns true only for explicit admin true', () => {
    expect(isUserProfileAdmin({ admin: true })).toBe(true)
    expect(isUserProfileAdmin({ admin: false })).toBe(false)
    expect(isUserProfileAdmin({ admin: 'true' })).toBe(false)
    expect(isUserProfileAdmin({})).toBe(false)
    expect(isUserProfileAdmin(null)).toBe(false)
  })
})
