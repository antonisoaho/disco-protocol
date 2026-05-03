import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type FirestoreError,
  type QuerySnapshot,
  type Unsubscribe,
} from 'firebase/firestore'
import {
  SCORE_PROTOCOL_V1,
  normalizeHoleScoreUpdate,
} from '../scoring/protocol'
import {
  isAnonymousParticipantId,
  mergeAnonymousParticipants,
  normalizeAnonymousParticipantName,
} from '../scoring/participantRoster'
import { isUserProfileAdmin } from '../auth/adminProfile'
import { COLLECTIONS } from './paths'
import { db } from './firestore'
import {
  FreshRoundDraftValidationError,
  applyFreshHoleMetadataToDraft,
  buildFreshCoursePromotionPlan,
  resolveFreshRoundCourseRefs,
  type FreshHoleInput,
  type FreshRoundDraftIssue,
} from './freshRoundCourse'
import type {
  HoleScoreEntry,
  RoundAnonymousParticipant,
  ParticipantHoleScores,
  RoundCourseDraft,
  RoundDoc,
  RoundVisibility,
} from './roundTypes'

const ROUNDS = 'rounds'

type BaseCreateRoundInput = {
  ownerId: string
  holeCount?: number | null
  visibility?: RoundVisibility
  /** Initial participants; must include `ownerId`. */
  participantIds: string[]
  /** Optional display names for anonymous entries included in `participantIds`. */
  anonymousParticipants?: RoundAnonymousParticipant[]
}

type CreateSavedRoundInput = BaseCreateRoundInput & {
  courseSource?: 'saved'
  courseId: string
  templateId: string
}

type CreateFreshRoundInput = BaseCreateRoundInput & {
  courseSource: 'fresh'
  courseDraft: RoundCourseDraft
  courseId?: string
  templateId?: string
}

export type CreateRoundInput = CreateSavedRoundInput | CreateFreshRoundInput

function buildInitialParticipantHoleScores(participantIds: string[]): ParticipantHoleScores {
  const scores: ParticipantHoleScores = {}
  for (const participantId of participantIds) {
    if (!participantId || scores[participantId]) continue
    scores[participantId] = {}
  }
  return scores
}

function isRoundRosterManager(
  round: RoundDoc,
  actorUid: string,
  actorProfile: Record<string, unknown> | undefined,
): boolean {
  if (round.ownerId === actorUid) return true
  return isUserProfileAdmin(actorProfile ?? null)
}

function cloneParticipantHoleScores(
  participantHoleScores: RoundDoc['participantHoleScores'],
): Record<string, Record<string, unknown>> {
  const next: Record<string, Record<string, unknown>> = {}
  if (!participantHoleScores) return next
  for (const [participantId, holeMap] of Object.entries(participantHoleScores)) {
    next[participantId] = { ...holeMap }
  }
  return next
}

/**
 * Creates a round document. Caller must ensure `participantIds` includes the owner.
 */
export async function createRound(input: CreateRoundInput): Promise<string> {
  const visibility = input.visibility ?? 'private'
  const participantIds = Array.from(
    new Set(input.participantIds.map((participantId) => participantId.trim()).filter((participantId) => participantId.length > 0)),
  )
  const anonymousParticipants = mergeAnonymousParticipants(participantIds, input.anonymousParticipants)
  const roundRef = doc(collection(db, ROUNDS))
  const isFreshRound = input.courseSource === 'fresh'
  const refs = isFreshRound
    ? resolveFreshRoundCourseRefs(roundRef.id, input.courseDraft.name, {
        courseId: input.courseId,
        templateId: input.templateId,
      })
    : {
        courseId: input.courseId,
        templateId: input.templateId,
      }

  await setDoc(roundRef, {
    ownerId: input.ownerId,
    participantIds,
    anonymousParticipants,
    courseId: refs.courseId,
    templateId: refs.templateId,
    courseSource: isFreshRound ? 'fresh' : 'saved',
    courseDraft: isFreshRound ? input.courseDraft : null,
    coursePromotion: {
      status: 'none',
      targetCourseId: isFreshRound ? refs.courseId : null,
      targetTemplateId: isFreshRound ? refs.templateId : null,
      promotedAt: null,
      errorCode: null,
    },
    scoreProtocolVersion: SCORE_PROTOCOL_V1,
    holeCount: input.holeCount ?? null,
    visibility,
    startedAt: serverTimestamp(),
    completedAt: null,
    holeScores: {},
    participantHoleScores: buildInitialParticipantHoleScores(participantIds),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return roundRef.id
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
    const normalized = normalizeHoleScoreUpdate(
      { holeNumber, strokes, par },
      { holeCount: data.holeCount ?? null },
    )
    const scoreEntry = {
      strokes: normalized.strokes,
      par: normalized.par,
      updatedAt: serverTimestamp(),
      updatedBy: actorUid,
    }
    const nextHoleScores = {
      ...data.holeScores,
      [normalized.holeKey]: scoreEntry,
    }
    const nextParticipantHoleScores = cloneParticipantHoleScores(data.participantHoleScores)
    nextParticipantHoleScores[actorUid] = {
      ...(nextParticipantHoleScores[actorUid] ?? {}),
      [normalized.holeKey]: scoreEntry,
    }
    tx.update(ref, {
      holeScores: nextHoleScores,
      participantHoleScores: nextParticipantHoleScores,
      updatedAt: serverTimestamp(),
    })
  })
}

