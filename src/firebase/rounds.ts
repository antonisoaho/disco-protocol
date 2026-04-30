import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  type FirestoreError,
  type QuerySnapshot,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from './firestore'
import type { RoundDoc, RoundVisibility } from './roundTypes'

const ROUNDS = 'rounds'

export type CreateRoundInput = {
  ownerId: string
  courseId: string
  templateId: string
  visibility?: RoundVisibility
  /** Initial participants; must include `ownerId`. */
  participantIds: string[]
}

/**
 * Creates a round document. Caller must ensure `participantIds` includes the owner.
 */
export async function createRound(input: CreateRoundInput): Promise<string> {
  const visibility = input.visibility ?? 'private'
  const ref = await addDoc(collection(db, ROUNDS), {
    ownerId: input.ownerId,
    participantIds: input.participantIds,
    courseId: input.courseId,
    templateId: input.templateId,
    visibility,
    startedAt: serverTimestamp(),
    completedAt: null,
    holeScores: {},
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

/**
 * Last-write-wins per hole inside a Firestore transaction (see `docs/scoring-concurrency-offline.md`).
 */
export async function recordHoleScoreTransaction(
  roundId: string,
  actorUid: string,
  holeNumber: number,
  strokes: number,
  par: number,
): Promise<void> {
  const key = String(holeNumber)
  const ref = doc(db, ROUNDS, roundId)

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists()) {
      throw new Error('Round not found')
    }
    const data = snap.data() as RoundDoc
    if (!data.participantIds.includes(actorUid)) {
      throw new Error('Not a participant of this round')
    }
    const nextHoleScores = {
      ...data.holeScores,
      [key]: {
        strokes,
        par,
        updatedAt: serverTimestamp(),
        updatedBy: actorUid,
      },
    }
    tx.update(ref, {
      holeScores: nextHoleScores,
      updatedAt: serverTimestamp(),
    })
  })
}

/** Owner adds another registered user; rules require `ownerId` for participant array changes. */
export async function addParticipantToRound(
  roundId: string,
  newParticipantUid: string,
): Promise<void> {
  const ref = doc(db, ROUNDS, roundId)
  await updateDoc(ref, {
    participantIds: arrayUnion(newParticipantUid),
    updatedAt: serverTimestamp(),
  })
}

export async function markRoundCompleted(roundId: string): Promise<void> {
  const ref = doc(db, ROUNDS, roundId)
  await updateDoc(ref, {
    completedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

export type RoundListItem = { id: string; data: RoundDoc }

/** Query shape for “my rounds”: any round where the user is in `participantIds`. */
export function myRoundsQuery(uid: string) {
  return query(
    collection(db, ROUNDS),
    where('participantIds', 'array-contains', uid),
    orderBy('startedAt', 'desc'),
    limit(50),
  )
}

export async function fetchMyRounds(uid: string): Promise<RoundListItem[]> {
  const q = myRoundsQuery(uid)
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, data: d.data() as RoundDoc }))
}

export function subscribeMyRounds(
  uid: string,
  onNext: (items: RoundListItem[]) => void,
  onError?: (e: FirestoreError) => void,
): Unsubscribe {
  return onSnapshot(
    myRoundsQuery(uid),
    (snap: QuerySnapshot) => {
      onNext(snap.docs.map((d) => ({ id: d.id, data: d.data() as RoundDoc })))
    },
    onError,
  )
}
