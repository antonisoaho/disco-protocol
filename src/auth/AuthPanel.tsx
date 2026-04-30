import { type FormEvent, useState } from 'react'
import { useAuth } from './useAuth'

function formatAuthError(message: string): string {
  if (message.includes('auth/invalid-credential') || message.includes('auth/wrong-password')) {
    return 'Invalid email or password.'
  }
  if (message.includes('auth/email-already-in-use')) {
    return 'That email is already registered. Try signing in.'
  }
  if (message.includes('auth/weak-password')) {
    return 'Password should be at least 6 characters.'
  }
  if (message.includes('auth/invalid-email')) {
    return 'Enter a valid email address.'
  }
  return message.replace(/^Firebase:\s*/i, '').replace(/\s*\(auth\/[^)]+\)\s*\.?$/, '')
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
      const msg = err instanceof Error ? err.message : 'Something went wrong.'
      setError(formatAuthError(msg))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="auth-panel" aria-labelledby="auth-heading">
      <h2 id="auth-heading" className="auth-panel__title">
        {mode === 'signin' ? 'Sign in' : 'Create account'}
      </h2>
      <p className="auth-panel__hint">Email and password (OAuth can be added later).</p>

      <form className="auth-panel__form" onSubmit={onSubmit} noValidate>
        <label className="auth-panel__field">
          <span className="auth-panel__label">Email</span>
          <input
            className="auth-panel__input"
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
            className="auth-panel__input"
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

        <button className="auth-panel__submit" type="submit" disabled={busy}>
          {busy ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Sign up'}
        </button>
      </form>

      <button
        type="button"
        className="auth-panel__toggle"
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
