import { type User } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/useAuth'
import type { CourseTemplateDoc } from '../firebase/models/course'
import { db } from '../firebase/firestore'
import { COLLECTIONS } from '../firebase/paths'
import { translateUserError } from '../i18n/translateError'
import { computeHeadToHeadSummary, computeParticipantParSummary } from '../analytics/roundAnalytics'
import {
  FreshRoundDraftValidationError,
  normalizeFreshCourseDraftForPromotion,
} from '../firebase/freshRoundCourse'
import {
  addAnonymousParticipantToRound,
  addParticipantToRound,
  completeRoundAndPromote,
  deleteRound,
  recordParticipantHoleScoreTransaction,
  removeParticipantFromRound,
  replaceRoundParticipant,
  subscribeMyRounds,
  syncSavedRoundHoleParForHole,
  updateFreshRoundHoleMetadata,
} from '../firebase/rounds'
import type { RoundDoc } from '../firebase/roundTypes'
import { subscribeFollowers, subscribeFollowing } from '../firebase/follows'
import { subscribeUserDirectory, type UserDirectoryEntry } from '../firebase/userDirectory'
import { scoreTierToNotationClassName, strokesParDeltaToNotation } from '../lib/scoreSemantic'
import { FollowPanel } from '../social/FollowPanel'
import { formatDraftIssues } from './formatDraftIssues'
import {
  buildAnonymousParticipantNameMap,
  createAnonymousParticipantId,
  deriveFriendUidSet,
  filterParticipantDirectoryEntries,
  isAnonymousParticipantId,
  mergeAnonymousParticipants,
  normalizeAnonymousParticipantName,
} from './participantRoster'
import { HoleForm } from './HoleForm'
import { HoleStepper } from './HoleStepper'
import { mergeAutosavePayload, type HoleDraftInputs, clampHoleNumber, stepHoleNumber } from './holeAutosave'
import { PlayerScoreRows } from './PlayerScoreRows'
import { ScorecardSummaryGrid } from './ScorecardSummaryGrid'
import { aggregateScoreProtocol, normalizeScoreProtocol } from './protocol'
import { inferRoundHoleCount } from './inferRoundHoleCount'
import { computeGrandTotals, computeParticipantTotals } from './scorecardTable'
import { resolveHonorThrowerUid } from './resolveHonorThrowerUid'

type Props = {
  user: User
  roundId: string
  onAfterRoundDeleted?: () => void
}

const AUTOSAVE_DEBOUNCE_MS = 550
const ANONYMOUS_NAME_MAX_LENGTH = 80
const NON_WHITESPACE_PATTERN = '.*\\S.*'

type AppTabId = 'scorecard' | 'participants' | 'analytics' | 'follow'
type SaveState = 'saved' | 'dirty' | 'saving' | 'error'

function formatDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : `${delta}`
}

function parseIntegerInput(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null
  return Number(value)
}

function participantDisplayName(entry: UserDirectoryEntry): string {
  return entry.displayName.trim().length > 0 ? entry.displayName : entry.uid
}

function readParticipantHoleScores(data: RoundDoc, fallbackUid: string) {
  const next: Record<string, Record<string, { strokes: number; par: number }>> = {}
  const participantIdSet = new Set(data.participantIds)

  for (const participantId of data.participantIds) {
    next[participantId] = {}
  }

  if (data.participantHoleScores && Object.keys(data.participantHoleScores).length > 0) {
    for (const [participantId, holeMap] of Object.entries(data.participantHoleScores)) {
      next[participantId] = next[participantId] ?? {}
      for (const [holeKey, score] of Object.entries(holeMap)) {
        next[participantId][holeKey] = {
          strokes: score.strokes,
          par: score.par,
        }
      }
    }
    return next
  }

  for (const [holeKey, score] of Object.entries(data.holeScores ?? {})) {
    const owner =
      typeof score.updatedBy === 'string' && participantIdSet.has(score.updatedBy)
        ? score.updatedBy
        : fallbackUid
    next[owner] = next[owner] ?? {}
    next[owner][holeKey] = {
      strokes: score.strokes,
      par: score.par,
    }
  }

  return next
}

