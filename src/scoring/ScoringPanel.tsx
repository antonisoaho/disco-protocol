import { type User } from 'firebase/auth'
import type { Timestamp } from 'firebase/firestore'
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import type { CourseRoundSelection } from '../courses/courseData'
import { subscribeUserDirectory, type UserDirectoryEntry } from '../firebase/userDirectory'
import {
  FreshRoundDraftValidationError,
  normalizeFreshCourseDraft,
  normalizeFreshCourseDraftForPromotion,
  type FreshRoundDraftIssue,
} from '../firebase/freshRoundCourse'
import {
  scoreTierToNotationClassName,
  strokesParDeltaToNotation,
  type ScoreDecorationShape,
} from '../lib/scoreSemantic'
import type { RoundDoc, RoundVisibility } from '../firebase/roundTypes'
import {
  addParticipantToRound,
  completeRoundAndPromote,
  createRound,
  recordParticipantHoleScoreTransaction,
  subscribeMyRounds,
  updateFreshRoundHoleMetadata,
} from '../firebase/rounds'
import {
  aggregateScoreProtocol,
  normalizeScoreProtocol,
} from './protocol'
import {
  buildScorecardColumns,
  collectScorecardEditedHoleNumbers,
  computeGrandTotals,
  computeParticipantTotals,
} from './scorecardTable'

type Props = {
  user: User
  selectedCourseTemplate: CourseRoundSelection | null
}

const DEFAULT_ROUND_HOLE_COUNT = 18
const DEFAULT_FRESH_HOLE_COUNT = 9

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

type ScoreNotationValueProps = {
  strokes: number
  decorationShape: ScoreDecorationShape
  decorationLayers: number
}

