import { FirebaseError } from 'firebase/app'
import { type FormEvent, useState } from 'react'
import { useAuth } from './useAuth'

function formatAuthError(err: unknown): string {
  const code = err instanceof FirebaseError ? err.code : null
  const message = err instanceof Error ? err.message : ''

  if (
    code === 'auth/invalid-credential' ||
    code === 'auth/wrong-password' ||
    code === 'auth/invalid-login-credentials' ||
    code === 'auth/user-not-found' ||
    message.includes('auth/invalid-credential') ||
    message.includes('auth/wrong-password') ||
    message.includes('auth/invalid-login-credentials')
  ) {
    return 'Invalid email or password.'
  }
  if (code === 'auth/email-already-in-use' || message.includes('auth/email-already-in-use')) {
    return 'That email is already registered. Try signing in.'
  }
  if (code === 'auth/weak-password' || message.includes('auth/weak-password')) {
    return 'Password should be at least 6 characters.'
  }
  if (code === 'auth/invalid-email' || message.includes('auth/invalid-email')) {
    return 'Enter a valid email address.'
  }
  if (code === 'auth/too-many-requests' || message.includes('auth/too-many-requests')) {
    return 'Too many attempts. Wait a bit and try again.'
  }
  if (code === 'auth/network-request-failed' || message.includes('auth/network-request-failed')) {
    return 'Network error. Check your connection and try again.'
  }
  return message.replace(/^Firebase:\s*/i, '').replace(/\s*\(auth\/[^)]+\)\s*\.?$/, '') || 'Something went wrong.'
}

export function AuthPanel() {
  const { signInWithEmail, signUpWithEmail } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (mode === 'signin') {
        await signInWithEmail(email, password)
      } else {
        await signUpWithEmail(email, password)
      }
    } catch (err) {
      setError(formatAuthError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="auth-panel card" aria-labelledby="auth-heading">
      <h2 id="auth-heading" className="auth-panel__title">
        {mode === 'signin' ? 'Sign in' : 'Create account'}
      </h2>
      <p className="auth-panel__hint">Email and password (OAuth can be added later).</p>

      <form className="auth-panel__form" onSubmit={onSubmit} noValidate>
        <label className="auth-panel__field">
          <span className="auth-panel__label">Email</span>
          <input
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(ev) => setEmail(ev.target.value)}
            required
          />
        </label>
        <label className="auth-panel__field">
          <span className="auth-panel__label">Password</span>
          <input
            type="password"
            name="password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(ev) => setPassword(ev.target.value)}
            required
            minLength={6}
          />
        </label>

        {error ? (
          <p className="auth-panel__error" role="alert">
            {error}
          </p>
        ) : null}

        <button type="submit" disabled={busy}>
          {busy ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Sign up'}
        </button>
      </form>

      <button
        type="button"
        className="outline"
        data-variant="secondary"
        onClick={() => {
          setMode((m) => (m === 'signin' ? 'signup' : 'signin'))
          setError(null)
        }}
      >
        {mode === 'signin' ? 'Need an account? Sign up' : 'Have an account? Sign in'}
      </button>
    </section>
  )
}