export function ScoringPanel({ user, roundId, onAfterRoundDeleted }: Props) {
  const { t } = useTranslation('common')
  const { isAdmin } = useAuth()
  const uid = user.uid
  const [activeTab, setActiveTab] = useState<AppTabId>('scorecard')
  const [listSnapshotSeen, setListSnapshotSeen] = useState(false)
  const [items, setItems] = useState<{ id: string; data: RoundDoc }[]>([])
  const [inviteAnonymousNameError, setInviteAnonymousNameError] = useState<string | null>(null)
  const [inviteParticipantQuery, setInviteParticipantQuery] = useState('')
  const [inviteAnonymousName, setInviteAnonymousName] = useState('')
  const [inviteSelections, setInviteSelections] = useState<string[]>([])
  const [rosterReplaceFromId, setRosterReplaceFromId] = useState<string | null>(null)
  const [rosterReplaceQuery, setRosterReplaceQuery] = useState('')
  const [rosterReplaceTargetUid, setRosterReplaceTargetUid] = useState<string | null>(null)
  const [analyticsOpponentUid, setAnalyticsOpponentUid] = useState('')
  const [directoryEntries, setDirectoryEntries] = useState<UserDirectoryEntry[]>([])
  const [followingIds, setFollowingIds] = useState<string[]>([])
  const [followerIds, setFollowerIds] = useState<string[]>([])
  const [holeNumber, setHoleNumber] = useState(1)
  const [holeDraft, setHoleDraft] = useState<HoleDraftInputs | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const autosaveTimerRef = useRef<number | null>(null)
  const inviteAnonymousNameInputRef = useRef<HTMLInputElement | null>(null)

  const resolveAnonymousNameError = useCallback(
    (input: HTMLInputElement): string => {
      if (input.validity.valueMissing || input.validity.patternMismatch) {
        return t('scoring.messages.anonymousNameRequired')
      }
      if (input.validity.tooLong) {
        return t('scoring.messages.anonymousNameTooLong', {
          max: ANONYMOUS_NAME_MAX_LENGTH,
        })
      }
      return input.validationMessage || t('scoring.messages.anonymousNameRequired')
    },
    [t],
  )

  useEffect(() => {
    const unsub = subscribeMyRounds(
      uid,
      (next) => {
        setError(null)
        setItems(next)
        setListSnapshotSeen(true)
      },
      (nextError) => setError(translateUserError(t, nextError.message)),
    )
    return () => unsub()
  }, [t, uid])

  useEffect(() => {
    const unsub = subscribeUserDirectory(
      (entries) => setDirectoryEntries(entries),
      () => {
        // Directory listing can be hidden by rules; owner-only fallback still works.
      },
    )
    return () => unsub()
  }, [])

  useEffect(() => {
    const unsub = subscribeFollowing(
      uid,
      (edges) => {
        setFollowingIds(Array.from(new Set(edges.map((edge) => edge.followeeUid))))
      },
      () => {
        // Friends fallback becomes empty if follows read is unavailable.
      },
    )
    return () => unsub()
  }, [uid])

  useEffect(() => {
    const unsub = subscribeFollowers(
      uid,
      (edges) => {
        setFollowerIds(Array.from(new Set(edges.map((edge) => edge.followerUid))))
      },
      () => {
        // Friends fallback becomes empty if follows read is unavailable.
      },
    )
    return () => unsub()
  }, [uid])

  const selected = useMemo(() => items.find((round) => round.id === roundId) ?? null, [items, roundId])

  const roundMissingAfterSync = listSnapshotSeen && !items.some((row) => row.id === roundId)

  const canManageRoundRoster = useMemo(() => {
    if (!selected) return false
    return selected.data.ownerId === uid || isAdmin
  }, [isAdmin, selected, uid])

  const canAdjustSavedCourseMetadata = useMemo(() => {
    if (!selected || selected.data.courseSource !== 'saved') return false
    return selected.data.ownerId === uid || isAdmin
  }, [isAdmin, selected, uid])

  const savedCourseMetadataLocked = useMemo(() => {
    if (!selected || selected.data.courseSource !== 'saved') return false
    return !canAdjustSavedCourseMetadata
  }, [canAdjustSavedCourseMetadata, selected])

  const [layoutTemplateDoc, setLayoutTemplateDoc] = useState<CourseTemplateDoc | null>(null)

  useEffect(() => {
    if (!selected || selected.data.courseSource !== 'saved') {
      queueMicrotask(() => setLayoutTemplateDoc(null))
      return
    }
    const { courseId, templateId } = selected.data
    const cref = doc(db, COLLECTIONS.courses, courseId, COLLECTIONS.templates, templateId)
    return onSnapshot(cref, (snap) => {
      queueMicrotask(() => {
        setLayoutTemplateDoc(snap.exists() ? (snap.data() as CourseTemplateDoc) : null)
      })
    })
    // Intentionally depend on layout ids only so we do not re-subscribe on every live round score update.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selected is read only for the branch above; deps track layout identity.
  }, [selected?.data.courseId, selected?.data.courseSource, selected?.data.templateId, selected?.id])

  const selectedHoleCount = useMemo(
    () => (selected ? inferRoundHoleCount(selected.data) : null),
    [selected],
  )
  const activeHoleNumber = selectedHoleCount ? clampHoleNumber(holeNumber, selectedHoleCount) : 1

  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current !== null) {
        window.clearTimeout(autosaveTimerRef.current)
      }
    }
  }, [])

  const directoryByUid = useMemo(() => {
    const map: Record<string, UserDirectoryEntry> = {}
    for (const entry of directoryEntries) {
      map[entry.uid] = entry
    }
    if (!map[uid]) {
      map[uid] = {
        uid,
        displayName: user.displayName?.trim() || user.email?.split('@')[0] || t('social.youFallback'),
        subtitle: uid,
      }
    }
    return map
  }, [directoryEntries, t, uid, user.displayName, user.email])

  const allDirectoryEntries = useMemo(
    () =>
      Object.values(directoryByUid).sort((a, b) =>
        participantDisplayName(a).localeCompare(participantDisplayName(b), undefined, {
          sensitivity: 'base',
        }),
      ),
    [directoryByUid],
  )

  const friendUidSet = useMemo(() => deriveFriendUidSet(followingIds, followerIds), [followerIds, followingIds])

  const searchableDirectoryEntries = useMemo(
    () => allDirectoryEntries.filter((entry) => entry.uid !== uid),
    [allDirectoryEntries, uid],
  )

  const inviteCandidateEntries = useMemo(() => {
    if (!selected) return []
    const filtered = filterParticipantDirectoryEntries({
      entries: searchableDirectoryEntries,
      query: inviteParticipantQuery,
      friendUidSet,
    })
    return filtered.filter((entry) => !selected.data.participantIds.includes(entry.uid))
  }, [friendUidSet, inviteParticipantQuery, searchableDirectoryEntries, selected])

  const rosterReplaceCandidateEntries = useMemo(() => {
    if (!selected || !rosterReplaceFromId) return []
    const filtered = filterParticipantDirectoryEntries({
      entries: searchableDirectoryEntries,
      query: rosterReplaceQuery,
      friendUidSet,
    })
    return filtered.filter((entry) => !selected.data.participantIds.includes(entry.uid))
  }, [friendUidSet, rosterReplaceFromId, rosterReplaceQuery, searchableDirectoryEntries, selected])

  const clearRosterReplaceFlow = useCallback(() => {
    setRosterReplaceFromId(null)
    setRosterReplaceQuery('')
    setRosterReplaceTargetUid(null)
  }, [])

  const roundDocs = useMemo(() => items.map((item) => item.data), [items])

  const participantParSummary = useMemo(
    () => computeParticipantParSummary(roundDocs, uid),
    [roundDocs, uid],
  )

  const participantParNotation = useMemo(() => {
    if (participantParSummary.scoredHoles === 0 || participantParSummary.totalPar <= 0) {
      return null
    }
    return strokesParDeltaToNotation(participantParSummary.totalStrokes, participantParSummary.totalPar)
  }, [participantParSummary])

  const anonymousDisplayNameById = useMemo(() => {
    const map: Record<string, string> = {}
    for (const round of roundDocs) {
      const merged = mergeAnonymousParticipants(round.participantIds, round.anonymousParticipants)
      for (const anonymous of merged) {
        if (!map[anonymous.id]) {
          map[anonymous.id] = anonymous.displayName
        }
      }
    }
    return map
  }, [roundDocs])

  const analyticsOpponentOptions = useMemo(() => {
    const opponentIds = new Set<string>()
    for (const round of roundDocs) {
      if (round.completedAt === null) continue
      for (const participantId of round.participantIds) {
        if (participantId !== uid) {
          opponentIds.add(participantId)
        }
      }
    }
    return Array.from(opponentIds).sort((a, b) => {
      const aName =
        anonymousDisplayNameById[a] ??
        participantDisplayName(
          directoryByUid[a] ?? {
            uid: a,
            displayName: a,
            subtitle: a,
          },
        )
      const bName =
        anonymousDisplayNameById[b] ??
        participantDisplayName(
          directoryByUid[b] ?? {
            uid: b,
            displayName: b,
            subtitle: b,
          },
        )
      return aName.localeCompare(bName, undefined, { sensitivity: 'base' })
    })
  }, [anonymousDisplayNameById, directoryByUid, roundDocs, uid])

  const selectedAnalyticsOpponentUid = analyticsOpponentOptions.includes(analyticsOpponentUid)
    ? analyticsOpponentUid
    : (analyticsOpponentOptions[0] ?? '')

  const headToHeadSummary = useMemo(() => {
    if (!selectedAnalyticsOpponentUid) {
      return null
    }
    return computeHeadToHeadSummary(roundDocs, uid, selectedAnalyticsOpponentUid)
  }, [roundDocs, selectedAnalyticsOpponentUid, uid])

  const selectedParticipantScores = useMemo(
    () => (selected ? readParticipantHoleScores(selected.data, uid) : null),
    [selected, uid],
  )

  const selectedAnonymousNameMap = useMemo(
    () => buildAnonymousParticipantNameMap(selected?.data.anonymousParticipants ?? []),
    [selected],
  )

  const selectedParticipantNames = useMemo(() => {
    if (!selected) return {}
    const names: Record<string, string> = {}
    for (const participantId of selected.data.participantIds) {
      const anonymousDisplayName = selectedAnonymousNameMap[participantId]
      if (anonymousDisplayName) {
        names[participantId] = anonymousDisplayName
        continue
      }
      names[participantId] = participantDisplayName(
        directoryByUid[participantId] ?? {
          uid: participantId,
          displayName: participantId,
          subtitle: participantId,
        },
      )
    }
    return names
  }, [directoryByUid, selected, selectedAnonymousNameMap])

  const currentUserHoleScores = useMemo(() => {
    if (!selected || !selectedParticipantScores) return {}
    return selectedParticipantScores[uid] ?? {}
  }, [selected, selectedParticipantScores, uid])

  const selectedSummary = useMemo(() => {
    if (!selected) return null
    try {
      const protocol = normalizeScoreProtocol({
        version: selected.data.scoreProtocolVersion,
        holeCount: inferRoundHoleCount(selected.data),
        holeScores: currentUserHoleScores,
      })
      return aggregateScoreProtocol(protocol)
    } catch {
      return null
    }
  }, [currentUserHoleScores, selected])

  const selectedParticipantTotals = useMemo(() => {
    if (!selected || !selectedParticipantScores) return {}
    return computeParticipantTotals(selected.data.participantIds, selectedParticipantScores)
  }, [selected, selectedParticipantScores])

  const honorHint = useMemo(() => {
    if (!selected || !selectedParticipantScores) return null
    const honorUid = resolveHonorThrowerUid(
      selected.data.participantIds,
      selectedParticipantScores,
      activeHoleNumber,
    )
    if (!honorUid) return null
    const name = selectedParticipantNames[honorUid] ?? honorUid
    return t('scoring.stepper.honorThrowFirst', { names: name })
  }, [activeHoleNumber, selected, selectedParticipantNames, selectedParticipantScores, t])

  const selectedGrandTotals = useMemo(
    () => computeGrandTotals(selectedParticipantTotals),
    [selectedParticipantTotals],
  )

  const selectedFreshHoleByNumber = useMemo(() => {
    const map: Record<number, { number: number; par?: number | null; lengthMeters?: number | null }> = {}
    if (!selected || selected.data.courseSource !== 'fresh') {
      return map
    }
    for (const hole of selected.data.courseDraft?.holes ?? []) {
      map[hole.number] = hole
    }
    return map
  }, [selected])

  const selectedSavedParByHole = useMemo(() => {
    const map: Record<number, number> = {}
    if (!selected || selected.data.courseSource !== 'saved' || !selectedParticipantScores) {
      return map
    }
    for (const participantId of selected.data.participantIds) {
      const holeMap = selectedParticipantScores[participantId] ?? {}
      for (const [holeKey, score] of Object.entries(holeMap)) {
        const parsedHole = Number(holeKey)
        if (!Number.isInteger(parsedHole) || parsedHole < 1) continue
        if (typeof map[parsedHole] === 'number') continue
        map[parsedHole] = score.par
      }
    }
    return map
  }, [selected, selectedParticipantScores])

  const persistedHoleState = useMemo(() => {
    if (!selected || !selectedParticipantScores) return null
    const holeKey = String(activeHoleNumber)
    const roundCourseSource = selected.data.courseSource ?? 'saved'
    const firstScorePar = selected.data.participantIds
      .map((participantId) => selectedParticipantScores[participantId]?.[holeKey]?.par)
      .find((value) => typeof value === 'number')
    const freshHole = selectedFreshHoleByNumber[activeHoleNumber]
    const layoutHole =
      roundCourseSource === 'saved' && layoutTemplateDoc?.holes
        ? layoutTemplateDoc.holes[activeHoleNumber - 1]
        : undefined
    const parValue =
      roundCourseSource === 'fresh'
        ? (typeof freshHole?.par === 'number' ? freshHole.par : (firstScorePar ?? null))
        : typeof layoutHole?.par === 'number'
          ? layoutHole.par
          : (selectedSavedParByHole[activeHoleNumber] ?? (firstScorePar ?? null))
    const lengthMeters =
      roundCourseSource === 'fresh' && typeof freshHole?.lengthMeters === 'number'
        ? freshHole.lengthMeters
        : roundCourseSource === 'saved' && typeof layoutHole?.lengthMeters === 'number'
          ? layoutHole.lengthMeters
          : null
    const participantScores: Record<string, { strokes: number; par: number } | undefined> = {}
    for (const participantId of selected.data.participantIds) {
      participantScores[participantId] = selectedParticipantScores[participantId]?.[holeKey]
    }
    return {
      par: parValue,
      lengthMeters,
      participantScores,
    }
  }, [
    activeHoleNumber,
    selected,
    layoutTemplateDoc,
    selectedFreshHoleByNumber,
    selectedParticipantScores,
    selectedSavedParByHole,
  ])

  const defaultHoleDraft = useMemo(() => {
    if (!selected || !persistedHoleState) return null
    const nextScoreInputs: Record<string, string> = {}
    for (const participantId of selected.data.participantIds) {
      const score = persistedHoleState.participantScores[participantId]
      nextScoreInputs[participantId] = score ? String(score.strokes) : ''
    }
    return {
      parInput: typeof persistedHoleState.par === 'number' ? String(persistedHoleState.par) : '',
      lengthInput:
        typeof persistedHoleState.lengthMeters === 'number'
          ? String(persistedHoleState.lengthMeters)
          : '',
      scoreInputs: nextScoreInputs,
    }
  }, [persistedHoleState, selected])
  const effectiveHoleDraft = holeDraft ?? defaultHoleDraft

  const saveStateLabel = useMemo(() => {
    switch (saveState) {
      case 'dirty':
        return t('scoring.saveState.unsavedChanges')
      case 'saving':
        return t('scoring.saveState.saving')
      case 'error':
        return t('scoring.saveState.saveFailed')
      default:
        return t('scoring.saveState.saved')
    }
  }, [saveState, t])

  const updateHoleDraft = useCallback(
    (updater: (current: HoleDraftInputs) => HoleDraftInputs) => {
      setHoleDraft((current) => {
        const base = current ?? effectiveHoleDraft
        if (!base) return current
        return updater(base)
      })
      setSaveState('dirty')
      setNotice(null)
    },
    [effectiveHoleDraft],
  )

  const saveCurrentHole = useCallback(async (): Promise<boolean> => {
    if (!selected || !roundId || !effectiveHoleDraft || !persistedHoleState) return true
    const roundCourseSource = selected.data.courseSource ?? 'saved'
    const payload = mergeAutosavePayload({
      courseSource: roundCourseSource,
      participantIds: selected.data.participantIds,
      draft: effectiveHoleDraft,
      persisted: persistedHoleState,
      allowSavedParAdjust: canAdjustSavedCourseMetadata,
    })

    if (payload.validationError) {
      setError(payload.validationError)
      setSaveState('error')
      return false
    }

    if (!payload.hasMeaningfulChange) {
      setSaveState('saved')
      return true
    }

    setSaveState('saving')
    setError(null)
    try {
      if (roundCourseSource === 'fresh' && payload.metadata) {
        await updateFreshRoundHoleMetadata({
          roundId: roundId,
          actorUid: uid,
          holeNumber: activeHoleNumber,
          metadata: payload.metadata,
        })
      }
      if (payload.savedParSync) {
        await syncSavedRoundHoleParForHole({
          roundId: roundId,
          actorUid: uid,
          holeNumber: activeHoleNumber,
          par: payload.savedParSync.par,
        })
      }
      await Promise.all(
        payload.participantScoreUpdates.map((update) =>
          recordParticipantHoleScoreTransaction(
            roundId,
            uid,
            update.participantUid,
            activeHoleNumber,
            update.strokes,
            update.par,
          ),
        ),
      )
      setSaveState('saved')
      return true
    } catch (nextError) {
      if (nextError instanceof FreshRoundDraftValidationError) {
        setError(formatDraftIssues(t, nextError.issues))
      } else {
        setError(
          nextError instanceof Error
            ? translateUserError(t, nextError.message)
            : t('scoring.errors.failedToAutosaveHole'),
        )
      }
      setSaveState('error')
      return false
    }
  }, [
    activeHoleNumber,
    canAdjustSavedCourseMetadata,
    effectiveHoleDraft,
    persistedHoleState,
    selected,
    roundId,
    t,
    uid,
  ])

  useEffect(() => {
    if (saveState !== 'dirty' || !selected || !effectiveHoleDraft || !persistedHoleState) return
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current)
    }
    autosaveTimerRef.current = window.setTimeout(() => {
      void saveCurrentHole()
    }, AUTOSAVE_DEBOUNCE_MS)
    return () => {
      if (autosaveTimerRef.current !== null) {
        window.clearTimeout(autosaveTimerRef.current)
        autosaveTimerRef.current = null
      }
    }
  }, [effectiveHoleDraft, persistedHoleState, saveCurrentHole, saveState, selected])

  const navigateToHole = useCallback(
    async (targetHoleNumber: number) => {
      if (!selectedHoleCount) return
      const nextHoleNumber = clampHoleNumber(targetHoleNumber, selectedHoleCount)
      if (nextHoleNumber === activeHoleNumber) return
      if (saveState === 'dirty' || saveState === 'error') {
        const saved = await saveCurrentHole()
        if (!saved) return
      }
      setHoleNumber(nextHoleNumber)
      setHoleDraft(null)
      setSaveState('saved')
    },
    [activeHoleNumber, saveCurrentHole, saveState, selectedHoleCount],
  )

  const onAddParticipant = useCallback(async () => {
    if (!roundId || !selected) return
    const inviteInput = inviteAnonymousNameInputRef.current
    if (inviteInput) {
      inviteInput.setCustomValidity('')
      if (!inviteInput.checkValidity()) {
        setInviteAnonymousNameError(resolveAnonymousNameError(inviteInput))
        return
      }
    }
    const normalizedAnonymousName = normalizeAnonymousParticipantName(inviteAnonymousName)
    const shouldAddAnonymous = normalizedAnonymousName.length > 0
    if (inviteSelections.length === 0 && !shouldAddAnonymous) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const anonymousParticipant = shouldAddAnonymous
        ? {
            id: createAnonymousParticipantId(),
            displayName: normalizedAnonymousName,
          }
        : null
      await Promise.all([
        ...inviteSelections.map((participantUid) => addParticipantToRound(roundId, participantUid)),
        ...(anonymousParticipant
          ? [
              addAnonymousParticipantToRound({
                roundId: roundId,
                actorUid: uid,
                participant: anonymousParticipant,
              }),
            ]
          : []),
      ])
      setInviteSelections([])
      setInviteAnonymousName('')
      setInviteAnonymousNameError(null)
      const totalAdded = inviteSelections.length + (anonymousParticipant ? 1 : 0)
      setNotice(
        totalAdded === 1
          ? t('scoring.messages.participantAdded')
          : t('scoring.messages.participantsAdded', { count: totalAdded }),
      )
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? translateUserError(t, nextError.message)
          : t('scoring.errors.failedToAddParticipant'),
      )
    } finally {
      setBusy(false)
    }
  }, [inviteAnonymousName, inviteSelections, resolveAnonymousNameError, selected, roundId, t, uid])

  const onRemoveRoundParticipant = useCallback(
    async (participantId: string) => {
      if (!roundId || !canManageRoundRoster) return
      setBusy(true)
      setError(null)
      setNotice(null)
      try {
        await removeParticipantFromRound({
          roundId: roundId,
          actorUid: uid,
          participantId,
        })
        setNotice(t('scoring.messages.participantRemoved'))
      } catch (nextError) {
        setError(
          nextError instanceof Error
            ? translateUserError(t, nextError.message)
            : t('scoring.errors.failedToRemoveParticipant'),
        )
      } finally {
        setBusy(false)
      }
    },
    [canManageRoundRoster, roundId, t, uid],
  )

  const onReplaceRoundParticipant = useCallback(async () => {
    if (!roundId || !rosterReplaceFromId || !rosterReplaceTargetUid || !canManageRoundRoster) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await replaceRoundParticipant({
        roundId: roundId,
        actorUid: uid,
        fromParticipantId: rosterReplaceFromId,
        toParticipantUid: rosterReplaceTargetUid,
      })
      clearRosterReplaceFlow()
      setNotice(t('scoring.messages.participantReplaced'))
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? translateUserError(t, nextError.message)
          : t('scoring.errors.failedToReplaceParticipant'),
      )
    } finally {
      setBusy(false)
    }
  }, [
    canManageRoundRoster,
    clearRosterReplaceFlow,
    rosterReplaceFromId,
    rosterReplaceTargetUid,
    roundId,
    t,
    uid,
  ])

  const onDeleteRound = useCallback(
    async (deletedRoundId: string, ownerId: string) => {
      if (ownerId !== uid && !isAdmin) return
      const confirmed = window.confirm(t('scoring.confirmations.deleteRound'))
      if (!confirmed) return
      setBusy(true)
      setError(null)
      setNotice(null)
      try {
        await deleteRound(deletedRoundId)
        if (deletedRoundId === roundId) {
          clearRosterReplaceFlow()
          setHoleNumber(1)
          setHoleDraft(null)
          setSaveState('saved')
          onAfterRoundDeleted?.()
        }
        setNotice(t('scoring.notices.roundDeleted'))
      } catch (nextError) {
        setError(
          nextError instanceof Error
            ? translateUserError(t, nextError.message)
            : t('scoring.errors.failedToDeleteRound'),
        )
      } finally {
        setBusy(false)
      }
    },
    [clearRosterReplaceFlow, isAdmin, onAfterRoundDeleted, roundId, t, uid],
  )

  const onComplete = useCallback(async () => {
    if (!roundId || !selected) return
    if (selected.data.courseSource === 'fresh') {
      try {
        normalizeFreshCourseDraftForPromotion(selected.data.courseDraft)
      } catch (nextError) {
        if (nextError instanceof FreshRoundDraftValidationError) {
          setError(
            t('scoring.errors.roundCannotCompleteWithDetails', {
              details: formatDraftIssues(t, nextError.issues),
            }),
          )
          return
        }
        throw nextError
      }
    }
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const result = await completeRoundAndPromote(roundId, uid)
      if (result.promotionStatus === 'created' || result.promotionStatus === 'already_created') {
        setNotice(t('scoring.notices.roundCompletedPromoted'))
      } else if (result.promotionStatus === 'pending') {
        setNotice(t('scoring.notices.roundCompletedPromotionPending'))
      } else if (result.promotionStatus === 'failed') {
        setError(
          t('scoring.errors.roundCannotCompleteWithDetails', {
            details: formatDraftIssues(t, result.validationIssues ?? []),
          }),
        )
      }
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? translateUserError(t, nextError.message)
          : t('scoring.errors.failedToCompleteRound'),
      )
    } finally {
      setBusy(false)
    }
  }, [selected, roundId, t, uid])

  const onRetryPromotion = useCallback(async () => {
    if (!roundId) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const result = await completeRoundAndPromote(roundId, uid)
      if (result.promotionStatus === 'created' || result.promotionStatus === 'already_created') {
        setNotice(t('scoring.notices.promotionSucceeded'))
      } else if (result.promotionStatus === 'pending') {
        setNotice(t('scoring.notices.promotionStillPending'))
      } else if (result.promotionStatus === 'failed') {
        setError(
          t('scoring.errors.promotionBlockedWithDetails', {
            details: formatDraftIssues(t, result.validationIssues ?? []),
          }),
        )
      }
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? translateUserError(t, nextError.message)
          : t('scoring.errors.failedToRetryPromotion'),
      )
    } finally {
      setBusy(false)
    }
  }, [roundId, t, uid])

  return (
    <section className="scoring-panel" aria-labelledby="scoring-panel-title">
      <h2 id="scoring-panel-title" className="scoring-panel__title">
        {t('scoring.title')}
      </h2>
      {error ? (
        <p className="scoring-panel__error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? <p className="scoring-panel__notice">{notice}</p> : null}

      <div className="scoring-panel__tabs" role="tablist" aria-label={t('scoring.aria.workspaceTabs')}>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'scorecard'}
          className={`scoring-panel__tab${activeTab === 'scorecard' ? ' scoring-panel__tab--active' : ''}`}
          onClick={() => setActiveTab('scorecard')}
        >
          {t('scoring.tabs.scorecard')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'participants'}
          className={`scoring-panel__tab${activeTab === 'participants' ? ' scoring-panel__tab--active' : ''}`}
          onClick={() => setActiveTab('participants')}
        >
          {t('scoring.tabs.participants')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'analytics'}
          className={`scoring-panel__tab${activeTab === 'analytics' ? ' scoring-panel__tab--active' : ''}`}
          onClick={() => setActiveTab('analytics')}
        >
          {t('scoring.tabs.analytics')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'follow'}
          className={`scoring-panel__tab${activeTab === 'follow' ? ' scoring-panel__tab--active' : ''}`}
          onClick={() => setActiveTab('follow')}
        >
          {t('scoring.tabs.follow')}
        </button>
      </div>

      {activeTab === 'scorecard' ? (
        <>
          {roundMissingAfterSync ? (
            <p className="scoring-panel__error" role="alert">
              {t('rounds.scorecard.notFoundOrNoAccess')}
            </p>
          ) : null}

          {selected ? (
            <div className="scoring-panel__section">
              <span className="scoring-panel__label">{t('scoring.sections.holeByHole')}</span>
              {selectedSummary ? (
                <p className="scoring-panel__muted">
                  {t('scoring.rounds.roundTotal', {
                    totalStrokes: selectedSummary.totalStrokes,
                    totalPar: selectedSummary.totalPar,
                    totalDelta: formatDelta(selectedSummary.totalDelta),
                    scoredHoles: selectedSummary.scoredHoles,
                    holeCount: selectedHoleCount ?? 0,
                  })}
                </p>
              ) : null}
              <p className="scoring-panel__muted scoring-panel__summary-caption">{t('scoring.summary.caption')}</p>
              <ScorecardSummaryGrid
                participantIds={selected.data.participantIds}
                participantNames={selectedParticipantNames}
                scoresByParticipant={selectedParticipantScores ?? {}}
                holeCount={selectedHoleCount ?? 0}
              />
              <HoleStepper
                key={`${roundId}:${activeHoleNumber}`}
                holeCount={selectedHoleCount ?? 1}
                currentHole={activeHoleNumber}
                onSelectHole={(nextHole) => void navigateToHole(nextHole)}
                onPrevious={() => {
                  if (!selectedHoleCount) return
                  void navigateToHole(stepHoleNumber(activeHoleNumber, -1, selectedHoleCount))
                }}
                onNext={() => {
                  if (!selectedHoleCount) return
                  void navigateToHole(stepHoleNumber(activeHoleNumber, 1, selectedHoleCount))
                }}
                disabled={busy || !effectiveHoleDraft}
                honorHint={honorHint}
              />
              {effectiveHoleDraft ? (
                <HoleForm
                  holeNumber={activeHoleNumber}
                  parValue={effectiveHoleDraft.parInput}
                  lengthValue={effectiveHoleDraft.lengthInput}
                  onParChange={(value) =>
                    updateHoleDraft((current) => ({
                      ...current,
                      parInput: value,
                    }))
                  }
                  onLengthChange={(value) =>
                    updateHoleDraft((current) => ({
                      ...current,
                      lengthInput: value,
                    }))
                  }
                  disablePar={savedCourseMetadataLocked}
                  disableLength={selected.data.courseSource !== 'fresh'}
                  saveStateLabel={saveStateLabel}
                >
                  <PlayerScoreRows
                    participantIds={selected.data.participantIds}
                    participantNames={selectedParticipantNames}
                    scoreInputs={effectiveHoleDraft.scoreInputs}
                    onScoreChange={(participantUid, value) =>
                      updateHoleDraft((current) => ({
                        ...current,
                        scoreInputs: {
                          ...current.scoreInputs,
                          [participantUid]: value,
                        },
                      }))
                    }
                    parValue={parseIntegerInput(effectiveHoleDraft.parInput)}
                  />
                </HoleForm>
              ) : (
                <p className="scoring-panel__muted">{t('scoring.rounds.selectRoundToLoadHoleForm')}</p>
              )}
              {savedCourseMetadataLocked ? (
                <p className="scoring-panel__muted scoring-panel__hint">{t('scoring.form.savedLayoutLockedHint')}</p>
              ) : null}
              <p className="scoring-panel__legend-footnote">
                {t('scoring.legend')}
              </p>
              <p className="scoring-panel__muted scoring-panel__complete-round-hint">
                {t('scoring.buttons.completeRoundHint')}
              </p>
              <div className="scoring-panel__row">
                <button
                  type="button"
                  className="scoring-panel__button scoring-panel__button--primary"
                  onClick={() => void onComplete()}
                  disabled={busy}
                >
                  {t('scoring.buttons.completeRound')}
                </button>
                {selected.data.courseSource === 'fresh' &&
                (selected.data.coursePromotion?.status === 'pending' ||
                  selected.data.coursePromotion?.status === 'failed') ? (
                  <button
                    type="button"
                    className="scoring-panel__button"
                    onClick={() => void onRetryPromotion()}
                    disabled={busy}
                  >
                    {t('scoring.buttons.retryPromotion')}
                  </button>
                ) : null}
                {selected.data.ownerId === uid || isAdmin ? (
                  <button
                    type="button"
                    className="scoring-panel__button scoring-panel__button--danger"
                    onClick={() => void onDeleteRound(roundId, selected.data.ownerId)}
                    disabled={busy}
                  >
                    {t('scoring.buttons.delete')}
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="scoring-panel__muted">{t('scoring.rounds.selectRoundToRecordScores')}</p>
          )}
        </>
      ) : null}

      {activeTab === 'participants' ? (
        <div className="scoring-panel__section">
          <span className="scoring-panel__label">{t('scoring.sections.roundParticipants')}</span>
          {!selected ? (
            <p className="scoring-panel__muted">{t('scoring.participants.selectRoundFirst')}</p>
          ) : (
            <>
              <ul className="scoring-panel__list">
                {selected.data.participantIds.map((participantId) => {
                  const totals = selectedParticipantTotals[participantId] ?? {
                    totalStrokes: 0,
                    totalPar: 0,
                    totalDelta: 0,
                    scoredHoles: 0,
                  }
                  const isAnonymous = isAnonymousParticipantId(participantId)
                  const canRosterEditRow = canManageRoundRoster && participantId !== selected.data.ownerId
                  const replacePanelOpen = rosterReplaceFromId === participantId
                  return (
                    <li
                      key={participantId}
                      className={`scoring-panel__list-item${replacePanelOpen ? ' scoring-panel__list-item--stacked' : ''}`}
                    >
                      <div className="scoring-panel__list-item-main">
                        <div>
                          <strong>{selectedParticipantNames[participantId] ?? participantId}</strong>
                          <p className="scoring-panel__muted">
                            {isAnonymous ? t('scoring.labels.anonymousParticipant') : participantId}
                          </p>
                        </div>
                        <p className="scoring-panel__muted">
                          {t('scoring.participants.playerSummary', {
                            totalStrokes: totals.totalStrokes,
                            totalPar: totals.totalPar,
                            totalDelta: formatDelta(totals.totalDelta),
                            scoredHoles: totals.scoredHoles,
                          })}
                        </p>
                        {canRosterEditRow ? (
                          <div className="scoring-panel__list-item-actions">
                            <button
                              type="button"
                              className="scoring-panel__button scoring-panel__button--inline"
                              disabled={busy}
                              onClick={() => {
                                setRosterReplaceFromId(participantId)
                                setRosterReplaceQuery('')
                                setRosterReplaceTargetUid(null)
                              }}
                            >
                              {t('scoring.buttons.replaceParticipant')}
                            </button>
                            <button
                              type="button"
                              className="scoring-panel__button scoring-panel__button--inline"
                              disabled={busy}
                              onClick={() => void onRemoveRoundParticipant(participantId)}
                            >
                              {t('scoring.buttons.removeParticipant')}
                            </button>
                          </div>
                        ) : null}
                      </div>
                      {replacePanelOpen ? (
                        <div
                          className="scoring-panel__list-item-replace"
                          role="region"
                          aria-label={t('scoring.aria.replaceParticipantPanel')}
                        >
                          <p className="scoring-panel__muted">{t('scoring.participants.replaceIntro')}</p>
                          <div className="scoring-panel__field scoring-panel__field--grow">
                            <label className="scoring-panel__label" htmlFor="roster-replace-search">
                              {t('scoring.participants.replaceSearchLabel')}
                            </label>
                            <input
                              id="roster-replace-search"
                              className="scoring-panel__input"
                              value={rosterReplaceQuery}
                              onChange={(event) => setRosterReplaceQuery(event.target.value)}
                              placeholder={t('scoring.participants.replaceSearchPlaceholder')}
                              autoComplete="off"
                            />
                            <div
                              className="scoring-panel__participant-list"
                              role="radiogroup"
                              aria-label={t('scoring.aria.replaceParticipantChoices')}
                            >
                              {rosterReplaceCandidateEntries.map((entry) => (
                                <label key={entry.uid} className="scoring-panel__participant-option">
                                  <input
                                    type="radio"
                                    name="roster-replace-target"
                                    value={entry.uid}
                                    checked={rosterReplaceTargetUid === entry.uid}
                                    disabled={busy}
                                    onChange={() => setRosterReplaceTargetUid(entry.uid)}
                                  />
                                  <span>{participantDisplayName(entry)}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                          <div className="scoring-panel__row scoring-panel__row--compact">
                            <button
                              type="button"
                              className="scoring-panel__button scoring-panel__button--primary"
                              disabled={busy || !rosterReplaceTargetUid}
                              onClick={() => void onReplaceRoundParticipant()}
                            >
                              {t('scoring.buttons.confirmReplace')}
                            </button>
                            <button
                              type="button"
                              className="scoring-panel__button"
                              disabled={busy}
                              onClick={() => {
                                setRosterReplaceFromId(null)
                                setRosterReplaceQuery('')
                                setRosterReplaceTargetUid(null)
                              }}
                            >
                              {t('scoring.buttons.cancelReplace')}
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
              <p className="scoring-panel__muted">
                {t('scoring.participants.grandTotal', {
                  totalStrokes: selectedGrandTotals.totalStrokes,
                  totalPar: selectedGrandTotals.totalPar,
                  totalDelta: formatDelta(selectedGrandTotals.totalDelta),
                  count: selectedGrandTotals.participantCount,
                  participantCount: selectedGrandTotals.participantCount,
                })}
              </p>
              {canManageRoundRoster ? (
                <div className="scoring-panel__scorecard-participants">
                  <div className="scoring-panel__field scoring-panel__field--grow">
                    <label className="scoring-panel__label" htmlFor="invite-search">
                      {t('scoring.participants.addParticipants')}
                    </label>
                    <input
                      id="invite-search"
                      className="scoring-panel__input"
                      value={inviteParticipantQuery}
                      onChange={(event) => setInviteParticipantQuery(event.target.value)}
                      placeholder={t('scoring.participants.searchUsersPlaceholder')}
                      autoComplete="off"
                    />
                    <div className="scoring-panel__participant-list" role="group" aria-label={t('scoring.aria.inviteParticipants')}>
                      {inviteCandidateEntries.map((entry) => {
                        const checked = inviteSelections.includes(entry.uid)
                        return (
                          <label key={entry.uid} className="scoring-panel__participant-option">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={busy}
                              onChange={() =>
                                setInviteSelections((current) =>
                                  current.includes(entry.uid)
                                    ? current.filter((value) => value !== entry.uid)
                                    : [...current, entry.uid],
                                )
                              }
                            />
                            <span>
                              {participantDisplayName(entry)}
                            </span>
                          </label>
                        )
                      })}
                    </div>
                    <div className="scoring-panel__row scoring-panel__row--compact">
                      <div className="scoring-panel__field scoring-panel__field--grow scoring-panel__field--compact field">
                        <label className="scoring-panel__label field__label" htmlFor="invite-anonymous-name">
                          {t('scoring.labels.playerNameOptional')}
                        </label>
                        <input
                          id="invite-anonymous-name"
                          ref={inviteAnonymousNameInputRef}
                          className={`scoring-panel__input field__control${
                            inviteAnonymousNameError ? ' field__control--invalid' : ''
                          }`}
                          value={inviteAnonymousName}
                          onChange={(event) => {
                            event.currentTarget.setCustomValidity('')
                            setInviteAnonymousName(event.target.value)
                            if (inviteAnonymousNameError && event.currentTarget.validity.valid) {
                              setInviteAnonymousNameError(null)
                            }
                          }}
                          onInvalid={(event) => {
                            event.preventDefault()
                            setInviteAnonymousNameError(resolveAnonymousNameError(event.currentTarget))
                          }}
                          pattern={`(?:${NON_WHITESPACE_PATTERN})?`}
                          maxLength={ANONYMOUS_NAME_MAX_LENGTH}
                          placeholder={t('scoring.placeholders.playerName')}
                          autoComplete="off"
                          aria-invalid={inviteAnonymousNameError ? 'true' : 'false'}
                          aria-describedby={inviteAnonymousNameError ? 'invite-anonymous-name-error' : undefined}
                        />
                        {inviteAnonymousNameError ? (
                          <p id="invite-anonymous-name-error" className="field__error" role="alert">
                            {inviteAnonymousNameError}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="scoring-panel__button scoring-panel__button--primary scoring-panel__button--participant-submit"
                    onClick={() => void onAddParticipant()}
                    disabled={
                      busy ||
                      (inviteSelections.length === 0 &&
                        normalizeAnonymousParticipantName(inviteAnonymousName).length === 0)
                    }
                  >
                    {t('scoring.buttons.addPlayer')}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {activeTab === 'analytics' ? (
        <div className="scoring-panel__section">
          <span className="scoring-panel__label">{t('scoring.sections.analyticsStrip')}</span>
          {participantParSummary.scoredRounds === 0 ? (
            <p className="scoring-panel__muted">{t('scoring.analytics.empty')}</p>
          ) : (
            <>
              <p className="scoring-panel__analytics-summary">
                {t('scoring.analytics.completedRoundsSummary', {
                  completedRounds: participantParSummary.completedRounds,
                  scoredRounds: participantParSummary.scoredRounds,
                  scoredHoles: participantParSummary.scoredHoles,
                })}
              </p>
              <p className="scoring-panel__analytics-delta">
                <strong>{t('scoring.analytics.deltaLabel')}</strong>
                <span
                  className={`scoring-panel__notation scoring-panel__analytics-delta-value ${
                    participantParNotation ? scoreTierToNotationClassName(participantParNotation.tier) : ''
                  }`}
                  aria-label={t('scoring.aria.totalRoundDelta', { delta: formatDelta(participantParSummary.totalDelta) })}
                >
                  {formatDelta(participantParSummary.totalDelta)}
                </span>
                <span className="scoring-panel__muted">
                  {t('scoring.analytics.deltaFromTotals', {
                    totalStrokes: participantParSummary.totalStrokes,
                    totalPar: participantParSummary.totalPar,
                  })}
                </span>
              </p>
            </>
          )}
          {analyticsOpponentOptions.length > 0 ? (
            <>
              <div className="scoring-panel__row">
                <div className="scoring-panel__field">
                  <label className="scoring-panel__label" htmlFor="analytics-opponent">
                    {t('scoring.analytics.headToHeadOpponent')}
                  </label>
                  <select
                    id="analytics-opponent"
                    className="scoring-panel__select"
                    value={selectedAnalyticsOpponentUid}
                    onChange={(event) => setAnalyticsOpponentUid(event.target.value)}
                  >
                    {analyticsOpponentOptions.map((opponentUid) => {
                      const entry = directoryByUid[opponentUid]
                      return (
                        <option key={opponentUid} value={opponentUid}>
                          {anonymousDisplayNameById[opponentUid] ??
                            (entry ? participantDisplayName(entry) : opponentUid)}
                        </option>
                      )
                    })}
                  </select>
                </div>
              </div>
              {headToHeadSummary ? (
                <p className="scoring-panel__analytics-summary">
                  {t('scoring.analytics.headToHeadLabel')}{' '}
                  <strong>
                    {headToHeadSummary.wins}-{headToHeadSummary.losses}-{headToHeadSummary.ties}
                  </strong>{' '}
                  {t('scoring.analytics.acrossComparableRounds', {
                    comparedRounds: headToHeadSummary.comparedRounds,
                  })}
                  {headToHeadSummary.skippedRounds > 0
                    ? ` (${t('scoring.analytics.skippedRoundsReason', { skippedRounds: headToHeadSummary.skippedRounds })}).`
                    : '.'}
                </p>
              ) : null}
            </>
          ) : (
            <p className="scoring-panel__muted">
              {t('scoring.analytics.addRoundsToUnlock')}
            </p>
          )}
        </div>
      ) : null}

      {activeTab === 'follow' ? (
        <div className="scoring-panel__section">
          <FollowPanel user={user} />
        </div>
      ) : null}
    </section>
  )
}
