import { describe, expect, it } from 'vitest'
import { directoryDisplayName, filterDiscoverableUsers } from './followSearch'

describe('directoryDisplayName', () => {
  it('falls back to uid when display name is blank', () => {
    expect(directoryDisplayName({ uid: 'uid-a', displayName: '   ' })).toBe('uid-a')
  })
})

describe('filterDiscoverableUsers', () => {
  const entries = [
    { uid: 'alice-001', displayName: 'Alice', subtitle: 'alice-001' },
    { uid: 'bob-xyz', displayName: 'Bob Builder', subtitle: 'bob-xyz' },
    { uid: 'carol-777', displayName: 'Carol', subtitle: 'carol-777' },
  ]

  it('excludes the signed-in user from discovery', () => {
    const result = filterDiscoverableUsers(entries, 'bob-xyz', '')
    expect(result.map((entry) => entry.uid)).toEqual(['alice-001', 'carol-777'])
  })

  it('matches query by display name substring case-insensitively', () => {
    const result = filterDiscoverableUsers(entries, 'nobody', 'builder')
    expect(result.map((entry) => entry.uid)).toEqual(['bob-xyz'])
  })

  it('matches query by uid substring case-insensitively', () => {
    const result = filterDiscoverableUsers(entries, 'nobody', '777')
    expect(result.map((entry) => entry.uid)).toEqual(['carol-777'])
  })
})