export async function recordParticipantHoleScoreTransaction(
  roundId: string,
  actorUid: string,
  participantUid: string,
  holeNumber: number,
  strokes: number,
  par: number,
): Promise<void> {
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
    if (!data.participantIds.includes(participantUid)) {
      throw new Error('Target participant is not in this round')
    }
    if (actorUid !== participantUid && actorUid !== data.ownerId) {
      const actorProfileSnap = await tx.get(doc(db, COLLECTIONS.users, actorUid))
      const actorIsAdmin = isUserProfileAdmin(actorProfileSnap.data() ?? null)
      if (!actorIsAdmin) {
        throw new Error('Only owner can edit another participant score')
      }
    }
    const normalized = normalizeHoleScoreUpdate(
      { holeNumber, strokes, par },
      { holeCount: data.holeCount ?? null },
    )
    const scoreEntry = {
      strokes: normalized.strokes,
      par: normalized.par,
      updatedAt: serverTimestamp(),
      updatedBy: actorUid,
    }
    const nextParticipantHoleScores = cloneParticipantHoleScores(data.participantHoleScores)
    nextParticipantHoleScores[participantUid] = {
      ...(nextParticipantHoleScores[participantUid] ?? {}),
      [normalized.holeKey]: scoreEntry,
    }

    tx.update(ref, {
      participantHoleScores: nextParticipantHoleScores,
      updatedAt: serverTimestamp(),
    })
  })
}

export async function updateFreshRoundHoleMetadata(params: {
  roundId: string
  actorUid: string
  holeNumber: number
  metadata: FreshHoleInput
}): Promise<void> {
  const ref = doc(db, ROUNDS, params.roundId)

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists()) {
      throw new Error('Round not found')
    }
    const data = snap.data() as RoundDoc
    if (!data.participantIds.includes(params.actorUid)) {
      throw new Error('Not a participant of this round')
    }
    if (data.courseSource !== 'fresh' || !data.courseDraft) {
      throw new Error('Round does not support fresh hole metadata edits')
    }

    const nextDraft = applyFreshHoleMetadataToDraft({
      draft: data.courseDraft,
      holeNumber: params.holeNumber,
      par: params.metadata.par ?? null,
      lengthMeters: params.metadata.lengthMeters ?? null,
    })

    tx.update(ref, {
      courseDraft: nextDraft,
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

export async function addAnonymousParticipantToRound(params: {
  roundId: string
  actorUid: string
  participant: RoundAnonymousParticipant
}): Promise<void> {
  const participantId = params.participant.id.trim()
  const displayName = normalizeAnonymousParticipantName(params.participant.displayName)
  if (!isAnonymousParticipantId(participantId)) {
    throw new Error('Anonymous participant id must start with anon:.')
  }
  if (displayName.length === 0) {
    throw new Error('Anonymous participant name is required.')
  }

  const ref = doc(db, ROUNDS, params.roundId)
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists()) {
      throw new Error('Round not found')
    }
    const data = snap.data() as RoundDoc
    const profileSnap = await tx.get(doc(db, COLLECTIONS.users, params.actorUid))
    if (!isRoundRosterManager(data, params.actorUid, profileSnap.data() as Record<string, unknown> | undefined)) {
      throw new Error('Not permitted to manage this round roster.')
    }

    const nextParticipantIds = Array.from(new Set([...data.participantIds, participantId]))
    const nextAnonymousParticipants = mergeAnonymousParticipants(nextParticipantIds, [
      ...(data.anonymousParticipants ?? []),
      { id: participantId, displayName },
    ])
    const nextParticipantHoleScores = cloneParticipantHoleScores(data.participantHoleScores)
    nextParticipantHoleScores[participantId] = nextParticipantHoleScores[participantId] ?? {}

    tx.update(ref, {
      participantIds: nextParticipantIds,
      anonymousParticipants: nextAnonymousParticipants,
      participantHoleScores: nextParticipantHoleScores,
      updatedAt: serverTimestamp(),
    })
  })
}

