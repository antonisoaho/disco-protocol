import { type User } from 'firebase/auth'
import type { Timestamp } from 'firebase/firestore'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { strokesParDeltaToSemantic } from '../lib/scoreSemantic'
import type { RoundDoc, RoundVisibility } from '../firebase/roundTypes'
import {
  addParticipantToRound,
  createRound,
  markRoundCompleted,
  recordHoleScoreTransaction,
  subscribeMyRounds,
} from '../firebase/rounds'

type Props = {
  user: User
}

function formatStartedAt(ts: Timestamp): string {
  try {
    return ts.toDate().toLocaleString()
  } catch {
    return ''
  }
}

export function ScoringPanel({ user }: Props) {
  const uid = user.uid
  const [items, setItems] = useState<{ id: string; data: RoundDoc }[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [courseId, setCourseId] = useState('demo-course')
  const [templateId, setTemplateId] = useState('demo-template')
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

  const onCreateRound = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const id = await createRound({
        ownerId: uid,
        courseId: courseId.trim() || 'demo-course',
        templateId: templateId.trim() || 'demo-template',
        visibility,
        participantIds: [uid],
      })
      setSelectedId(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create round')
    } finally {
      setBusy(false)
    }
  }, [courseId, templateId, uid, visibility])

  const onSaveHole = useCallback(async () => {
    if (!selectedId) return
    setBusy(true)
    setError(null)
    try {
      await recordHoleScoreTransaction(selectedId, uid, holeNumber, strokes, par)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save hole')
    } finally {
      setBusy(false)
    }
  }, [holeNumber, par, selectedId, strokes, uid])

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
        <span className="scoring-panel__label">Start a round (course/template ids stub until Course epic)</span>
        <div className="scoring-panel__row">
          <div className="scoring-panel__field">
            <label className="scoring-panel__label" htmlFor="course-id">
              courseId
            </label>
            <input
              id="course-id"
              className="scoring-panel__input"
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="scoring-panel__field">
            <label className="scoring-panel__label" htmlFor="template-id">
              templateId
            </label>
            <input
              id="template-id"
              className="scoring-panel__input"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              autoComplete="off"
            />
          </div>
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
          <button
            type="button"
            className="scoring-panel__button scoring-panel__button--primary"
            onClick={() => void onCreateRound()}
            disabled={busy}
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
              return (
                <li key={id} className="scoring-panel__list-item">
                  <div>
                    <strong>{id}</strong>
                    <p className="scoring-panel__muted">
                      {data.visibility} · {formatStartedAt(data.startedAt)}
                      {data.completedAt ? ' · completed' : ''}
                    </p>
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
                max={27}
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
