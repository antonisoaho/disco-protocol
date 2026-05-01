import { type User } from 'firebase/auth'
import type { Timestamp } from 'firebase/firestore'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CourseRoundSelection } from '../courses/courseData'
import {
  FreshRoundDraftValidationError,
  normalizeFreshCourseDraft,
  normalizeFreshCourseDraftForPromotion,
  type FreshRoundDraftIssue,
} from '../firebase/freshRoundCourse'
import { strokesParDeltaToSemantic } from '../lib/scoreSemantic'
import type { RoundDoc, RoundVisibility } from '../firebase/roundTypes'
import {
  addParticipantToRound,
  completeRoundAndPromote,
  createRound,
  recordHoleScoreTransaction,
  subscribeMyRounds,
  updateFreshRoundHoleMetadata,
} from '../firebase/rounds'
import {
  aggregateScoreProtocol,
  normalizeHoleScoreUpdate,
  normalizeScoreProtocol,
} from './protocol'

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

  const fromScores = Object.keys(data.holeScores ?? {})
    .map((key) => Number(key))
    .filter((value) => Number.isInteger(value) && value >= 1)
    .reduce((max, value) => Math.max(max, value), 0)

  const fromDraftHoles = data.courseDraft?.holes?.length ?? 0
  return Math.max(DEFAULT_ROUND_HOLE_COUNT, fromScores, fromDraftHoles)
}

function formatDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : `${delta}`
}

