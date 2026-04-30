import { CoursePicker } from '../courses/CoursePicker'
import { AuthPanel } from './AuthPanel'
import { useAuth } from './useAuth'

/**
 * Placeholder “protected shell”: everything inside assumes a signed-in user.
 * Replace with router-based guards when navigation lands.
 */
export function ProtectedApp() {
  const { user, loading, signOut } = useAuth()

  if (loading) {
    return (
      <div className="app-shell">
        <main className="app-shell__main app-shell__main--centered">
          <p className="app-shell__placeholder">Loading session…</p>
        </main>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="app-shell">
        <header className="app-shell__header">
          <h1 className="app-shell__title">Disc Golf Social</h1>
          <p className="app-shell__tagline">Sign in to continue.</p>
        </header>
        <main className="app-shell__main">
          <AuthPanel />
        </main>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <header className="app-shell__header app-shell__header--row">
        <div>
          <h1 className="app-shell__title">Disc Golf Social</h1>
          <p className="app-shell__tagline app-shell__tagline--compact">
            {user.displayName || user.email}
          </p>
        </div>
        <button type="button" className="app-shell__sign-out" onClick={() => void signOut()}>
          Sign out
        </button>
      </header>
      <main className="app-shell__main">
        <p className="app-shell__placeholder">
          Signed in. Your profile is at <code className="app-shell__code">users/{user.uid}</code>. Pick a course for
          the next round (templates live under each course in Firestore).
        </p>
        <CoursePicker />
      </main>
    </div>
  )
}