function ScoreNotationValue({ strokes, decorationShape, decorationLayers }: ScoreNotationValueProps) {
  let content: ReactNode = <span className="scoring-panel__notation-value">{strokes}</span>
  for (let layer = 0; layer < decorationLayers; layer += 1) {
    content = (
      <span className={`scoring-panel__notation-frame scoring-panel__notation-frame--${decorationShape}`}>
        {content}
      </span>
    )
  }
  return content
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

export function ScoringPanel({ user, selectedCourseTemplate }: Props) {
  const uid = user.uid
  const [items, setItems] = useState<{ id: string; data: RoundDoc }[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [startMode, setStartMode] = useState<'saved' | 'fresh'>('saved')
  const [freshCourseName, setFreshCourseName] = useState('')
  const [freshHoleCount, setFreshHoleCount] = useState(DEFAULT_FRESH_HOLE_COUNT)
  const [visibility, setVisibility] = useState<RoundVisibility>('private')
  const [newRoundParticipants, setNewRoundParticipants] = useState<string[]>([uid])
  const [inviteSelections, setInviteSelections] = useState<string[]>([])
  const [directoryEntries, setDirectoryEntries] = useState<UserDirectoryEntry[]>([])
  const [directoryQuery, setDirectoryQuery] = useState('')
  const [scorecardEdits, setScorecardEdits] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    const unsub = subscribeMyRounds(
      uid,
      (next) => {
        setError(null)
        setItems(next)
      },
      (e) => setError(e.message),
    )
    return () => unsub()
  }, [uid])

  useEffect(() => {
    const unsub = subscribeUserDirectory(
      (entries) => {
        setDirectoryEntries(entries)
      },
      () => {
        // The rules can hide user directory listing. Keep owner-self fallback usable.
      },
    )
    return () => unsub()
  }, [])

  const selected = useMemo(
    () => items.find((r) => r.id === selectedId) ?? null,
    [items, selectedId],
  )

  const selectedHoleCount = useMemo(
    () => (selected ? inferRoundHoleCount(selected.data) : null),
    [selected],
  )

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

  const filteredDirectoryEntries = useMemo(() => {
    const q = directoryQuery.trim().toLowerCase()
    if (!q) return allDirectoryEntries
    return allDirectoryEntries.filter((entry) => {
      const display = participantDisplayName(entry).toLowerCase()
      return display.includes(q) || entry.uid.toLowerCase().includes(q)
    })
  }, [allDirectoryEntries, directoryQuery])

  const selectedParticipantScores = useMemo(
    () => (selected ? readParticipantHoleScores(selected.data, uid) : null),
    [selected, uid],
  )

  const currentUserHoleScores = useMemo(() => {
    if (!selected) return {}
    if (!selectedParticipantScores) return selected.data.holeScores ?? {}
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

  const selectedParticipantColumns = useMemo(() => {
    if (!selected) return []
    const names: Record<string, string> = {}
    for (const participantId of selected.data.participantIds) {
      names[participantId] = participantDisplayName(
        directoryByUid[participantId] ?? {
          uid: participantId,
          displayName: participantId,
          subtitle: participantId,
        },
      )
    }
    return buildScorecardColumns(selected.data.participantIds, names)
  }, [directoryByUid, selected])

  const selectedParticipantOnlyColumns = useMemo(
    () => selectedParticipantColumns.filter((column) => column.kind === 'participant'),
    [selectedParticipantColumns],
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

  const selectedScorecardScores = useMemo(() => {
    if (!selected || !selectedParticipantScores) return null
    const next: Record<string, Record<string, { strokes: number; par: number }>> = {}
    for (const [participantId, holeMap] of Object.entries(selectedParticipantScores)) {
      next[participantId] = { ...holeMap }
    }

    for (const participantId of selected.data.participantIds) {
      next[participantId] = next[participantId] ?? {}
      for (let hole = 1; hole <= inferRoundHoleCount(selected.data); hole += 1) {
        const holeKey = String(hole)
        const value = scorecardEdits[`score:${participantId}:${hole}`]
        if (value === undefined) continue
        const strokesValue = parseIntegerInput(value)
        if (strokesValue === null) {
          delete next[participantId][holeKey]
          continue
        }
        const parInput = scorecardEdits[`par:${hole}`]
        const parsedPar = parInput !== undefined ? parseIntegerInput(parInput) : null
        const fallbackPar =
          selected.data.courseSource === 'fresh'
            ? selectedFreshHoleByNumber[hole]?.par ??
              next[participantId][holeKey]?.par ??
              null
            : selectedSavedParByHole[hole] ??
              next[participantId][holeKey]?.par ??
              null
        if (parsedPar === null && typeof fallbackPar !== 'number') continue
        next[participantId][holeKey] = {
          strokes: strokesValue,
          par: parsedPar ?? (fallbackPar as number),
        }
      }
    }
    return next
  }, [scorecardEdits, selected, selectedFreshHoleByNumber, selectedParticipantScores, selectedSavedParByHole])

  const selectedParticipantTotals = useMemo(() => {
    if (!selected || !selectedScorecardScores) return {}
    return computeParticipantTotals(selected.data.participantIds, selectedScorecardScores)
  }, [selected, selectedScorecardScores])

  const selectedGrandTotals = useMemo(
    () => computeGrandTotals(selectedParticipantTotals),
    [selectedParticipantTotals],
  )

  const scorecardEditedHoles = useMemo(
    () => collectScorecardEditedHoleNumbers(scorecardEdits),
    [scorecardEdits],
  )

  const inviteCandidateEntries = useMemo(() => {
    if (!selected) return []
    return filteredDirectoryEntries.filter((entry) => !selected.data.participantIds.includes(entry.uid))
  }, [filteredDirectoryEntries, selected])

  const onCreateRound = useCallback(async () => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const participantIds = Array.from(new Set([uid, ...newRoundParticipants])).filter(
        (participantId) => participantId.trim().length > 0,
      )
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
        })
      }
      setSelectedId(id)
      setScorecardEdits({})
    } catch (e) {
      if (e instanceof FreshRoundDraftValidationError) {
        setError(formatDraftIssues(e.issues))
      } else {
        setError(e instanceof Error ? e.message : 'Failed to create round')
      }
    } finally {
      setBusy(false)
    }
  }, [
    freshCourseName,
    freshHoleCount,
    newRoundParticipants,
    selectedCourseTemplate,
    startMode,
    uid,
    visibility,
  ])

  const onSaveScorecard = useCallback(async () => {
    if (!selectedId || !selected) return
    if (scorecardEditedHoles.length === 0) {
      setNotice('No unsaved scorecard changes.')
      return
    }

    const rowsToSave: Array<{
      holeNumber: number
      parInput: string
      lengthInput: string
      parSnapshot: number | null
      participantScoresToSave: Array<{ participantUid: string; strokes: number }>
    }> = []

    for (const rowHoleNumber of scorecardEditedHoles) {
      const draftHole = selectedFreshHoleByNumber[rowHoleNumber] ?? null
      const savedHolePar = selectedSavedParByHole[rowHoleNumber]
      const parInput = scorecardEdits[`par:${rowHoleNumber}`]
      const lengthInput = scorecardEdits[`length:${rowHoleNumber}`]
      const resolvedParInput =
        parInput ??
        (selected.data.courseSource === 'fresh'
          ? typeof draftHole?.par === 'number'
            ? String(draftHole.par)
            : ''
          : typeof savedHolePar === 'number'
            ? String(savedHolePar)
            : '')
      const resolvedLengthInput =
        selected.data.courseSource === 'fresh'
          ? lengthInput ?? (typeof draftHole?.lengthMeters === 'number' ? String(draftHole.lengthMeters) : '')
          : ''

      const participantScoresToSave: Array<{ participantUid: string; strokes: number }> = []
      for (const participantUid of selected.data.participantIds) {
        const scoreRaw = scorecardEdits[`score:${participantUid}:${rowHoleNumber}`]
        if (scoreRaw === undefined || scoreRaw.trim() === '') continue
        const parsedStrokes = parseIntegerInput(scoreRaw)
        if (parsedStrokes === null) {
          setError(`Hole ${rowHoleNumber}: score must be an integer for each participant.`)
          return
        }
        participantScoresToSave.push({ participantUid, strokes: parsedStrokes })
      }

      const parSnapshot = parseIntegerInput(resolvedParInput)
      if (participantScoresToSave.length > 0 && parSnapshot === null) {
        setError(`Hole ${rowHoleNumber}: set par before saving participant scores.`)
        return
      }

      rowsToSave.push({
        holeNumber: rowHoleNumber,
        parInput: resolvedParInput,
        lengthInput: resolvedLengthInput,
        parSnapshot,
        participantScoresToSave,
      })
    }

    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      for (const row of rowsToSave) {
        if (selected.data.courseSource === 'fresh') {
          await updateFreshRoundHoleMetadata({
            roundId: selectedId,
            actorUid: uid,
            holeNumber: row.holeNumber,
            metadata: {
              par: row.parInput,
              lengthMeters: row.lengthInput,
            },
          })
        }

        await Promise.all(
          row.participantScoresToSave.map((participant) =>
            recordParticipantHoleScoreTransaction(
              selectedId,
              uid,
              participant.participantUid,
              row.holeNumber,
              participant.strokes,
              row.parSnapshot as number,
            ),
          ),
        )
      }

      setScorecardEdits((current) => {
        const next = { ...current }
        for (const row of rowsToSave) {
          delete next[`par:${row.holeNumber}`]
          if (selected.data.courseSource === 'fresh') {
            delete next[`length:${row.holeNumber}`]
          }
          for (const participantUid of selected.data.participantIds) {
            delete next[`score:${participantUid}:${row.holeNumber}`]
          }
        }
        return next
      })
      setNotice(`Saved ${rowsToSave.length} scorecard hole${rowsToSave.length > 1 ? 's' : ''}.`)
    } catch (e) {
      if (e instanceof FreshRoundDraftValidationError) {
        setError(formatDraftIssues(e.issues))
      } else {
        setError(e instanceof Error ? e.message : 'Failed to save scorecard')
      }
    } finally {
      setBusy(false)
    }
  }, [
    scorecardEditedHoles,
    scorecardEdits,
    selected,
    selectedFreshHoleByNumber,
    selectedSavedParByHole,
    selectedId,
    uid,
  ])

  const onAddParticipant = useCallback(async () => {
    if (!selectedId || inviteSelections.length === 0) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await Promise.all(inviteSelections.map((participantUid) => addParticipantToRound(selectedId, participantUid)))
      setInviteSelections([])
      setNotice(`Added ${inviteSelections.length} participant${inviteSelections.length > 1 ? 's' : ''}.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add participant')
    } finally {
      setBusy(false)
    }
  }, [inviteSelections, selectedId])

  const onComplete = useCallback(async () => {
    if (!selectedId || !selected) return
    if (selected.data.courseSource === 'fresh') {
      try {
        normalizeFreshCourseDraftForPromotion(selected.data.courseDraft)
      } catch (e) {
        if (e instanceof FreshRoundDraftValidationError) {
          setError(
            `Round cannot be completed yet. Fill missing hole metadata first. ${formatDraftIssues(e.issues)}`,
          )
          return
        }
        throw e
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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to complete round')
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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to retry promotion')
    } finally {
      setBusy(false)
    }
  }, [selectedId, uid])

  return (
    <section className="scoring-panel" aria-labelledby="scoring-panel-title">
      <h2 id="scoring-panel-title" className="scoring-panel__title">
        Rounds & scoring
      </h2>
      {error ? (
        <p className="scoring-panel__error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? <p className="scoring-panel__notice">{notice}</p> : null}

      <div className="scoring-panel__section">
        <span className="scoring-panel__label">Start a round</span>
        <div className="scoring-panel__mode-switch">
          <button
            type="button"
            className={`scoring-panel__button${startMode === 'saved' ? ' scoring-panel__button--active' : ''}`}
            onClick={() => setStartMode('saved')}
            disabled={busy}
          >
            Saved course
          </button>
          <button
            type="button"
            className={`scoring-panel__button${startMode === 'fresh' ? ' scoring-panel__button--active' : ''}`}
            onClick={() => setStartMode('fresh')}
            disabled={busy}
          >
            Fresh instance
          </button>
        </div>
        {startMode === 'saved' ? (
          selectedCourseTemplate ? (
            <p className="scoring-panel__selection">
              Using <strong>{selectedCourseTemplate.courseName}</strong> /{' '}
              <strong>{selectedCourseTemplate.templateLabel}</strong> ({selectedCourseTemplate.holeCount} holes)
            </p>
          ) : (
            <p className="scoring-panel__muted">Pick a saved course + template above before starting.</p>
          )
        ) : (
          <>
            <p className="scoring-panel__muted">
              Start quickly with name and hole count, then add par/length per hole while you play.
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
                  onChange={(e) => setFreshCourseName(e.target.value)}
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
                  onChange={(e) => {
                    setFreshHoleCount(normalizeFreshHoleCount(Number(e.target.value)))
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
            value={directoryQuery}
            onChange={(e) => setDirectoryQuery(e.target.value)}
            placeholder="Search players by name or uid"
            autoComplete="off"
          />
          <div className="scoring-panel__participant-list" role="group" aria-label="Select round participants">
            {filteredDirectoryEntries.map((entry) => {
              const checked = newRoundParticipants.includes(entry.uid)
              return (
                <label key={entry.uid} className="scoring-panel__participant-option">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={entry.uid === uid || busy}
                    onChange={() => {
                      setNewRoundParticipants((current) => {
                        if (entry.uid === uid) return current
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
          <div className="scoring-panel__field">
            <label className="scoring-panel__label" htmlFor="visibility">
              visibility
            </label>
            <select
              id="visibility"
              className="scoring-panel__select"
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as RoundVisibility)}
            >
              <option value="private">private</option>
              <option value="unlisted">unlisted</option>
              <option value="public">public</option>
            </select>
          </div>
          {selectedCourseTemplate ? (
            <div className="scoring-panel__field">
              <label className="scoring-panel__label" htmlFor="hole-count-selected">
                holes
              </label>
              <input
                id="hole-count-selected"
                className="scoring-panel__input"
                value={startMode === 'saved' ? selectedCourseTemplate.holeCount : freshHoleCount}
                readOnly
              />
            </div>
          ) : (
            <div className="scoring-panel__field">
              <label className="scoring-panel__label" htmlFor="hole-count-fresh">
                holes
              </label>
              <input
                id="hole-count-fresh"
                className="scoring-panel__input"
                value={startMode === 'fresh' ? freshHoleCount : '—'}
                readOnly
              />
            </div>
          )}
          <button
            type="button"
            className="scoring-panel__button scoring-panel__button--primary"
            onClick={() => void onCreateRound()}
            disabled={busy || (startMode === 'saved' && !selectedCourseTemplate)}
          >
            New round
          </button>
        </div>
      </div>

      <div className="scoring-panel__section">
        <span className="scoring-panel__label">Your rounds (participantIds contains you)</span>
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
                    {data.courseSource === 'fresh' ? (
                      <p className="scoring-panel__muted">
                        Promotion: {data.coursePromotion?.status ?? 'none'}
                        {data.coursePromotion?.errorCode ? ` (${data.coursePromotion.errorCode})` : ''}
                      </p>
                    ) : null}
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
                        setScorecardEdits({})
                      }}
                      disabled={busy}
                    >
                      {selectedId === id ? 'Selected' : 'Select'}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {selected ? (
        <div className="scoring-panel__section">
          <span className="scoring-panel__label">
            {selected.data.courseSource === 'fresh'
              ? 'Fresh scorecard (single save)'
              : 'Saved scorecard (single save)'}
          </span>
          {selectedSummary ? (
            <p className="scoring-panel__muted">
              Round total {selectedSummary.totalStrokes}/{selectedSummary.totalPar} (
              {formatDelta(selectedSummary.totalDelta)}) · {selectedSummary.scoredHoles}/{selectedHoleCount} holes
              scored
            </p>
          ) : null}
          {selected.data.courseSource === 'fresh' ? (
            <p className="scoring-panel__muted">
              Fresh round draft: <strong>{selected.data.courseDraft?.name ?? 'Unnamed course'}</strong> · promotion{' '}
              {selected.data.coursePromotion?.status ?? 'none'}
            </p>
          ) : null}
          {selected.data.courseSource === 'fresh' && selected.data.ownerId === uid ? (
            <div className="scoring-panel__row scoring-panel__scorecard-participants">
              <div className="scoring-panel__field scoring-panel__field--grow">
                <label className="scoring-panel__label" htmlFor="invite-search-fresh">
                  Participants (display names)
                </label>
                <input
                  id="invite-search-fresh"
                  className="scoring-panel__input"
                  value={directoryQuery}
                  onChange={(e) => setDirectoryQuery(e.target.value)}
                  placeholder="Search users by name or uid"
                  autoComplete="off"
                />
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
              </div>
              <button
                type="button"
                className="scoring-panel__button"
                onClick={() => void onAddParticipant()}
                disabled={busy || inviteSelections.length === 0}
              >
                Add selected participants
              </button>
            </div>
          ) : null}
          <div className="scoring-panel__scorecard-wrap">
            <table
              className="scoring-panel__scorecard"
              aria-label={`${selected.data.courseSource === 'fresh' ? 'Fresh' : 'Saved'} round scorecard table`}
            >
              <thead>
                <tr>
                  {selectedParticipantColumns.map((column) => (
                    <th key={column.key} scope="col">
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: selectedHoleCount ?? 0 }, (_, index) => {
                  const rowHoleNumber = index + 1
                  const draftHole = selectedFreshHoleByNumber[rowHoleNumber] ?? null
                  const savedPar = selectedSavedParByHole[rowHoleNumber]
                  const parValue =
                    scorecardEdits[`par:${rowHoleNumber}`] ??
                    (selected.data.courseSource === 'fresh'
                      ? typeof draftHole?.par === 'number'
                        ? String(draftHole.par)
                        : ''
                      : typeof savedPar === 'number'
                        ? String(savedPar)
                        : '')
                  const lengthValue =
                    scorecardEdits[`length:${rowHoleNumber}`] ??
                    (typeof draftHole?.lengthMeters === 'number' ? String(draftHole.lengthMeters) : '')
                  return (
                    <tr key={rowHoleNumber}>
                      <th scope="row" className="scoring-panel__scorecard-hole">
                        {rowHoleNumber}
                      </th>
                      <td>
                        <input
                          className="scoring-panel__scorecard-input"
                          type="number"
                          min={2}
                          max={9}
                          value={parValue}
                          onChange={(e) =>
                            setScorecardEdits((current) => ({
                              ...current,
                              [`par:${rowHoleNumber}`]: e.target.value,
                            }))
                          }
                          placeholder="Par"
                          aria-label={`Hole ${rowHoleNumber} par`}
                        />
                      </td>
                      <td>
                        {selected.data.courseSource === 'fresh' ? (
                          <input
                            className="scoring-panel__scorecard-input"
                            type="number"
                            min={1}
                            max={5000}
                            value={lengthValue}
                            onChange={(e) =>
                              setScorecardEdits((current) => ({
                                ...current,
                                [`length:${rowHoleNumber}`]: e.target.value,
                              }))
                            }
                            placeholder="Length"
                            aria-label={`Hole ${rowHoleNumber} length`}
                          />
                        ) : (
                          <span
                            className="scoring-panel__muted"
                            aria-label={`Hole ${rowHoleNumber} length is fixed by saved course`}
                          >
                            —
                          </span>
                        )}
                      </td>
                      {selectedParticipantOnlyColumns.map((column) => {
                        const participantUid = 'participantId' in column ? column.participantId : ''
                        if (!participantUid) return <td key={`${column.key}:empty`}>—</td>
                        const scoreKey = `score:${participantUid}:${rowHoleNumber}`
                        const persistedScore =
                          selectedScorecardScores?.[participantUid]?.[String(rowHoleNumber)] ?? null
                        const scoreValue =
                          scorecardEdits[scoreKey] ?? (persistedScore ? String(persistedScore.strokes) : '')
                        const parsedPar = parseIntegerInput(parValue)
                        const scorePar =
                          parsedPar ??
                          persistedScore?.par ??
                          (selected.data.courseSource === 'fresh'
                            ? typeof draftHole?.par === 'number'
                              ? draftHole.par
                              : null
                            : typeof savedPar === 'number'
                              ? savedPar
                              : null)
                        const parsedScore = parseIntegerInput(scoreValue)
                        const notation =
                          parsedScore !== null && typeof scorePar === 'number'
                            ? strokesParDeltaToNotation(parsedScore, scorePar)
                            : null

                        return (
                          <td key={column.key} className="scoring-panel__scorecard-cell">
                            <input
                              className="scoring-panel__scorecard-input"
                              type="number"
                              min={1}
                              max={99}
                              value={scoreValue}
                              onChange={(e) =>
                                setScorecardEdits((current) => ({
                                  ...current,
                                  [scoreKey]: e.target.value,
                                }))
                              }
                              placeholder="Strokes"
                              aria-label={`Hole ${rowHoleNumber} strokes for ${column.label}`}
                            />
                            {notation && parsedScore !== null ? (
                              <span
                                className={`scoring-panel__notation scoring-panel__scorecard-notation ${scoreTierToNotationClassName(
                                  notation.tier,
                                )}`}
                                aria-label={`${column.label} hole ${rowHoleNumber}: ${notation.label} (${formatDelta(
                                  notation.delta,
                                )})`}
                                title={`${notation.label} (${formatDelta(notation.delta)} vs par)`}
                              >
                                <ScoreNotationValue
                                  strokes={parsedScore}
                                  decorationShape={notation.decorationShape}
                                  decorationLayers={notation.decorationLayers}
                                />
                              </span>
                            ) : null}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">Per-player total</th>
                  <td>—</td>
                  <td>—</td>
                  {selectedParticipantOnlyColumns.map((column) => {
                    const participantUid = 'participantId' in column ? column.participantId : ''
                    const totals = selectedParticipantTotals[participantUid] ?? {
                      totalStrokes: 0,
                      totalPar: 0,
                      totalDelta: 0,
                      scoredHoles: 0,
                    }
                    return (
                      <td key={`${column.key}:totals`}>
                        <strong>
                          {totals.totalStrokes}/{totals.totalPar}
                        </strong>
                        <span className="scoring-panel__scorecard-total-meta">
                          {totals.scoredHoles > 0 ? `${formatDelta(totals.totalDelta)} · ${totals.scoredHoles}` : 'no scores'}
                        </span>
                      </td>
                    )
                  })}
                </tr>
                <tr>
                  <th scope="row" colSpan={3}>
                    Grand total
                  </th>
                  <td colSpan={Math.max(1, selectedParticipantOnlyColumns.length)}>
                    <strong>
                      {selectedGrandTotals.totalStrokes}/{selectedGrandTotals.totalPar}
                    </strong>
                    <span className="scoring-panel__scorecard-total-meta">
                      {formatDelta(selectedGrandTotals.totalDelta)} · {selectedGrandTotals.scoredHoles} scored
                      entries across {selectedGrandTotals.participantCount} participant
                      {selectedGrandTotals.participantCount === 1 ? '' : 's'}
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="scoring-panel__row scoring-panel__scorecard-actions">
            <p className="scoring-panel__muted">
              {scorecardEditedHoles.length > 0
                ? `${scorecardEditedHoles.length} hole${scorecardEditedHoles.length > 1 ? 's' : ''} pending save`
                : 'All scorecard edits are saved.'}
            </p>
            <button
              type="button"
              className="scoring-panel__button scoring-panel__button--primary"
              onClick={() => void onSaveScorecard()}
              disabled={busy || scorecardEditedHoles.length === 0}
            >
              Save scorecard changes
            </button>
          </div>
          <div className="scoring-panel__row">
            <button
              type="button"
              className="scoring-panel__button scoring-panel__button--primary"
              onClick={() => void onComplete()}
              disabled={busy}
            >
              Mark complete
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
                Retry promotion
              </button>
            ) : null}
          </div>
          {selected.data.ownerId === uid && selected.data.courseSource === 'saved' ? (
            <div className="scoring-panel__row">
              <div className="scoring-panel__field scoring-panel__field--grow">
                <label className="scoring-panel__label" htmlFor="invite-search">
                  Add participants
                </label>
                <input
                  id="invite-search"
                  className="scoring-panel__input"
                  value={directoryQuery}
                  onChange={(e) => setDirectoryQuery(e.target.value)}
                  placeholder="Search users by name or uid"
                  autoComplete="off"
                />
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
              </div>
              <button
                type="button"
                className="scoring-panel__button"
                onClick={() => void onAddParticipant()}
                disabled={busy || inviteSelections.length === 0}
              >
                Add selected
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="scoring-panel__muted">Select a round to record hole scores.</p>
      )}
    </section>
  )
}
