import { useCallback, useEffect, useReducer, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, Route, Routes } from 'react-router-dom'
import { CoursePicker } from '../courses/CoursePicker'
import type { CourseRoundSelection } from '../courses/courseData'
import { DashboardHome } from '../dashboard/DashboardHome'
import { PublicPlayerDashboard } from '../dashboard/PublicPlayerDashboard'
import { AuthPanel } from './AuthPanel'
import { useAuth } from './useAuth'
import {
  normalizeDisplayName,
  setCourseFavorite,
  subscribeFavoriteCourseIds,
} from '../firebase/userProfile'
import { ProfilePage } from '../profile/ProfilePage'
import { PlayersPage } from '../players/PlayersPage'
import { NewRoundPage } from '../rounds/NewRoundPage'
import { RoundScorecardPage } from '../rounds/RoundScorecardPage'
import { RoundsListPage } from '../rounds/RoundsListPage'
import { BottomNav } from '../shell/BottomNav'
import { useNavigatorOnline } from '../shell/useNavigatorOnline'
import { useTheme } from '../theme/useTheme'

type FavoriteState = {
  courseIds: string[]
  error: string | null
}

type FavoriteAction =
  | { type: 'syncOk'; courseIds: string[] }
  | { type: 'syncFailed'; message: string }
  | { type: 'clearError' }
  | { type: 'setError'; message: string }

function favoriteReducer(state: FavoriteState, action: FavoriteAction): FavoriteState {
  switch (action.type) {
    case 'syncOk':
      return { courseIds: action.courseIds, error: null }
    case 'syncFailed':
      return { ...state, error: action.message }
    case 'clearError':
      return { ...state, error: null }
    case 'setError':
      return { ...state, error: action.message }
    default:
      return state
  }
}

const initialFavoriteState: FavoriteState = { courseIds: [], error: null }