export function ScoringPanel({ user, selectedCourseTemplate }: Props) {
  const uid = user.uid
  const [items, setItems] = useState<{ id: string; data: RoundDoc }[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [startMode, setStartMode] = useState<'saved' | 'fresh'>('saved')
  const [freshCourseName, setFreshCourseName] = useState('')
  const [freshHoleCount, setFreshHoleCount] = useState(DEFAULT_FRESH_HOLE_COUNT)
  const [visibility, setVisibility] = useState<RoundVisibility>('private')
  const [holeNumber, setHoleNumber] = useState(1)
  const [strokes, setStrokes] = useState(3)
  const [par, setPar] = useState(3)
  const [freshHoleEdits, setFreshHoleEdits] = useState<Record<string, { par: string; lengthMeters: string }>>({})
  const [inviteUid, setInviteUid] = useState('')
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

  const selected = useMemo(
    () => items.find((r) => r.id === selectedId) ?? null,
    [items, selectedId],
  )

  const selectedHoleCount = useMemo(
    () => (selected ? inferRoundHoleCount(selected.data) : null),
    [selected],
  )

  const selectedSummary = useMemo(() => {
    if (!selected) return null

    try {
      const protocol = normalizeScoreProtocol({
        version: selected.data.scoreProtocolVersion,
        holeCount: inferRoundHoleCount(selected.data),
        holeScores: selected.data.holeScores ?? {},
      })
      return aggregateScoreProtocol(protocol)
    } catch {
      return null
    }
  }, [selected])

  const selectedFreshHole = useMemo(() => {
    if (!selected || selected.data.courseSource !== 'fresh') {
      return null
    }
    return selected.data.courseDraft?.holes.find((entry) => entry.number === holeNumber) ?? null
  }, [holeNumber, selected])

  const freshHoleEditKey =
    selected && selected.data.courseSource === 'fresh' ? `${selected.id}:${holeNumber}` : null
  const freshHoleInputValues = useMemo(
    () =>
      freshHoleEditKey
        ? (freshHoleEdits[freshHoleEditKey] ?? {
            par: typeof selectedFreshHole?.par === 'number' ? String(selectedFreshHole.par) : '',
            lengthMeters:
              typeof selectedFreshHole?.lengthMeters === 'number'
                ? String(selectedFreshHole.lengthMeters)
                : '',
          })
        : { par: '', lengthMeters: '' },
    [freshHoleEditKey, freshHoleEdits, selectedFreshHole],
  )

  const onCreateRound = useCallback(async () => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
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
          participantIds: [uid],
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
          participantIds: [uid],
        })
      }
      setSelectedId(id)
      setHoleNumber(1)
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
    selectedCourseTemplate,
    startMode,
    uid,
    visibility,
  ])

  const onSaveHole = useCallback(async () => {
    if (!selectedId) return
    setBusy(true)
    setError(null)
    try {
      const normalized = normalizeHoleScoreUpdate(
        { holeNumber, strokes, par },
        { holeCount: selectedHoleCount },
      )
      await recordHoleScoreTransaction(
        selectedId,
        uid,
        normalized.holeNumber,
        normalized.strokes,
        normalized.par,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save hole')
    } finally {
      setBusy(false)
    }
  }, [holeNumber, par, selectedHoleCount, selectedId, strokes, uid])

  const onSaveFreshHoleMetadata = useCallback(async () => {
    if (!selectedId || !selected || selected.data.courseSource !== 'fresh' || !freshHoleEditKey) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await updateFreshRoundHoleMetadata({
        roundId: selectedId,
        actorUid: uid,
        holeNumber,
        metadata: {
          par: freshHoleInputValues.par,
          lengthMeters: freshHoleInputValues.lengthMeters,
        },
      })
      setFreshHoleEdits((current) => {
        const next = { ...current }
        delete next[freshHoleEditKey]
        return next
      })
      setNotice(`Saved hole ${holeNumber} metadata.`)
      if (freshHoleInputValues.par.trim().length > 0) {
        setPar(Number(freshHoleInputValues.par))
      }
    } catch (e) {
      if (e instanceof FreshRoundDraftValidationError) {
        setError(formatDraftIssues(e.issues))
      } else {
        setError(e instanceof Error ? e.message : 'Failed to save hole metadata')
      }
    } finally {
      setBusy(false)
    }
  }, [freshHoleEditKey, freshHoleInputValues, holeNumber, selected, selectedId, uid])

  const onAddParticipant = useCallback(async () => {
    if (!selectedId || !inviteUid.trim()) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await addParticipantToRound(selectedId, inviteUid.trim())
      setInviteUid('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add participant')
    } finally {
      setBusy(false)
    }
  }, [inviteUid, selectedId])

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
              const keys = Object.keys(data.holeScores ?? {}).sort((a, b) => Number(a) - Number(b))
              const lastKey = keys.length ? keys[keys.length - 1] : null
              const last = lastKey ? data.holeScores[lastKey] : null
              const semantic = last ? strokesParDeltaToSemantic(last.strokes, last.par) : 'par'
              const summary = (() => {
                try {
                  return aggregateScoreProtocol(
                    normalizeScoreProtocol({
                      version: data.scoreProtocolVersion,
                      holeCount: inferRoundHoleCount(data),
                      holeScores: data.holeScores ?? {},
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
                    {last ? (
                      <span className={`scoring-panel__badge scoring-panel__badge--${semantic}`}>
                        {last.strokes}/{last.par}
                      </span>
                    ) : (
                      <span className="scoring-panel__muted">no scores</span>
                    )}
                    <button
                      type="button"
                      className="scoring-panel__button scoring-panel__button--inline"
                      onClick={() => {
                        setSelectedId(id)
                        if (data.courseSource === 'fresh') {
                          setHoleNumber(1)
                          const firstHole = data.courseDraft?.holes[0]
                          if (typeof firstHole?.par === 'number') {
                            setPar(firstHole.par)
                          }
                        }
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
          <span className="scoring-panel__label">Hole score (transaction, last-write-wins per hole)</span>
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
          {selected.data.courseSource === 'fresh' ? (
            <div className="scoring-panel__row scoring-panel__fresh-editor">
              <div className="scoring-panel__field">
                <label className="scoring-panel__label" htmlFor="fresh-hole-par-current">
                  Hole {holeNumber} par
                </label>
                <input
                  id="fresh-hole-par-current"
                  className="scoring-panel__input"
                  type="number"
                  min={2}
                  max={9}
                  value={freshHoleInputValues.par}
                  onChange={(e) =>
                    setFreshHoleEdits((current) => ({
                      ...current,
                      [`${selected.id}:${holeNumber}`]: {
                        par: e.target.value,
                        lengthMeters: freshHoleInputValues.lengthMeters,
                      },
                    }))
                  }
                  placeholder="required"
                />
              </div>
              <div className="scoring-panel__field">
                <label className="scoring-panel__label" htmlFor="fresh-hole-length-current">
                  Hole {holeNumber} length (m)
                </label>
                <input
                  id="fresh-hole-length-current"
                  className="scoring-panel__input"
                  type="number"
                  min={1}
                  max={5000}
                  value={freshHoleInputValues.lengthMeters}
                  onChange={(e) =>
                    setFreshHoleEdits((current) => ({
                      ...current,
                      [`${selected.id}:${holeNumber}`]: {
                        par: freshHoleInputValues.par,
                        lengthMeters: e.target.value,
                      },
                    }))
                  }
                  placeholder="required"
                />
              </div>
              <button
                type="button"
                className="scoring-panel__button"
                onClick={() => void onSaveFreshHoleMetadata()}
                disabled={busy}
              >
                Save hole metadata
              </button>
            </div>
          ) : null}
          <div className="scoring-panel__row">
            <div className="scoring-panel__field">
              <label className="scoring-panel__label" htmlFor="hole-n">
                Hole
              </label>
              <input
                id="hole-n"
                className="scoring-panel__input"
                type="number"
                min={1}
                max={selectedHoleCount ?? 36}
                value={holeNumber}
                onChange={(e) => {
                  const maxHole = selectedHoleCount ?? 36
                  const nextHole = Math.min(maxHole, Math.max(1, Number(e.target.value)))
                  setHoleNumber(nextHole)
                  if (selected.data.courseSource === 'fresh') {
                    const draftHole = selected.data.courseDraft?.holes.find((entry) => entry.number === nextHole)
                    if (typeof draftHole?.par === 'number') {
                      setPar(draftHole.par)
                    }
                  }
                }}
              />
            </div>
            <button
              type="button"
              className="scoring-panel__button"
              onClick={() => setHoleNumber((current) => Math.max(1, current - 1))}
              disabled={busy || holeNumber <= 1}
            >
              Prev hole
            </button>
            <button
              type="button"
              className="scoring-panel__button"
              onClick={() =>
                setHoleNumber((current) => Math.min(selectedHoleCount ?? 36, current + 1))
              }
              disabled={busy || holeNumber >= (selectedHoleCount ?? 36)}
            >
              Next hole
            </button>
            <div className="scoring-panel__field">
              <label className="scoring-panel__label" htmlFor="strokes">
                Strokes
              </label>
              <input
                id="strokes"
                className="scoring-panel__input"
                type="number"
                min={1}
                max={99}
                value={strokes}
                onChange={(e) => setStrokes(Number(e.target.value))}
              />
            </div>
            <div className="scoring-panel__field">
              <label className="scoring-panel__label" htmlFor="par">
                Par snapshot
              </label>
              <input
                id="par"
                className="scoring-panel__input"
                type="number"
                min={2}
                max={9}
                value={par}
                onChange={(e) => setPar(Number(e.target.value))}
              />
            </div>
            <button
              type="button"
              className="scoring-panel__button scoring-panel__button--primary"
              onClick={() => void onSaveHole()}
              disabled={busy}
            >
              Save hole
            </button>
            <button type="button" className="scoring-panel__button" onClick={() => void onComplete()} disabled={busy}>
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
          {selected.data.ownerId === uid ? (
            <div className="scoring-panel__row">
              <div className="scoring-panel__field scoring-panel__field--grow">
                <label className="scoring-panel__label" htmlFor="invite-uid">
                  Add participant (registered uid)
                </label>
                <input
                  id="invite-uid"
                  className="scoring-panel__input"
                  value={inviteUid}
                  onChange={(e) => setInviteUid(e.target.value)}
                  placeholder="other user uid"
                  autoComplete="off"
                />
              </div>
              <button
                type="button"
                className="scoring-panel__button"
                onClick={() => void onAddParticipant()}
                disabled={busy || !inviteUid.trim()}
              >
                Add to round
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
