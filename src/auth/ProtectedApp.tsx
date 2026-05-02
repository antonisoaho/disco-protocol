import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { CoursePicker } from '../courses/CoursePicker'
import type { CourseRoundSelection } from '../courses/courseData'
import { AuthPanel } from './AuthPanel'
import { useAuth } from './useAuth'
import { ScoringPanel } from '../scoring/ScoringPanel'

/** Protected shell: signed-in users can navigate between home and course discovery. */
export function ProtectedApp() {
  const { t } = useTranslation('common')
  const { user, loading, signOut } = useAuth()
  const [signOutError, setSignOutError] = useState<string | null>(null)
  const [selectedCourseTemplate, setSelectedCourseTemplate] = useState<CourseRoundSelection | null>(null)

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

  return (
    <div className="app-shell">
      <header className="app-shell__header">
        <div className="app-shell__container app-shell__header-inner app-shell__header--row">
          <div className="app-shell__header-main">
            <h1 className="app-shell__title">{t('shell.appTitle')}</h1>
            <p className="app-shell__tagline app-shell__tagline--compact">
              {user.displayName || user.email}
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
      <main className="app-shell__main">
        <div className="app-shell__container">
          <Routes>
            <Route
              path="/"
              element={
                <>
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
                  <ScoringPanel user={user} selectedCourseTemplate={selectedCourseTemplate} />
                </>
              }
            />
            <Route
              path="/courses"
              element={
                <>
                  <section className="app-shell__intro card">
                    <p className="app-shell__placeholder">
                      {t('shell.coursesIntro')}
                    </p>
                    <Link className="app-shell__link" to="/">
                      {t('shell.backToRoundSetup')}
                    </Link>
                  </section>
                  <CoursePicker selection={selectedCourseTemplate} onSelectionChange={setSelectedCourseTemplate} />
                </>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}