export async function removeParticipantFromRound(params: {
  roundId: string
  actorUid: string
  participantId: string
}): Promise<void> {
  const ref = doc(db, ROUNDS, params.roundId)
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists()) {
      throw new Error('Round not found')
    }
    const data = snap.data() as RoundDoc
    if (params.participantId === data.ownerId) {
      throw new Error('Cannot remove the round owner from the participant list.')
    }
    if (!data.participantIds.includes(params.participantId)) {
      throw new Error('Target participant is not in this round')
    }
    const profileSnap = await tx.get(doc(db, COLLECTIONS.users, params.actorUid))
    if (!isRoundRosterManager(data, params.actorUid, profileSnap.data() as Record<string, unknown> | undefined)) {
      throw new Error('Not permitted to manage this round roster.')
    }

    const nextParticipantIds = data.participantIds.filter((id) => id !== params.participantId)
    const nextAnonymousParticipants = mergeAnonymousParticipants(
      nextParticipantIds,
      (data.anonymousParticipants ?? []).filter((entry) => entry.id !== params.participantId),
    )
    const nextParticipantHoleScores = cloneParticipantHoleScores(data.participantHoleScores)
    delete nextParticipantHoleScores[params.participantId]

    tx.update(ref, {
      participantIds: nextParticipantIds,
      anonymousParticipants: nextAnonymousParticipants,
      participantHoleScores: nextParticipantHoleScores,
      updatedAt: serverTimestamp(),
    })
  })
}

/**
 * Updates `par` for one hole across all participants who already have a score cell
 * (saved-layout rounds). Round owner or admin only.
 */
export async function syncSavedRoundHoleParForHole(params: {
  roundId: string
  actorUid: string
  holeNumber: number
  par: number
}): Promise<void> {
  const ref = doc(db, ROUNDS, params.roundId)

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists()) {
      throw new Error('Round not found')
    }
    const data = snap.data() as RoundDoc
    if ((data.courseSource ?? 'saved') !== 'saved') {
      throw new Error('Par sync applies only to saved-layout rounds.')
    }
    const profileSnap = await tx.get(doc(db, COLLECTIONS.users, params.actorUid))
    const actorIsAdmin = isUserProfileAdmin(profileSnap.data() ?? null)
    if (data.ownerId !== params.actorUid && !actorIsAdmin) {
      throw new Error('Only round owner or admin can adjust layout par on a saved course round.')
    }
    const normalized = normalizeHoleScoreUpdate(
      { holeNumber: params.holeNumber, strokes: 3, par: params.par },
      { holeCount: data.holeCount ?? null },
    )
    const nextParticipantHoleScores = cloneParticipantHoleScores(data.participantHoleScores)
    let changed = false
    for (const participantId of data.participantIds) {
      const cell = nextParticipantHoleScores[participantId]?.[normalized.holeKey] as HoleScoreEntry | undefined
      if (!cell || cell.par === normalized.par) continue
      nextParticipantHoleScores[participantId] = {
        ...(nextParticipantHoleScores[participantId] ?? {}),
        [normalized.holeKey]: {
          ...cell,
          par: normalized.par,
          updatedAt: serverTimestamp(),
          updatedBy: params.actorUid,
        },
      }
      changed = true
    }
    if (!changed) {
      return
    }
    tx.update(ref, {
      participantHoleScores: nextParticipantHoleScores,
      updatedAt: serverTimestamp(),
    })
  })
}

export async function deleteRound(roundId: string): Promise<void> {
  const ref = doc(db, ROUNDS, roundId)
  await deleteDoc(ref)
}

export type CompleteRoundResult = {
  promotionStatus: 'not_needed' | 'created' | 'already_created' | 'pending' | 'failed'
  validationIssues?: FreshRoundDraftIssue[]
}

