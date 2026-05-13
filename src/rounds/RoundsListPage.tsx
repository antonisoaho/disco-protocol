import type { User } from 'firebase/auth'
import type { Timestamp } from 'firebase/firestore'
import { useEffect, useReducer } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { subscribeMyRounds, type RoundListItem } from '../firebase/rounds'
import type { RoundDoc } from '../firebase/roundTypes'
import { translateUserError } from '../i18n/translateError'
import { computeParticipantTotals, pickLeadingParticipantIds } from '../scoring/scorecardTable'

type Props = {
  user: User
}

type ListState = {
  items: RoundListItem[]
  error: string | null
}

type ListAction =
  | { type: 'ok'; items: RoundListItem[] }
  | { type: 'err'; message: string }

function listReducer(state: ListState, action: ListAction): ListState {
  switch (action.type) {
    case 'ok':
      return { items: action.items, error: null }
    case 'err':
      return { ...state, error: action.message }
    default:
      return state
  }
}

const initialListState: ListState = { items: [], error: null }

function readParticipantHoleScoresForList(data: RoundDoc, fallbackUid: string) {
  const next: Record<string, Record<string, { strokes: number; par: number }>> = {}
  const participantIdSet = new Set(data.participantIds)
  for (const participantId of data.participantIds) {
    next[participantId] = {}
  }
  if (data.participantHoleScores && Object.keys(data.participantHoleScores).length > 0) {
    for (const [participantId, holeMap] of Object.entries(data.participantHoleScores)) {
      next[participantId] = next[participantId] ?? {}
      for (const [holeKey, score] of Object.entries(holeMap)) {
        next[participantId][holeKey] = { strokes: score.strokes, par: score.par }
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
    next[owner][holeKey] = { strokes: score.strokes, par: score.par }
  }
  return next
}

function formatStartedAt(ts: Timestamp, locale: string): string {
  try {
    return ts.toDate().toLocaleString(locale)
  } catch {
    return ''
  }
}

function formatDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : `${delta}`
}

export function RoundsListPage({ user }: Props) {
  const { t, i18n } = useTranslation('common')
  const uid = user.uid
  const [state, dispatch] = useReducer(listReducer, initialListState)
  const { items, error } = state

  useEffect(() => {
    const unsub = subscribeMyRounds(
      uid,
      (next) => {
        dispatch({ type: 'ok', items: next })
      },
      (err) => {
        dispatch({ type: 'err', message: translateUserError(t, err.message) })
      },
    )
    return () => unsub()
  }, [t, uid])

  const sortedItems = items.toSorted((a, b) => {
    const ams = a.data.startedAt?.toMillis?.() ?? 0
    const bms = b.data.startedAt?.toMillis?.() ?? 0
    return bms - ams
  })

  return (
    <section className="rounds-list-page" aria-labelledby="rounds-list-title">
      <h2 id="rounds-list-title" className="rounds-list-page__title">
        {t('rounds.list.title')}
      </h2>
      <p className="rounds-list-page__count" aria-live="polite">
        {t('rounds.list.countLabel', { count: items.length })}
      </p>
      {error ? (
        <p className="rounds-list-page__error" role="alert">
          {error}
        </p>
      ) : null}
      {sortedItems.length === 0 ? (
        <p className="rounds-list-page__muted">{t('rounds.list.empty')}</p>
      ) : (
        <ul className="rounds-list-page__list">
          {sortedItems.map(({ id, data }) => {
            const name =
              data.courseSource === 'fresh'
                ? (data.courseDraft?.name ?? t('scoring.rounds.unnamed'))
                : (data.courseName ?? t('scoring.rounds.unnamed'))
            const scores = readParticipantHoleScoresForList(data, data.ownerId)
            const totals = computeParticipantTotals(data.participantIds, scores)
            const leaders = pickLeadingParticipantIds(data.participantIds, totals)
            const leaderDelta = leaders.length > 0 ? (totals[leaders[0]]?.totalDelta ?? 0) : 0
            const leaderSummary =
              leaders.length > 0 ? `${formatDelta(leaderDelta)}` : t('scoring.rounds.noScores')
            return (
              <li key={id} className="rounds-list-page__item">
                <Link to={`/rounds/${id}/scorecard`} className="rounds-list-page__link">
                  <strong>{name}</strong>
                  <span className="rounds-list-page__meta">
                    {formatStartedAt(data.startedAt, i18n.language)}
                    {data.completedAt ? ` · ${t('scoring.rounds.completed')}` : ''} · {leaderSummary}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
