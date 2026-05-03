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

/** Protected shell: signed-in users can navigate between home and course discovery. */
export function ProtectedApp() {
  const { t } = useTranslation('common')
  const online = useNavigatorOnline()
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
          <div className="app-shell__container app-shell__header-inner">
            <h1 className="app-shell__title">{t('shell.appTitle')}</h1>
            <p className="app-shell__tagline">{t('shell.signInPrompt')}</p>
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
            <h1 className="app-shell__title">{t('shell.appTitle')}</h1>
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
