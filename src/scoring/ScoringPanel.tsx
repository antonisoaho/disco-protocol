import { type User } from 'firebase/auth'
import type { Timestamp } from 'firebase/firestore'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { CourseRoundSelection } from '../courses/courseData'
import { computeHeadToHeadSummary, computeParticipantParSummary } from '../analytics/roundAnalytics'
import {
  FreshRoundDraftValidationError,
  normalizeFreshCourseDraft,
  normalizeFreshCourseDraftForPromotion,
  type FreshRoundDraftIssue,
} from '../firebase/freshRoundCourse'
import {
  addAnonymousParticipantToRound,
  addParticipantToRound,
  completeRoundAndPromote,
  createRound,
  deleteRound,
  recordParticipantHoleScoreTransaction,
  subscribeMyRounds,
  updateFreshRoundHoleMetadata,
} from '../firebase/rounds'
import type { RoundDoc, RoundVisibility } from '../firebase/roundTypes'
import { subscribeFollowers, subscribeFollowing } from '../firebase/follows'
import { subscribeUserDirectory, type UserDirectoryEntry } from '../firebase/userDirectory'
import {
  scoreTierToNotationClassName,
  strokesParDeltaToNotation,
  type ScoreDecorationShape,
} from '../lib/scoreSemantic'
import { FollowPanel } from '../social/FollowPanel'
import {
  buildAnonymousParticipantNameMap,
  createAnonymousParticipantId,
  deriveFriendUidSet,
  filterParticipantDirectoryEntries,
  isAnonymousParticipantId,
  mergeAnonymousParticipants,
  normalizeAnonymousParticipantName,
  type AnonymousParticipant,
} from './participantRoster'
import { HoleForm } from './HoleForm'
import { HoleStepper } from './HoleStepper'
import { mergeAutosavePayload, type HoleDraftInputs, clampHoleNumber, stepHoleNumber } from './holeAutosave'
import { PlayerScoreRows } from './PlayerScoreRows'
import { aggregateScoreProtocol, normalizeScoreProtocol } from './protocol'
import { computeGrandTotals, computeParticipantTotals } from './scorecardTable'

type Props = {
  user: User
  selectedCourseTemplate: CourseRoundSelection | null
}

const DEFAULT_ROUND_HOLE_COUNT = 18
const DEFAULT_FRESH_HOLE_COUNT = 9
const AUTOSAVE_DEBOUNCE_MS = 550

type AppTabId = 'scorecard' | 'participants' | 'analytics' | 'follow'
type SaveState = 'saved' | 'dirty' | 'saving' | 'error'

function normalizeFreshHoleCount(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_FRESH_HOLE_COUNT
  return Math.min(36, Math.max(1, Math.floor(value)))
}

function formatDraftIssues(issues: FreshRoundDraftIssue[]): string {
  if (issues.length === 0) {
    return 'Fresh hole metadata is incomplete.'
  }

  const perHole = new Map<number, Set<string>>()
  const generalMessages = new Set<string>()

  for (const issue of issues) {
    const holeMatch = issue.path.match(/^holes\.(\d+)\.(par|lengthMeters)$/)
    if (holeMatch) {
      const holeNumber = Number(holeMatch[1]) + 1
      const field = holeMatch[2] === 'par' ? 'par' : 'length'
      if (!perHole.has(holeNumber)) {
        perHole.set(holeNumber, new Set<string>())
      }
      perHole.get(holeNumber)?.add(field)
      continue
    }
    generalMessages.add(issue.message)
  }

  const holeMessages = Array.from(perHole.entries())
    .sort(([a], [b]) => a - b)
    .map(([holeNumber, fields]) => `Hole ${holeNumber}: ${Array.from(fields).join(' + ')}`)

  return [...holeMessages, ...Array.from(generalMessages)].join('. ')
}

function formatStartedAt(ts: Timestamp): string {
  try {
    return ts.toDate().toLocaleString()
  } catch {
    return ''
  }
}

