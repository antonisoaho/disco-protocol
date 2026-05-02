import { useCallback, useEffect, useState } from 'react'
import { updateProfile } from 'firebase/auth'
import { useTranslation } from 'react-i18next'
import { Link, NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { CoursePicker } from '../courses/CoursePicker'
import type { CourseRoundSelection } from '../courses/courseData'
import { AuthPanel } from './AuthPanel'
import { useAuth } from './useAuth'
import { ScoringPanel } from '../scoring/ScoringPanel'
import {
  DISPLAY_NAME_MAX_LENGTH,
  normalizeDisplayName,
  setCourseFavorite,
  subscribeFavoriteCourseIds,
  updateUserDisplayName,
  validateDisplayName,
} from '../firebase/userProfile'

/** Protected shell: signed-in users can navigate between home and course discovery. */
export function ProtectedApp() {
  const { t } = useTranslation('common')
  const { user, loading, signOut } = useAuth()
  const [signOutError, setSignOutError] = useState<string | null>(null)
  const [selectedCourseTemplate, setSelectedCourseTemplate] = useState<CourseRoundSelection | null>(null)
  const [favoriteCourseIds, setFavoriteCourseIds] = useState<string[]>([])
  const [favoriteCourseError, setFavoriteCourseError] = useState<string | null>(null)
  const [displayNameError, setDisplayNameError] = useState<string | null>(null)
  const [displayNameNotice, setDisplayNameNotice] = useState<string | null>(null)
  const [isSavingDisplayName, setIsSavingDisplayName] = useState(false)

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

  const onSaveDisplayName = useCallback(async (draftDisplayName: string) => {
    if (!user) return
    setDisplayNameError(null)
    setDisplayNameNotice(null)
    const validationError = validateDisplayName(draftDisplayName)
    if (validationError === 'empty') {
      setDisplayNameError(t('profile.errors.displayNameRequired'))
      return
    }
    if (validationError === 'tooLong') {
      setDisplayNameError(t('profile.errors.displayNameTooLong', { max: DISPLAY_NAME_MAX_LENGTH }))
      return
    }
    const normalized = normalizeDisplayName(draftDisplayName)
    const currentDisplayName =
      normalizeDisplayName(user.displayName ?? '') ||
      user.email?.split('@')[0] ||
      user.uid
    if (normalized === currentDisplayName) {
      return
    }
    setIsSavingDisplayName(true)
    try {
      const savedDisplayName = await updateUserDisplayName({
        uid: user.uid,
        displayName: normalized,
      })
      await updateProfile(user, { displayName: savedDisplayName })
      setDisplayNameNotice(t('profile.messages.displayNameSaved'))
    } catch {
      setDisplayNameError(t('profile.errors.displayNameUpdateFailed'))
    } finally {
      setIsSavingDisplayName(false)
    }
  }, [t, user])

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
            </nav>
          </div>
          <button
            type="button"
            className="app-shell__sign-out outline"
            data-variant="secondary"
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
          <p className="app-shell__placeholder" role="alert" data-variant="error">
            {signOutError}
          </p>
        </div>
      ) : null}
      {favoriteCourseError ? (
        <div className="app-shell__container app-shell__status">
          <p className="app-shell__placeholder" role="alert" data-variant="error">
            {favoriteCourseError}
          </p>
        </div>
      ) : null}
      <main className="app-shell__main">
        <div className="app-shell__container">
          <Routes>
            <Route
              path="/"
              element={
                <div className="app-shell__flow">
                  <section className="app-shell__profile card">
                    <h2 className="app-shell__section-title">{t('profile.title')}</h2>
                    <p className="app-shell__placeholder">
                      {t('profile.currentDisplayName', { displayName: currentDisplayName })}
                    </p>
                    <form
                      className="app-shell__profile-form"
                      onSubmit={(event) => {
                        event.preventDefault()
                        const formData = new FormData(event.currentTarget)
                        const draftDisplayName = String(formData.get('displayName') ?? '')
                        void onSaveDisplayName(draftDisplayName)
                      }}
                    >
                      <label className="app-shell__profile-field">
                        <span className="app-shell__profile-label">{t('profile.displayName')}</span>
                        <input
                          className="app-shell__profile-input"
                          name="displayName"
                          defaultValue={currentDisplayName}
                          key={`${user.uid}:${currentDisplayName}`}
                          maxLength={DISPLAY_NAME_MAX_LENGTH}
                        />
                      </label>
                      <div className="app-shell__profile-actions">
                        <button
                          type="submit"
                          className="outline"
                          data-variant="secondary"
                          disabled={isSavingDisplayName}
                        >
                          {isSavingDisplayName ? t('profile.actions.saving') : t('profile.actions.save')}
                        </button>
                      </div>
                    </form>
                    {displayNameError ? (
                      <p className="app-shell__placeholder" role="alert" data-variant="error">
                        {displayNameError}
                      </p>
                    ) : null}
                    {displayNameNotice ? (
                      <p className="app-shell__placeholder" data-variant="success">
                        {displayNameNotice}
                      </p>
                    ) : null}
                  </section>
                  <section className="app-shell__intro card">
                    <p className="app-shell__placeholder">
                      {t('shell.homeIntro')}
                    </p>
                    <p className="app-shell__placeholder">
                      {t('shell.selectedCourse')}{' '}
                      {selectedCourseTemplate ? (
                        <strong>
                          {selectedCourseTemplate.courseName} — {selectedCourseTemplate.templateLabel}
                        </strong>
                      ) : (
                        t('shell.noneYet')
                      )}
                    </p>
                    <Link className="app-shell__link" to="/courses">
                      {t('shell.browseCourses')}
                    </Link>
                  </section>
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
                  <section className="app-shell__intro card">
                    <p className="app-shell__placeholder">
                      {t('shell.coursesIntro')}
                    </p>
                    <Link className="app-shell__link" to="/">
                      {t('shell.backToRoundSetup')}
                    </Link>
                  </section>
                  <CoursePicker
                    selection={selectedCourseTemplate}
                    onSelectionChange={setSelectedCourseTemplate}
                    favoriteCourseIds={favoriteCourseIds}
                    onToggleFavoriteCourse={onToggleFavoriteCourse}
                  />
                </div>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}
