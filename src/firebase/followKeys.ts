function validateUid(uid: string, fieldName: string): string {
  const trimmed = uid.trim()
  if (trimmed.length === 0) {
    throw new Error(`${fieldName} is required.`)
  }
  return trimmed
}

export function assertFollowPair(params: { followerUid: string; followeeUid: string }) {
  const followerUid = validateUid(params.followerUid, 'followerUid')
  const followeeUid = validateUid(params.followeeUid, 'followeeUid')
  if (followerUid === followeeUid) {
    throw new Error('You cannot follow yourself.')
  }
  return { followerUid, followeeUid }
}

export function followDocId(followerUid: string, followeeUid: string): string {
  const { followerUid: follower, followeeUid: followee } = assertFollowPair({
    followerUid,
    followeeUid,
  })
  return `${follower}__${followee}`
}