function inferRoundHoleCount(data: RoundDoc): number {
  if (
    typeof data.holeCount === 'number' &&
    Number.isInteger(data.holeCount) &&
    data.holeCount >= 1
  ) {
    return data.holeCount
  }

  let fromScores = 0
  for (const key of Object.keys(data.holeScores ?? {})) {
    const value = Number(key)
    if (Number.isInteger(value) && value >= 1) {
      fromScores = Math.max(fromScores, value)
    }
  }

  const fromDraftHoles = data.courseDraft?.holes?.length ?? 0
  return Math.max(DEFAULT_ROUND_HOLE_COUNT, fromScores, fromDraftHoles)
}

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

type ScoreNotationValueProps = {
  strokes: number
  decorationShape: ScoreDecorationShape
  decorationLayers: number
}

function ScoreNotationValue({ strokes, decorationShape, decorationLayers }: ScoreNotationValueProps) {
  let content = <span className="scoring-panel__notation-value">{strokes}</span>
  for (let layer = 0; layer < decorationLayers; layer += 1) {
    content = (
      <span className={`scoring-panel__notation-frame scoring-panel__notation-frame--${decorationShape}`}>
        {content}
      </span>
    )
  }
  return content
}

export function ScoringPanel({ user, selectedCourseTemplate }: Props) {
  const { t } = useTranslation('common')
  const uid = user.uid
  const [activeTab, setActiveTab] = useState<AppTabId>('scorecard')
  const [items, setItems] = useState<{ id: string; data: RoundDoc }[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [startMode, setStartMode] = useState<'saved' | 'fresh'>('saved')
  const [freshCourseName, setFreshCourseName] = useState('')
  const [freshHoleCount, setFreshHoleCount] = useState(DEFAULT_FRESH_HOLE_COUNT)
  const [visibility, setVisibility] = useState<RoundVisibility>('private')
  const [newRoundParticipants, setNewRoundParticipants] = useState<string[]>([uid])
  const [newRoundParticipantQuery, setNewRoundParticipantQuery] = useState('')
  const [newRoundAnonymousName, setNewRoundAnonymousName] = useState('')
  const [newRoundAnonymousParticipants, setNewRoundAnonymousParticipants] = useState<AnonymousParticipant[]>([])
  const [inviteParticipantQuery, setInviteParticipantQuery] = useState('')
  const [inviteAnonymousName, setInviteAnonymousName] = useState('')
  const [inviteSelections, setInviteSelections] = useState<string[]>([])
  const [analyticsOpponentUid, setAnalyticsOpponentUid] = useState('')
  const [directoryEntries, setDirectoryEntries] = useState<UserDirectoryEntry[]>([])
  const [followingIds, setFollowingIds] = useState<string[]>([])
  const [followerIds, setFollowerIds] = useState<string[]>([])
  const [holeNumber, setHoleNumber] = useState(1)
  const [holeDraft, setHoleDraft] = useState<HoleDraftInputs | null>(null)
  const [expandedPlayers, setExpandedPlayers] = useState<Record<string, boolean>>({})
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const autosaveTimerRef = useRef<number | null>(null)

  useEffect(() => {
    const unsub = subscribeMyRounds(
      uid,
      (next) => {
        setError(null)
        setItems(next)
      },
      (nextError) => setError(nextError.message),
    )
    return () => unsub()
  }, [uid])

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

  const selected = useMemo(() => items.find((round) => round.id === selectedId) ?? null, [items, selectedId])
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
        displayName: user.displayName?.trim() || user.email?.split('@')[0] || 'You',
        subtitle: uid,
      }
    }
    return map
  }, [directoryEntries, uid, user.displayName, user.email])

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

  const availableNewRoundParticipants = useMemo(
    () =>
      filterParticipantDirectoryEntries({
        entries: searchableDirectoryEntries,
        query: newRoundParticipantQuery,
        friendUidSet,
      }),
    [friendUidSet, newRoundParticipantQuery, searchableDirectoryEntries],
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
    const parValue =
      roundCourseSource === 'fresh'
        ? (typeof freshHole?.par === 'number' ? freshHole.par : (firstScorePar ?? null))
        : (selectedSavedParByHole[activeHoleNumber] ?? (firstScorePar ?? null))
    const lengthMeters =
      roundCourseSource === 'fresh' && typeof freshHole?.lengthMeters === 'number'
        ? freshHole.lengthMeters
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
        return 'Unsaved changes'
      case 'saving':
        return 'Saving...'
      case 'error':
        return 'Save failed'
      default:
        return 'Saved'
    }
  }, [saveState])

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
    if (!selected || !selectedId || !effectiveHoleDraft || !persistedHoleState) return true
    const roundCourseSource = selected.data.courseSource ?? 'saved'
    const payload = mergeAutosavePayload({
      courseSource: roundCourseSource,
      participantIds: selected.data.participantIds,
      draft: effectiveHoleDraft,
      persisted: persistedHoleState,
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
          roundId: selectedId,
          actorUid: uid,
          holeNumber: activeHoleNumber,
          metadata: payload.metadata,
        })
      }
      await Promise.all(
        payload.participantScoreUpdates.map((update) =>
          recordParticipantHoleScoreTransaction(
            selectedId,
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
        setError(formatDraftIssues(nextError.issues))
      } else {
        setError(nextError instanceof Error ? nextError.message : 'Failed to autosave hole')
      }
      setSaveState('error')
      return false
    }
  }, [activeHoleNumber, effectiveHoleDraft, persistedHoleState, selected, selectedId, uid])

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

  const onAddNewRoundAnonymousParticipant = useCallback(() => {
    const normalizedName = normalizeAnonymousParticipantName(newRoundAnonymousName)
    if (normalizedName.length === 0) {
      setError(t('scoring.messages.anonymousNameRequired'))
      return
    }
    const id = createAnonymousParticipantId()
    setNewRoundAnonymousParticipants((current) => [...current, { id, displayName: normalizedName }])
    setNewRoundParticipants((current) => Array.from(new Set([...current, id])))
    setNewRoundAnonymousName('')
    setError(null)
  }, [newRoundAnonymousName, t])

  const onRemoveNewRoundAnonymousParticipant = useCallback((participantId: string) => {
    setNewRoundAnonymousParticipants((current) =>
      current.filter((participant) => participant.id !== participantId),
    )
    setNewRoundParticipants((current) => current.filter((participant) => participant !== participantId))
  }, [])

  const onCreateRound = useCallback(async () => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const participantIds = Array.from(new Set([uid, ...newRoundParticipants])).filter(
        (participantId) => participantId.trim().length > 0,
      )
      const anonymousParticipants = mergeAnonymousParticipants(participantIds, newRoundAnonymousParticipants)
      let id = ''
      if (startMode === 'saved') {
        if (!selectedCourseTemplate) {
          setError('Select a saved course template or switch to fresh setup.')
          return
        }
        const safeHoleCount = Math.min(36, Math.max(1, selectedCourseTemplate.holeCount))
        id = await createRound({
          ownerId: uid,
          courseSource: 'saved',
          courseId: selectedCourseTemplate.courseId,
          templateId: selectedCourseTemplate.templateId,
          holeCount: safeHoleCount,
          visibility,
          participantIds,
          anonymousParticipants,
        })
      } else {
        const courseDraft = normalizeFreshCourseDraft({
          name: freshCourseName,
          holes: Array.from({ length: freshHoleCount }, () => ({
            par: null,
            lengthMeters: null,
          })),
        })
        id = await createRound({
          ownerId: uid,
          courseSource: 'fresh',
          courseDraft,
          holeCount: courseDraft.holes.length,
          visibility,
          participantIds,
          anonymousParticipants,
        })
      }
      setSelectedId(id)
      setHoleNumber(1)
      setHoleDraft(null)
      setSaveState('saved')
      setExpandedPlayers({})
      setNewRoundParticipantQuery('')
      setNewRoundAnonymousName('')
      setNewRoundAnonymousParticipants([])
      setNewRoundParticipants([uid])
      setActiveTab('scorecard')
      setNotice('Round created. Start scoring hole-by-hole.')
    } catch (nextError) {
      if (nextError instanceof FreshRoundDraftValidationError) {
        setError(formatDraftIssues(nextError.issues))
      } else {
        setError(nextError instanceof Error ? nextError.message : 'Failed to create round')
      }
    } finally {
      setBusy(false)
    }
  }, [
    freshCourseName,
    freshHoleCount,
    newRoundParticipants,
    newRoundAnonymousParticipants,
    selectedCourseTemplate,
    startMode,
    uid,
    visibility,
  ])

  const onAddParticipant = useCallback(async () => {
    if (!selectedId || !selected) return
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
        ...inviteSelections.map((participantUid) => addParticipantToRound(selectedId, participantUid)),
        ...(anonymousParticipant
          ? [
              addAnonymousParticipantToRound({
                roundId: selectedId,
                ownerUid: selected.data.ownerId,
                participant: anonymousParticipant,
              }),
            ]
          : []),
      ])
      setInviteSelections([])
      setInviteAnonymousName('')
      const totalAdded = inviteSelections.length + (anonymousParticipant ? 1 : 0)
      setNotice(
        totalAdded === 1
          ? t('scoring.messages.participantAdded')
          : t('scoring.messages.participantsAdded', { count: totalAdded }),
      )
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to add participant')
    } finally {
      setBusy(false)
    }
  }, [inviteAnonymousName, inviteSelections, selected, selectedId, t])

  const onDeleteRound = useCallback(
    async (roundId: string, ownerId: string) => {
      if (ownerId !== uid) return
      const confirmed = window.confirm('Delete this round permanently? This cannot be undone.')
      if (!confirmed) return
      setBusy(true)
      setError(null)
      setNotice(null)
      try {
        await deleteRound(roundId)
        if (selectedId === roundId) {
          setSelectedId(null)
          setHoleNumber(1)
          setHoleDraft(null)
          setSaveState('saved')
          setExpandedPlayers({})
        }
        setNotice('Round deleted.')
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : 'Failed to delete round')
      } finally {
        setBusy(false)
      }
    },
    [selectedId, uid],
  )

  const onComplete = useCallback(async () => {
    if (!selectedId || !selected) return
    if (selected.data.courseSource === 'fresh') {
      try {
        normalizeFreshCourseDraftForPromotion(selected.data.courseDraft)
      } catch (nextError) {
        if (nextError instanceof FreshRoundDraftValidationError) {
          setError(
            `Round cannot be completed yet. Fill missing hole metadata first. ${formatDraftIssues(nextError.issues)}`,
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
      const result = await completeRoundAndPromote(selectedId, uid)
      if (result.promotionStatus === 'created' || result.promotionStatus === 'already_created') {
        setNotice('Round completed. Fresh course was promoted to saved course catalog.')
      } else if (result.promotionStatus === 'pending') {
        setNotice('Round completed. Promotion is pending and will need a retry once online.')
      } else if (result.promotionStatus === 'failed') {
        setError(
          `Round cannot be completed yet. Fill missing hole metadata first. ${formatDraftIssues(result.validationIssues ?? [])}`,
        )
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to complete round')
    } finally {
      setBusy(false)
    }
  }, [selected, selectedId, uid])

  const onRetryPromotion = useCallback(async () => {
    if (!selectedId) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const result = await completeRoundAndPromote(selectedId, uid)
      if (result.promotionStatus === 'created' || result.promotionStatus === 'already_created') {
        setNotice('Promotion succeeded. Fresh course is now available in saved courses.')
      } else if (result.promotionStatus === 'pending') {
        setNotice('Still pending. Retry again when network connectivity returns.')
      } else if (result.promotionStatus === 'failed') {
        setError(
          `Promotion is still blocked by missing hole metadata. ${formatDraftIssues(result.validationIssues ?? [])}`,
        )
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to retry promotion')
    } finally {
      setBusy(false)
    }
  }, [selectedId, uid])

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

      <div className="scoring-panel__tabs" role="tablist" aria-label="Scoring workspace tabs">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'scorecard'}
          className={`scoring-panel__tab${activeTab === 'scorecard' ? ' scoring-panel__tab--active' : ''}`}
          onClick={() => setActiveTab('scorecard')}
        >
          Scorecard
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'participants'}
          className={`scoring-panel__tab${activeTab === 'participants' ? ' scoring-panel__tab--active' : ''}`}
          onClick={() => setActiveTab('participants')}
        >
          Participants
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'analytics'}
          className={`scoring-panel__tab${activeTab === 'analytics' ? ' scoring-panel__tab--active' : ''}`}
          onClick={() => setActiveTab('analytics')}
        >
          Analytics
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'follow'}
          className={`scoring-panel__tab${activeTab === 'follow' ? ' scoring-panel__tab--active' : ''}`}
          onClick={() => setActiveTab('follow')}
        >
          Follow
        </button>
      </div>

      {activeTab === 'scorecard' ? (
        <>
          <div className="scoring-panel__section">
            <span className="scoring-panel__label">Start a round</span>
            <div className="scoring-panel__mode-switch">
              <button
                type="button"
                className={`scoring-panel__button${startMode === 'saved' ? ' scoring-panel__button--active' : ''}`}
                onClick={() => setStartMode('saved')}
                disabled={busy}
              >
                {t('scoring.buttons.savedCourse')}
              </button>
              <button
                type="button"
                className={`scoring-panel__button${startMode === 'fresh' ? ' scoring-panel__button--active' : ''}`}
                onClick={() => setStartMode('fresh')}
                disabled={busy}
              >
                {t('scoring.buttons.freshInstance')}
              </button>
            </div>
            {startMode === 'saved' ? (
              selectedCourseTemplate ? (
                <p className="scoring-panel__selection">
                  Using <strong>{selectedCourseTemplate.courseName}</strong> /{' '}
                  <strong>{selectedCourseTemplate.templateLabel}</strong> ({selectedCourseTemplate.holeCount} holes)
                </p>
              ) : (
                <p className="scoring-panel__muted">Pick a saved course + template on the Courses page before starting.</p>
              )
            ) : (
              <>
                <p className="scoring-panel__muted">
                  Start quickly with name and hole count, then fill par/length as you play.
                </p>
                <div className="scoring-panel__row">
                  <div className="scoring-panel__field scoring-panel__field--grow">
                    <label className="scoring-panel__label" htmlFor="fresh-course-name">
                      Course name
                    </label>
                    <input
                      id="fresh-course-name"
                      className="scoring-panel__input"
                      value={freshCourseName}
                      onChange={(event) => setFreshCourseName(event.target.value)}
                      placeholder="Enter course name"
                      autoComplete="off"
                    />
                  </div>
                  <div className="scoring-panel__field">
                    <label className="scoring-panel__label" htmlFor="fresh-hole-count">
                      Holes
                    </label>
                    <input
                      id="fresh-hole-count"
                      className="scoring-panel__input"
                      type="number"
                      min={1}
                      max={36}
                      value={freshHoleCount}
                      onChange={(event) => {
                        setFreshHoleCount(normalizeFreshHoleCount(Number(event.target.value)))
                      }}
                    />
                  </div>
                </div>
              </>
            )}
            <div className="scoring-panel__field scoring-panel__field--grow">
              <label className="scoring-panel__label" htmlFor="participant-search">
                Participants
              </label>
              <input
                id="participant-search"
                className="scoring-panel__input"
                value={newRoundParticipantQuery}
                onChange={(event) => setNewRoundParticipantQuery(event.target.value)}
                placeholder={t('scoring.placeholders.participantSearch')}
                autoComplete="off"
              />
              {newRoundParticipantQuery.trim().length === 0 ? (
                <p className="scoring-panel__muted">{t('scoring.messages.participantDefaultsToFriends')}</p>
              ) : null}
              <div className="scoring-panel__participant-list" role="group" aria-label="Select round participants">
                {availableNewRoundParticipants.map((entry) => {
                  const checked = newRoundParticipants.includes(entry.uid)
                  return (
                    <label key={entry.uid} className="scoring-panel__participant-option">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={busy}
                        onChange={() => {
                          setNewRoundParticipants((current) => {
                            if (current.includes(entry.uid)) {
                              return current.filter((participantId) => participantId !== entry.uid)
                            }
                            return [...current, entry.uid]
                          })
                        }}
                      />
                      <span>
                        {participantDisplayName(entry)}
                        <small className="scoring-panel__participant-subtitle">{entry.subtitle}</small>
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>
            <div className="scoring-panel__row">
              <div className="scoring-panel__field scoring-panel__field--grow">
                <label className="scoring-panel__label" htmlFor="new-round-anonymous-name">
                  {t('scoring.labels.addAnonymous')}
                </label>
                <input
                  id="new-round-anonymous-name"
                  className="scoring-panel__input"
                  value={newRoundAnonymousName}
                  onChange={(event) => setNewRoundAnonymousName(event.target.value)}
                  placeholder={t('scoring.placeholders.anonymousName')}
                  autoComplete="off"
                />
              </div>
              <button
                type="button"
                className="scoring-panel__button"
                onClick={onAddNewRoundAnonymousParticipant}
                disabled={busy}
              >
                {t('scoring.buttons.addAnonymous')}
              </button>
            </div>
            {newRoundAnonymousParticipants.length > 0 ? (
              <ul className="scoring-panel__list">
                {newRoundAnonymousParticipants.map((participant) => (
                  <li key={participant.id} className="scoring-panel__list-item">
                    <strong>{participant.displayName}</strong>
                    <button
                      type="button"
                      className="scoring-panel__button scoring-panel__button--inline"
                      onClick={() => onRemoveNewRoundAnonymousParticipant(participant.id)}
                      disabled={busy}
                    >
                      {t('scoring.buttons.removeAnonymous')}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="scoring-panel__row">
              <div className="scoring-panel__field">
                <label className="scoring-panel__label" htmlFor="visibility">
                  Visibility
                </label>
                <select
                  id="visibility"
                  className="scoring-panel__select"
                  value={visibility}
                  onChange={(event) => setVisibility(event.target.value as RoundVisibility)}
                >
                  <option value="private">private</option>
                  <option value="unlisted">unlisted</option>
                  <option value="public">public</option>
                </select>
              </div>
              <button
                type="button"
                className="scoring-panel__button scoring-panel__button--primary"
                onClick={() => void onCreateRound()}
                disabled={busy || (startMode === 'saved' && !selectedCourseTemplate)}
              >
                {t('scoring.buttons.newRound')}
              </button>
            </div>
          </div>

          <div className="scoring-panel__section">
            <span className="scoring-panel__label">Your rounds</span>
            {items.length === 0 ? (
              <p className="scoring-panel__muted">No rounds yet.</p>
            ) : (
              <ul className="scoring-panel__list">
                {items.map(({ id, data }) => {
                  const participantScores = readParticipantHoleScores(data, uid)
                  const currentParticipantScores = participantScores[uid] ?? {}
                  const keys = Object.keys(currentParticipantScores).sort((a, b) => Number(a) - Number(b))
                  const lastKey = keys.length ? keys[keys.length - 1] : null
                  const last = lastKey ? currentParticipantScores[lastKey] : null
                  const notation = last ? strokesParDeltaToNotation(last.strokes, last.par) : null
                  const summary = (() => {
                    try {
                      return aggregateScoreProtocol(
                        normalizeScoreProtocol({
                          version: data.scoreProtocolVersion,
                          holeCount: inferRoundHoleCount(data),
                          holeScores: currentParticipantScores,
                        }),
                      )
                    } catch {
                      return null
                    }
                  })()
                  return (
                    <li key={id} className="scoring-panel__list-item">
                      <div>
                        <strong>{id}</strong>
                        <p className="scoring-panel__muted">
                          {data.visibility} · {formatStartedAt(data.startedAt)}
                          {data.completedAt ? ' · completed' : ''}
                        </p>
                        <p className="scoring-panel__muted">
                          {data.courseSource === 'fresh'
                            ? `fresh draft · ${data.courseDraft?.name ?? 'unnamed'}`
                            : `saved course ${data.courseId} / ${data.templateId}`}
                        </p>
                        {summary ? (
                          <p className="scoring-panel__muted">
                            {summary.totalStrokes}/{summary.totalPar} ({formatDelta(summary.totalDelta)}) ·{' '}
                            {summary.scoredHoles}/{inferRoundHoleCount(data)} holes
                          </p>
                        ) : null}
                      </div>
                      <div>
                        {last && notation ? (
                          <span className="scoring-panel__score-notation">
                            <span
                              className={`scoring-panel__notation ${scoreTierToNotationClassName(notation.tier)}`}
                              aria-label={`${notation.label}: ${last.strokes} strokes on par ${last.par}`}
                              title={`${notation.label} (${formatDelta(notation.delta)} vs par)`}
                            >
                              <ScoreNotationValue
                                strokes={last.strokes}
                                decorationShape={notation.decorationShape}
                                decorationLayers={notation.decorationLayers}
                              />
                            </span>
                            <span className="scoring-panel__notation-par">/{last.par}</span>
                          </span>
                        ) : (
                          <span className="scoring-panel__muted">no scores</span>
                        )}
                        <button
                          type="button"
                          className="scoring-panel__button scoring-panel__button--inline"
                          onClick={() => {
                            setSelectedId(id)
                            setHoleNumber(1)
                            setHoleDraft(null)
                            setSaveState('saved')
                            setExpandedPlayers({})
                            setActiveTab('scorecard')
                          }}
                          disabled={busy}
                        >
                          {selectedId === id ? t('scoring.buttons.selected') : t('scoring.buttons.select')}
                        </button>
                        {data.ownerId === uid ? (
                          <button
                            type="button"
                            className="scoring-panel__button scoring-panel__button--inline"
                            onClick={() => void onDeleteRound(id, data.ownerId)}
                            disabled={busy}
                          >
                            {t('scoring.buttons.delete')}
                          </button>
                        ) : null}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {selected ? (
            <div className="scoring-panel__section">
              <span className="scoring-panel__label">Hole-by-hole scoring</span>
              {selectedSummary ? (
                <p className="scoring-panel__muted">
                  Round total {selectedSummary.totalStrokes}/{selectedSummary.totalPar} (
                  {formatDelta(selectedSummary.totalDelta)}) · {selectedSummary.scoredHoles}/{selectedHoleCount} holes
                  scored
                </p>
              ) : null}
              <HoleStepper
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
                statusLabel={saveStateLabel}
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
                    expandedByUid={expandedPlayers}
                    onToggleExpanded={(participantUid) =>
                      setExpandedPlayers((current) => ({
                        ...current,
                        [participantUid]: !(current[participantUid] ?? true),
                      }))
                    }
                    parValue={parseIntegerInput(effectiveHoleDraft.parInput)}
                  />
                </HoleForm>
              ) : (
                <p className="scoring-panel__muted">Select a round to load hole form.</p>
              )}
              <p className="scoring-panel__legend-footnote">
                Legend: Eagle+ ≤ -2, Birdie -1, Par 0, Bogey +1, Double+ ≥ +2.
              </p>
              <div className="scoring-panel__row">
                <button
                  type="button"
                  className="scoring-panel__button scoring-panel__button--primary"
                  onClick={() => void onComplete()}
                  disabled={busy}
                >
                  {t('scoring.buttons.markComplete')}
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
              </div>
            </div>
          ) : (
            <p className="scoring-panel__muted">Select a round to record hole scores.</p>
          )}
        </>
      ) : null}

      {activeTab === 'participants' ? (
        <div className="scoring-panel__section">
          <span className="scoring-panel__label">Round participants</span>
          {!selected ? (
            <p className="scoring-panel__muted">Select a round first.</p>
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
                  return (
                    <li key={participantId} className="scoring-panel__list-item">
                      <div>
                        <strong>{selectedParticipantNames[participantId] ?? participantId}</strong>
                        <p className="scoring-panel__muted">
                          {isAnonymous ? t('scoring.labels.anonymousParticipant') : participantId}
                        </p>
                      </div>
                      <p className="scoring-panel__muted">
                        {totals.totalStrokes}/{totals.totalPar} ({formatDelta(totals.totalDelta)}) ·{' '}
                        {totals.scoredHoles} holes
                      </p>
                    </li>
                  )
                })}
              </ul>
              <p className="scoring-panel__muted">
                Grand total: {selectedGrandTotals.totalStrokes}/{selectedGrandTotals.totalPar} (
                {formatDelta(selectedGrandTotals.totalDelta)}) across {selectedGrandTotals.participantCount}{' '}
                participant{selectedGrandTotals.participantCount === 1 ? '' : 's'}.
              </p>
              {selected.data.ownerId === uid ? (
                <div className="scoring-panel__row scoring-panel__scorecard-participants">
                  <div className="scoring-panel__field scoring-panel__field--grow">
                    <label className="scoring-panel__label" htmlFor="invite-search">
                      Add participants
                    </label>
                    <input
                      id="invite-search"
                      className="scoring-panel__input"
                      value={inviteParticipantQuery}
                      onChange={(event) => setInviteParticipantQuery(event.target.value)}
                      placeholder={t('scoring.placeholders.inviteSearch')}
                      autoComplete="off"
                    />
                    {inviteParticipantQuery.trim().length === 0 ? (
                      <p className="scoring-panel__muted">{t('scoring.messages.participantDefaultsToFriends')}</p>
                    ) : null}
                    <div className="scoring-panel__participant-list" role="group" aria-label="Invite participants">
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
                              <small className="scoring-panel__participant-subtitle">{entry.subtitle}</small>
                            </span>
                          </label>
                        )
                      })}
                    </div>
                    <div className="scoring-panel__row">
                      <div className="scoring-panel__field scoring-panel__field--grow">
                        <label className="scoring-panel__label" htmlFor="invite-anonymous-name">
                          {t('scoring.labels.addAnonymous')}
                        </label>
                        <input
                          id="invite-anonymous-name"
                          className="scoring-panel__input"
                          value={inviteAnonymousName}
                          onChange={(event) => setInviteAnonymousName(event.target.value)}
                          placeholder={t('scoring.placeholders.anonymousName')}
                          autoComplete="off"
                        />
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
                    {t('scoring.buttons.addParticipants')}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {activeTab === 'analytics' ? (
        <div className="scoring-panel__section">
          <span className="scoring-panel__label">Analytics strip</span>
          {participantParSummary.scoredRounds === 0 ? (
            <p className="scoring-panel__muted">Finish and score at least one round to unlock ±par analytics.</p>
          ) : (
            <>
              <p className="scoring-panel__analytics-summary">
                Completed rounds: {participantParSummary.completedRounds} · scored rounds:{' '}
                {participantParSummary.scoredRounds} · scored holes: {participantParSummary.scoredHoles}
              </p>
              <p className="scoring-panel__analytics-delta">
                <strong>± par:</strong>
                <span
                  className={`scoring-panel__notation scoring-panel__analytics-delta-value ${
                    participantParNotation ? scoreTierToNotationClassName(participantParNotation.tier) : ''
                  }`}
                  aria-label={`Total round delta ${formatDelta(participantParSummary.totalDelta)}`}
                >
                  {formatDelta(participantParSummary.totalDelta)}
                </span>
                <span className="scoring-panel__muted">
                  from {participantParSummary.totalStrokes} strokes / {participantParSummary.totalPar} par
                </span>
              </p>
            </>
          )}
          {analyticsOpponentOptions.length > 0 ? (
            <>
              <div className="scoring-panel__row">
                <div className="scoring-panel__field">
                  <label className="scoring-panel__label" htmlFor="analytics-opponent">
                    Head-to-head opponent
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
                  Head-to-head:{' '}
                  <strong>
                    {headToHeadSummary.wins}-{headToHeadSummary.losses}-{headToHeadSummary.ties}
                  </strong>{' '}
                  across {headToHeadSummary.comparedRounds} comparable rounds
                  {headToHeadSummary.skippedRounds > 0
                    ? ` (${headToHeadSummary.skippedRounds} skipped for incomplete/mismatched scorecards).`
                    : '.'}
                </p>
              ) : null}
            </>
          ) : (
            <p className="scoring-panel__muted">
              Add and complete rounds with other participants to unlock head-to-head analytics.
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
