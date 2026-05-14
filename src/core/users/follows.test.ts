import { describe, expect, it } from 'vitest'
import { assertFollowPair, followDocId } from './followKeys'

describe('followDocId', () => {
  it('builds a deterministic edge id from follower and followee', () => {
    expect(followDocId('alice', 'bob')).toBe('alice__bob')
  })

  it('rejects blank identifiers', () => {
    expect(() => followDocId('', 'bob')).toThrow('followerUid is required.')
    expect(() => followDocId('alice', '   ')).toThrow('followeeUid is required.')
  })
})

describe('assertFollowPair', () => {
  it('blocks self-follow attempts', () => {
    expect(() => assertFollowPair({ followerUid: 'alice', followeeUid: 'alice' })).toThrow(
      'You cannot follow yourself.',
    )
  })
})
