import { useState } from 'react'
import { CoursePicker } from '../courses/CoursePicker'
import type { CourseRoundSelection } from '../courses/courseData'
import { AuthPanel } from './AuthPanel'
import { useAuth } from './useAuth'
import { ScoringPanel } from '../scoring/ScoringPanel'

/**
 * Placeholder “protected shell”: everything inside assumes a signed-in user.
 * Replace with router-based guards when navigation lands.
 */
export function ProtectedApp() {
  const { user, loading, signOut } = useAuth()
  const [signOutError, setSignOutError] = useState<string | null>(null)
  const [selectedCourseTemplate, setSelectedCourseTemplate] = useState<CourseRoundSelection | null>(null)

  if (loading) {
    return (
      <div className="app-shell">
        <main className="app-shell__main app-shell__main--centered container">
          <p className="app-shell__placeholder">Loading session…</p>
        </main>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="app-shell">
        <header className="app-shell__header container">
          <h1 className="app-shell__title">Disc Golf Social</h1>
          <p className="app-shell__tagline">Sign in to continue.</p>
        </header>
        <main className="app-shell__main container">
          <AuthPanel />
        </main>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <header className="app-shell__header app-shell__header--row container">
        <div>
          <h1 className="app-shell__title">Disc Golf Social</h1>
          <p className="app-shell__tagline app-shell__tagline--compact">
            {user.displayName || user.email}
          </p>
        </div>
        <button
          type="button"
          className="app-shell__sign-out outline"
          data-variant="secondary"
          onClick={() => {
            setSignOutError(null)
            void signOut().catch(() => {
              setSignOutError('Could not sign out. Try again.')
            })
          }}
        >
          Sign out
        </button>
      </header>
      {signOutError ? (
        <p className="app-shell__placeholder" role="alert" data-variant="error">
          {signOutError}
        </p>
      ) : null}
      <main className="app-shell__main container">
        <section className="app-shell__intro card">
          <p className="app-shell__placeholder">
            Signed in. Your profile is at <code className="app-shell__code">users/{user.uid}</code>. Pick a course
            for the next round, then use shared rounds and offline scoring below.
          </p>
        </section>
        <CoursePicker selection={selectedCourseTemplate} onSelectionChange={setSelectedCourseTemplate} />
        <ScoringPanel user={user} selectedCourseTemplate={selectedCourseTemplate} />
      </main>
    </div>
  )
}