export async function completeRoundAndPromote(
  roundId: string,
  actorUid: string,
): Promise<CompleteRoundResult> {
  const ref = doc(db, ROUNDS, roundId)
  const initialSnap = await getDoc(ref)
  if (!initialSnap.exists()) {
    throw new Error('Round not found')
  }
  const initialData = initialSnap.data() as RoundDoc
  if (!initialData.participantIds.includes(actorUid)) {
    throw new Error('Not a participant of this round')
  }

  try {
    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref)
      if (!snap.exists()) {
        throw new Error('Round not found')
      }
      const data = snap.data() as RoundDoc
      if (!data.participantIds.includes(actorUid)) {
        throw new Error('Not a participant of this round')
      }

      if (data.courseSource !== 'fresh') {
        tx.update(ref, {
          completedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
        return { promotionStatus: 'not_needed' as const }
      }

      if (!data.courseDraft || data.courseDraft.holes.length === 0) {
        const issues: FreshRoundDraftIssue[] = [
          {
            code: 'invalid_hole_count',
            path: 'holes',
            message: 'Set a hole count and fill missing hole metadata before completing this round.',
          },
        ]
        tx.update(ref, {
          updatedAt: serverTimestamp(),
          coursePromotion: {
            status: 'failed',
            targetCourseId: data.coursePromotion?.targetCourseId ?? data.courseId,
            targetTemplateId: data.coursePromotion?.targetTemplateId ?? data.templateId,
            promotedAt: null,
            errorCode: 'incomplete_draft',
          },
        })
        return { promotionStatus: 'failed' as const, validationIssues: issues }
      }

      let plan
      try {
        plan = buildFreshCoursePromotionPlan({
          roundId,
          ownerId: data.ownerId,
          draft: data.courseDraft,
          existingRefs: {
            courseId: data.coursePromotion?.targetCourseId ?? data.courseId,
            templateId: data.coursePromotion?.targetTemplateId ?? data.templateId,
          },
        })
      } catch (error) {
        if (error instanceof FreshRoundDraftValidationError) {
          tx.update(ref, {
            updatedAt: serverTimestamp(),
            coursePromotion: {
              status: 'failed',
              targetCourseId: data.coursePromotion?.targetCourseId ?? data.courseId,
              targetTemplateId: data.coursePromotion?.targetTemplateId ?? data.templateId,
              promotedAt: null,
              errorCode: 'incomplete_holes',
            },
          })
          return { promotionStatus: 'failed' as const, validationIssues: error.issues }
        }
        throw error
      }

      const courseRef = doc(db, COLLECTIONS.courses, plan.courseId)
      const templateRef = doc(
        db,
        COLLECTIONS.courses,
        plan.courseId,
        COLLECTIONS.templates,
        plan.templateId,
      )
      const courseSnap = await tx.get(courseRef)
      const templateSnap = await tx.get(templateRef)
      const alreadyCreated = courseSnap.exists() && templateSnap.exists()

      if (!courseSnap.exists()) {
        tx.set(courseRef, {
          ...plan.course,
          createdAt: serverTimestamp(),
        })
      }
      if (!templateSnap.exists()) {
        tx.set(templateRef, {
          ...plan.template,
          createdAt: serverTimestamp(),
        })
      }

      tx.update(ref, {
        completedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        coursePromotion: {
          status: 'created',
          targetCourseId: plan.courseId,
          targetTemplateId: plan.templateId,
          promotedAt: serverTimestamp(),
          errorCode: null,
        },
      })

      return { promotionStatus: alreadyCreated ? ('already_created' as const) : ('created' as const) }
    })
  } catch (error) {
    const firestoreError = error as FirestoreError
    if (
      initialData.courseSource === 'fresh' &&
      (firestoreError.code === 'unavailable' || firestoreError.code === 'deadline-exceeded')
    ) {
      await updateDoc(ref, {
        completedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        coursePromotion: {
          status: 'pending',
          targetCourseId: initialData.coursePromotion?.targetCourseId ?? initialData.courseId,
          targetTemplateId: initialData.coursePromotion?.targetTemplateId ?? initialData.templateId,
          promotedAt: initialData.coursePromotion?.promotedAt ?? null,
          errorCode: 'offline_pending',
        },
      })
      return { promotionStatus: 'pending' }
    }
    throw error
  }
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
