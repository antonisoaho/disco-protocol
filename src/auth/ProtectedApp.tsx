import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { CoursePicker } from '../courses/CoursePicker'
import type { CourseRoundSelection } from '../courses/courseData'
import { AuthPanel } from './AuthPanel'
import { useAuth } from './useAuth'
import { ScoringPanel } from '../scoring/ScoringPanel'
import {
  normalizeDisplayName,
  setCourseFavorite,
  subscribeFavoriteCourseIds,
} from '../firebase/userProfile'
import { ProfilePage } from '../profile/ProfilePage'
import { useNavigatorOnline } from '../shell/useNavigatorOnline'
import { useTheme } from '../theme/useTheme'

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

/** Protected shell: signed-in users can navigate between home and course discovery. */
export function ProtectedApp() {
  const { t } = useTranslation('common')
  const online = useNavigatorOnline()
  const { theme, toggleTheme } = useTheme()
  const { user, loading, signOut, profileDisplayName, userProfileProvisionError, retryUserProfileProvision } =
    useAuth()
  const [signOutError, setSignOutError] = useState<string | null>(null)
  const [selectedCourseTemplate, setSelectedCourseTemplate] = useState<CourseRoundSelection | null>(null)
  const [favoriteCourseIds, setFavoriteCourseIds] = useState<string[]>([])
  const [favoriteCourseError, setFavoriteCourseError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    const unsub = subscribeFavoriteCourseIds(
      user.uid,
      (next) => {
        setFavoriteCourseIds(next)
        setFavoriteCourseError(null)
      },
      () => {
        setFavoriteCourseError(t('courses.errors.favoriteSyncFailed'))
      },
    )
    return () => unsub()
  }, [t, user])

  const onToggleFavoriteCourse = useCallback(
    async (courseId: string, isFavorite: boolean) => {
      if (!user) return
      setFavoriteCourseError(null)
      try {
        await setCourseFavorite({
          uid: user.uid,
          courseId,
          isFavorite,
        })
      } catch {
        setFavoriteCourseError(t('courses.errors.favoriteUpdateFailed'))
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
            <nav className="app-shell__nav" aria-label={t('shell.nav.primaryAria')}>
              <NavLink to="/" end className={({ isActive }) => `app-shell__nav-link${isActive ? ' app-shell__nav-link--active' : ''}`}>
                {t('shell.nav.home')}
              </NavLink>
              <NavLink
                to="/courses"
                className={({ isActive }) => `app-shell__nav-link${isActive ? ' app-shell__nav-link--active' : ''}`}
              >
                {t('shell.nav.courses')}
              </NavLink>
              <NavLink
                to="/profile"
                className={({ isActive }) => `app-shell__nav-link${isActive ? ' app-shell__nav-link--active' : ''}`}
              >
                {t('shell.profile')}
              </NavLink>
            </nav>
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
      {favoriteCourseError ? (
        <div className="app-shell__container app-shell__status">
          <p className="app-shell__placeholder app-shell__placeholder--error" role="alert">
            {favoriteCourseError}
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
      <main className="app-shell__main">
        <div className="app-shell__container">
          <Routes>
            <Route
              path="/"
              element={
                <div className="app-shell__flow">
                  <ScoringPanel
                    user={user}
                    selectedCourseTemplate={selectedCourseTemplate}
                    favoriteCourseIds={favoriteCourseIds}
                  />
                </div>
              }
            />
            <Route
              path="/courses"
              element={
                <div className="app-shell__flow">
                  <CoursePicker
                    selection={selectedCourseTemplate}
                    onSelectionChange={setSelectedCourseTemplate}
                    favoriteCourseIds={favoriteCourseIds}
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
    </div>
  )
}