function ThemeToggleButton({ theme, onToggle }: { theme: 'dark' | 'light'; onToggle: () => void }) {
  return (
    <button
      type="button"
      className="app-shell__theme-toggle"
      onClick={onToggle}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-pressed={theme === 'light'}
    >
      {theme === 'dark' ? (
        <svg aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        <svg aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  )
}

/** Protected shell: signed-in users navigate via bottom bar and routed views. */
export function ProtectedApp() {
  const { t } = useTranslation('common')
  const online = useNavigatorOnline()
  const { theme, toggleTheme } = useTheme()
  const { user, loading, signOut, profileDisplayName, userProfileProvisionError, retryUserProfileProvision } =
    useAuth()
  const [signOutError, setSignOutError] = useState<string | null>(null)
  const [selectedCourseTemplate, setSelectedCourseTemplate] = useState<CourseRoundSelection | null>(null)
  const [favoriteState, dispatchFavorite] = useReducer(favoriteReducer, initialFavoriteState)

  useEffect(() => {
    if (!user) return
    const unsub = subscribeFavoriteCourseIds(
      user.uid,
      (next) => {
        dispatchFavorite({ type: 'syncOk', courseIds: next })
      },
      () => {
        dispatchFavorite({ type: 'syncFailed', message: t('courses.errors.favoriteSyncFailed') })
      },
    )
    return () => unsub()
  }, [t, user])

  const onToggleFavoriteCourse = useCallback(
    async (courseId: string, isFavorite: boolean) => {
      if (!user) return
      dispatchFavorite({ type: 'clearError' })
      try {
        await setCourseFavorite({
          uid: user.uid,
          courseId,
          isFavorite,
        })
      } catch {
        dispatchFavorite({ type: 'setError', message: t('courses.errors.favoriteUpdateFailed') })
      }
    },
    [t, user],
  )

  if (loading) {
    return (
      <div className="app-shell">
        <main className="app-shell__main">
          <div className="app-shell__container app-shell__main--centered">
            <img
              className="app-shell__loading-logo"
              src="/logo.svg"
              alt={t('shell.logoAlt')}
              width={176}
              height={50}
              decoding="async"
            />
            <p className="app-shell__placeholder">{t('shell.loadingSession')}</p>
          </div>
        </main>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="app-shell">
        <header className="app-shell__header">
          <div className="app-shell__container app-shell__header-inner app-shell__header--row">
            <div className="app-shell__header-main">
              <h1 className="app-shell__title app-shell__title--brand">
                <img
                  className="app-shell__brand-logo"
                  src="/logo.svg"
                  alt={t('shell.logoAlt')}
                  width={176}
                  height={50}
                  decoding="async"
                />
              </h1>
              <p className="app-shell__tagline">{t('shell.signInPrompt')}</p>
            </div>
            <ThemeToggleButton theme={theme} onToggle={toggleTheme} />
          </div>
        </header>
        <main className="app-shell__main">
          <div className="app-shell__container">
            <AuthPanel />
          </div>
        </main>
      </div>
    )
  }

  const currentDisplayName =
    profileDisplayName ||
    normalizeDisplayName(user.displayName ?? '') ||
    user.email?.split('@')[0] ||
    user.uid

  return (
    <div className="app-shell">
      <header className="app-shell__header">
        <div className="app-shell__container app-shell__header-inner app-shell__header--row">
          <div className="app-shell__header-main">
            <h1 className="app-shell__title app-shell__title--brand">
              <img
                className="app-shell__brand-logo"
                src="/logo.svg"
                alt={t('shell.logoAlt')}
                width={176}
                height={50}
                decoding="async"
              />
            </h1>
            <p className="app-shell__tagline app-shell__tagline--compact">
              {currentDisplayName || user.email}
            </p>
          </div>
          <div className="app-shell__header-actions">
            <ThemeToggleButton theme={theme} onToggle={toggleTheme} />
            <button
              type="button"
              className="app-shell__sign-out"
              onClick={() => {
                setSignOutError(null)
                void signOut().catch(() => {
                  setSignOutError(t('shell.signOutError'))
                })
              }}
            >
              {t('shell.signOut')}
            </button>
          </div>
        </div>
      </header>
      {signOutError ? (
        <div className="app-shell__container app-shell__status">
          <p className="app-shell__placeholder app-shell__placeholder--error" role="alert">
            {signOutError}
          </p>
        </div>
      ) : null}
      {favoriteState.error ? (
        <div className="app-shell__container app-shell__status">
          <p className="app-shell__placeholder app-shell__placeholder--error" role="alert">
            {favoriteState.error}
          </p>
        </div>
      ) : null}
      {!online ? (
        <div className="app-shell__container app-shell__status">
          <p className="app-shell__placeholder" role="status">
            {t('shell.offlineBanner')}
          </p>
        </div>
      ) : null}
      {userProfileProvisionError ? (
        <div className="app-shell__container app-shell__status app-shell__status--row">
          <p className="app-shell__placeholder app-shell__placeholder--error" role="alert">
            {userProfileProvisionError}
          </p>
          <button
            type="button"
            className="app-shell__retry-btn"
            onClick={() => {
              void retryUserProfileProvision()
            }}
          >
            {t('shell.retryUserProfileSync')}
          </button>
        </div>
      ) : null}
      <main className="app-shell__main app-shell__main--with-bottom-nav">
        <div className="app-shell__container">
          <Routes>
            <Route path="/" element={<DashboardHome viewer={user} profileUid={user.uid} />} />
            <Route path="/rounds" element={<RoundsListPage user={user} />} />
            <Route
              path="/rounds/new"
              element={<NewRoundPage user={user} favoriteCourseIds={favoriteState.courseIds} />}
            />
            <Route path="/rounds/:roundId/scorecard" element={<RoundScorecardPage user={user} />} />
            <Route path="/players" element={<PlayersPage user={user} />} />
            <Route path="/players/:userId" element={<PublicPlayerDashboard viewer={user} />} />
            <Route
              path="/courses"
              element={
                <div className="app-shell__flow">
                  <CoursePicker
                    selection={selectedCourseTemplate}
                    onSelectionChange={setSelectedCourseTemplate}
                    favoriteCourseIds={favoriteState.courseIds}
                    onToggleFavoriteCourse={onToggleFavoriteCourse}
                  />
                </div>
              }
            />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>
      <BottomNav />
    </div>
  )
}
