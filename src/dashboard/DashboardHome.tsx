import type { User } from 'firebase/auth'
import type { Timestamp } from 'firebase/firestore'
import { useEffect, useMemo, useReducer } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { listParticipantRoundDeltasChronological } from '../analytics/roundAnalytics'
import { subscribeMyRounds, type RoundListItem } from '../firebase/rounds'
import { subscribeUserDirectory, type UserDirectoryEntry } from '../firebase/userDirectory'
import { translateUserError } from '../i18n/translateError'
import { DeltaAreaChart } from './DeltaAreaChart'

type Props = {
  viewer: User
  /** Whose dashboard to show (may differ from viewer for read-only profile view). */
  profileUid: string
  readOnly?: boolean
}

type DashboardState = {
  items: RoundListItem[]
  directoryEntries: UserDirectoryEntry[]
  loadError: string | null
}

type DashboardAction =
  | { type: 'roundsOk'; items: RoundListItem[] }
  | { type: 'roundsErr'; message: string }
  | { type: 'directoryOk'; entries: UserDirectoryEntry[] }

function dashboardReducer(state: DashboardState, action: DashboardAction): DashboardState {
  switch (action.type) {
    case 'roundsOk':
      return { ...state, items: action.items, loadError: null }
    case 'roundsErr':
      return { ...state, loadError: action.message }
    case 'directoryOk':
      return { ...state, directoryEntries: action.entries }
    default:
      return state
  }
}

const initialDashboardState: DashboardState = {
  items: [],
  directoryEntries: [],
  loadError: null,
}

function formatStartedAt(ts: Timestamp, locale: string): string {
  try {
    return ts.toDate().toLocaleString(locale)
  } catch {
    return ''
  }
}

export function DashboardHome({ viewer, profileUid, readOnly }: Props) {
  const { t, i18n } = useTranslation('common')
  const [state, dispatch] = useReducer(dashboardReducer, initialDashboardState)
  const { items, directoryEntries, loadError } = state

  useEffect(() => {
    const unsubRounds = subscribeMyRounds(
      profileUid,
      (next) => {
        dispatch({ type: 'roundsOk', items: next })
      },
      (err) => {
        dispatch({ type: 'roundsErr', message: translateUserError(t, err.message) })
      },
    )
    const unsubDir = subscribeUserDirectory(
      (entries) => {
        dispatch({ type: 'directoryOk', entries })
      },
      () => {},
    )
    return () => {
      unsubRounds()
      unsubDir()
    }
  }, [profileUid, t])

  const profileLabel = useMemo(() => {
    const hit = directoryEntries.find((e) => e.uid === profileUid)
    if (hit && hit.displayName.trim()) return hit.displayName.trim()
    if (!readOnly && profileUid === viewer.uid) {
      return (
        viewer.displayName?.trim() ||
        viewer.email?.split('@')[0] ||
        profileUid
      )
    }
    return profileUid
  }, [directoryEntries, profileUid, readOnly, viewer.displayName, viewer.email, viewer.uid])

  const trend = listParticipantRoundDeltasChronological(items, profileUid)
  const deltas = trend.map((row) => row.totalDelta)
  const stats =
    deltas.length === 0
      ? { best: null as number | null, average: null as number | null, count: 0 }
      : (() => {
          const sum = deltas.reduce((a, b) => a + b, 0)
          return {
            best: Math.min(...deltas),
            average: sum / deltas.length,
            count: deltas.length,
          }
        })()

  const completedRoundRows = items.filter((row) => row.data.completedAt !== null)

  return (
    <section className="dashboard-home" aria-labelledby="dashboard-home-title">
      <h2 id="dashboard-home-title" className="dashboard-home__title">
        {readOnly ? t('dashboard.publicTitle', { name: profileLabel }) : t('dashboard.title')}
      </h2>
      {loadError ? (
        <p className="dashboard-home__error" role="alert">
          {loadError}
        </p>
      ) : null}

      <div className="dashboard-home__stats" role="group" aria-label={t('dashboard.statsAria')}>
        <div className="dashboard-home__stat">
          <span className="dashboard-home__stat-label">{t('dashboard.bestVsPar')}</span>
          <span className="dashboard-home__stat-value">
            {stats.best === null ? '—' : stats.best > 0 ? `+${stats.best}` : `${stats.best}`}
          </span>
        </div>
        <div className="dashboard-home__stat">
          <span className="dashboard-home__stat-label">{t('dashboard.avgVsPar')}</span>
          <span className="dashboard-home__stat-value">
            {stats.average === null
              ? '—'
              : `${stats.average > 0 ? '+' : ''}${stats.average.toFixed(1)}`}
          </span>
        </div>
        <div className="dashboard-home__stat">
          <span className="dashboard-home__stat-label">{t('dashboard.roundsPlayed')}</span>
          <span className="dashboard-home__stat-value">{stats.count}</span>
        </div>
      </div>

      {deltas.length > 0 ? (
        <div className="dashboard-home__chart-wrap">
          <p className="dashboard-home__chart-caption">{t('dashboard.trendCaption')}</p>
          <DeltaAreaChart deltas={deltas} aria-label={t('dashboard.trendAria')} />
        </div>
      ) : (
        <p className="dashboard-home__muted">{t('dashboard.noCompletedRounds')}</p>
      )}

      {!readOnly ? (
        <div className="dashboard-home__actions">
          <Link to="/rounds/new" className="dashboard-home__cta">
            {t('dashboard.startNewRound')}
          </Link>
          <Link to="/courses" className="dashboard-home__secondary-action">
            {t('dashboard.browseCourses')}
          </Link>
        </div>
      ) : null}

      <div className="dashboard-home__rounds-head">
        <h3 className="dashboard-home__subheading">{t('dashboard.recentRounds')}</h3>
        <Link to="/rounds" className="dashboard-home__rounds-all-link">
          {t('dashboard.viewAllRounds')}
        </Link>
      </div>
      {completedRoundRows.length === 0 ? (
        <p className="dashboard-home__muted">{t('dashboard.noRoundsYet')}</p>
      ) : (
        <ul className="dashboard-home__round-list">
          {completedRoundRows.slice(0, 6).map(({ id, data }) => (
            <li key={id} className="dashboard-home__round-row">
              <Link to={`/rounds/${id}/scorecard`} className="dashboard-home__round-link">
                <span className="dashboard-home__round-name">
                  {data.courseSource === 'fresh'
                    ? (data.courseDraft?.name ?? t('scoring.rounds.unnamed'))
                    : (data.courseName ?? t('scoring.rounds.unnamed'))}
                </span>
                <span className="dashboard-home__round-meta">
                  {formatStartedAt(data.startedAt, i18n.language)}
                  {data.completedAt ? ` · ${t('scoring.rounds.completed')}` : ''}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
