import { type User } from 'firebase/auth'
import type { Timestamp } from 'firebase/firestore'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CourseRoundSelection } from '../courses/courseData'
import { strokesParDeltaToSemantic } from '../lib/scoreSemantic'
import type { RoundDoc, RoundVisibility } from '../firebase/roundTypes'
import {
  addParticipantToRound,
  createRound,
  markRoundCompleted,
  recordHoleScoreTransaction,
  subscribeMyRounds,
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

  return Math.max(DEFAULT_ROUND_HOLE_COUNT, fromScores)
}

function formatDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : `${delta}`
}

export function ScoringPanel({ user, selectedCourseTemplate }: Props) {
  const uid = user.uid
  const [items, setItems] = useState<{ id: string; data: RoundDoc }[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [fallbackCourseId, setFallbackCourseId] = useState('')
  const [fallbackTemplateId, setFallbackTemplateId] = useState('')
  const [fallbackHoleCount, setFallbackHoleCount] = useState(DEFAULT_ROUND_HOLE_COUNT)
  const [visibility, setVisibility] = useState<RoundVisibility>('private')
  const [holeNumber, setHoleNumber] = useState(1)
  const [strokes, setStrokes] = useState(3)
  const [par, setPar] = useState(3)
  const [inviteUid, setInviteUid] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  const onCreateRound = useCallback(async () => {
    const courseId = selectedCourseTemplate?.courseId ?? fallbackCourseId.trim()
    const templateId = selectedCourseTemplate?.templateId ?? fallbackTemplateId.trim()
    if (!courseId || !templateId) {
      setError('Pick a course and template before starting a round.')
      return
    }

    setBusy(true)
    setError(null)
    try {
      const configuredHoleCount = selectedCourseTemplate?.holeCount ?? fallbackHoleCount
      const safeHoleCount = Math.min(36, Math.max(1, configuredHoleCount))
      const id = await createRound({
        ownerId: uid,
        courseId,
        templateId,
        holeCount: safeHoleCount,
        visibility,
        participantIds: [uid],
      })
      setSelectedId(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create round')
    } finally {
      setBusy(false)
    }
  }, [
    fallbackCourseId,
    fallbackHoleCount,
    fallbackTemplateId,
    selectedCourseTemplate,
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

  const onAddParticipant = useCallback(async () => {
    if (!selectedId || !inviteUid.trim()) return
    setBusy(true)
    setError(null)
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
    if (!selectedId) return
    setBusy(true)
    setError(null)
    try {
      await markRoundCompleted(selectedId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to complete round')
    } finally {
      setBusy(false)
    }
  }, [selectedId])

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

      <div className="scoring-panel__section">
        <span className="scoring-panel__label">Start a round</span>
        {selectedCourseTemplate ? (
          <p className="scoring-panel__selection">
            Using <strong>{selectedCourseTemplate.courseName}</strong> /{' '}
            <strong>{selectedCourseTemplate.templateLabel}</strong> ({selectedCourseTemplate.holeCount} holes)
          </p>
        ) : (
          <p className="scoring-panel__muted">
            Pick a course + template above. Manual ids are available as fallback if needed.
          </p>
        )}
        <div className="scoring-panel__row">
          {!selectedCourseTemplate ? (
            <>
              <div className="scoring-panel__field">
                <label className="scoring-panel__label" htmlFor="course-id">
                  courseId (fallback)
                </label>
                <input
                  id="course-id"
                  className="scoring-panel__input"
                  value={fallbackCourseId}
                  onChange={(e) => setFallbackCourseId(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="scoring-panel__field">
                <label className="scoring-panel__label" htmlFor="template-id">
                  templateId (fallback)
                </label>
                <input
                  id="template-id"
                  className="scoring-panel__input"
                  value={fallbackTemplateId}
                  onChange={(e) => setFallbackTemplateId(e.target.value)}
                  autoComplete="off"
                />
              </div>
            </>
          ) : null}
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
                value={selectedCourseTemplate.holeCount}
                readOnly
              />
            </div>
          ) : (
            <div className="scoring-panel__field">
              <label className="scoring-panel__label" htmlFor="hole-count">
                holes (fallback)
              </label>
              <input
                id="hole-count"
                className="scoring-panel__input"
                type="number"
                min={1}
                max={36}
                value={fallbackHoleCount}
                onChange={(e) => {
                  const next = Number(e.target.value)
                  setFallbackHoleCount(Number.isInteger(next) ? next : DEFAULT_ROUND_HOLE_COUNT)
                }}
              />
            </div>
          )}
          <button
            type="button"
            className="scoring-panel__button scoring-panel__button--primary"
            onClick={() => void onCreateRound()}
            disabled={busy || (!selectedCourseTemplate && (!fallbackCourseId.trim() || !fallbackTemplateId.trim()))}
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
                      onClick={() => setSelectedId(id)}
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
                onChange={(e) => setHoleNumber(Number(e.target.value))}
              />
            </div>
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
                max={6}
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
