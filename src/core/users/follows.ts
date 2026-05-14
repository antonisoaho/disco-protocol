import {
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  type FirestoreError,
  type QuerySnapshot,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from '@core/firebase/firestore'
import { assertFollowPair, followDocId } from './followKeys'

const FOLLOWS = 'follows'
const MAX_FOLLOW_ROWS = 200

export type FollowEdgeDoc = {
  followerUid: string
  followeeUid: string
  createdAt: unknown
}

export type FollowEdge = {
  id: string
  followerUid: string
  followeeUid: string
}

function toFollowEdge(docId: string, data: Partial<FollowEdgeDoc>): FollowEdge | null {
  if (typeof data.followerUid !== 'string' || typeof data.followeeUid !== 'string') {
    return null
  }
  return {
    id: docId,
    followerUid: data.followerUid,
    followeeUid: data.followeeUid,
  }
}

export async function followUser(params: { followerUid: string; followeeUid: string }): Promise<void> {
  const { followerUid, followeeUid } = assertFollowPair(params)
  const id = followDocId(followerUid, followeeUid)
  await setDoc(doc(db, FOLLOWS, id), {
    followerUid,
    followeeUid,
    createdAt: serverTimestamp(),
  })
}

export async function unfollowUser(params: { followerUid: string; followeeUid: string }): Promise<void> {
  const id = followDocId(params.followerUid, params.followeeUid)
  await deleteDoc(doc(db, FOLLOWS, id))
}

export function subscribeFollowing(
  followerUid: string,
  onNext: (edges: FollowEdge[]) => void,
  onError?: (error: FirestoreError) => void,
): Unsubscribe {
  const follower = followerUid.trim()
  if (!follower) {
    throw new Error('followerUid is required.')
  }
  const q = query(
    collection(db, FOLLOWS),
    where('followerUid', '==', follower),
    limit(MAX_FOLLOW_ROWS),
  )
  return onSnapshot(
    q,
    (snap: QuerySnapshot) => {
      const edges = snap.docs
        .map((docSnap) => toFollowEdge(docSnap.id, docSnap.data() as Partial<FollowEdgeDoc>))
        .filter((edge): edge is FollowEdge => edge !== null)
      onNext(edges)
    },
    onError,
  )
}

export function subscribeFollowers(
  followeeUid: string,
  onNext: (edges: FollowEdge[]) => void,
  onError?: (error: FirestoreError) => void,
): Unsubscribe {
  const followee = followeeUid.trim()
  if (!followee) {
    throw new Error('followeeUid is required.')
  }
  const q = query(
    collection(db, FOLLOWS),
    where('followeeUid', '==', followee),
    limit(MAX_FOLLOW_ROWS),
  )
  return onSnapshot(
    q,
    (snap: QuerySnapshot) => {
      const edges = snap.docs
        .map((docSnap) => toFollowEdge(docSnap.id, docSnap.data() as Partial<FollowEdgeDoc>))
        .filter((edge): edge is FollowEdge => edge !== null)
      onNext(edges)
    },
    onError,
  )
}
