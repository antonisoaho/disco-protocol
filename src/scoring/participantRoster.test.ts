import { describe, expect, it } from 'vitest'
import {
  deriveFriendUidSet,
  filterParticipantDirectoryEntries,
  mergeAnonymousParticipants,
  type AnonymousParticipant,
} from './participantRoster'

describe('deriveFriendUidSet', () => {
  it('keeps only mutual follows as friends', () => {
    expect(deriveFriendUidSet(['u-1', 'u-2', 'u-3'], ['u-2', 'u-4', 'u-3'])).toEqual(
      new Set(['u-2', 'u-3']),
    )
  })
})

describe('filterParticipantDirectoryEntries', () => {
  const entries = [
    { uid: 'u-1', displayName: 'Ada', subtitle: 'u-1' },
    { uid: 'u-2', displayName: 'Byron', subtitle: 'u-2' },
    { uid: 'u-3', displayName: 'Casey', subtitle: 'u-3' },
  ]

  it('returns only friends when query is empty', () => {
    const filtered = filterParticipantDirectoryEntries({
      entries,
      query: '',
      friendUidSet: new Set(['u-2']),
    })
    expect(filtered.map((entry) => entry.uid)).toEqual(['u-2'])
  })

  it('expands to global search when query is non-empty', () => {
    const filtered = filterParticipantDirectoryEntries({
      entries,
      query: 'ca',
      friendUidSet: new Set(['u-2']),
    })
    expect(filtered.map((entry) => entry.uid)).toEqual(['u-3'])
  })
})

describe('mergeAnonymousParticipants', () => {
  it('keeps only participant-linked anonymous players in participant order', () => {
    const anonymous: AnonymousParticipant[] = [
      { id: 'anon:a', displayName: 'Guest A' },
      { id: 'anon:b', displayName: 'Guest B' },
      { id: 'anon:b', displayName: 'Guest B duplicate' },
      { id: 'anon:c', displayName: '   ' },
      { id: 'registered-id', displayName: 'Should be ignored' },
    ]

    expect(mergeAnonymousParticipants(['u-owner', 'anon:b', 'anon:a'], anonymous)).toEqual([
      { id: 'anon:b', displayName: 'Guest B' },
      { id: 'anon:a', displayName: 'Guest A' },
    ])
  })
})
