import { FirebaseError } from 'firebase/app'
import type { TFunction } from 'i18next'
import { type FormEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from './useAuth'

function formatAuthError(err: unknown, t: TFunction<'common'>): string {
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
    return t('auth.errors.invalidCredentials')
  }
  if (code === 'auth/email-already-in-use' || message.includes('auth/email-already-in-use')) {
    return t('auth.errors.emailAlreadyUsed')
  }
  if (code === 'auth/weak-password' || message.includes('auth/weak-password')) {
    return t('auth.errors.weakPassword')
  }
  if (code === 'auth/invalid-email' || message.includes('auth/invalid-email')) {
    return t('auth.errors.invalidEmail')
  }
  if (code === 'auth/too-many-requests' || message.includes('auth/too-many-requests')) {
    return t('auth.errors.tooManyRequests')
  }
  if (code === 'auth/network-request-failed' || message.includes('auth/network-request-failed')) {
    return t('auth.errors.network')
  }
  return (
    message.replace(/^Firebase:\s*/i, '').replace(/\s*\(auth\/[^)]+\)\s*\.?$/, '') ||
    t('auth.errors.generic')
  )
}

export function AuthPanel() {
  const { t } = useTranslation('common')
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
      setError(formatAuthError(err, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="auth-panel card" aria-labelledby="auth-heading">
      <h2 id="auth-heading" className="auth-panel__title">
        {mode === 'signin' ? t('auth.title.signIn') : t('auth.title.createAccount')}
      </h2>
      <p className="auth-panel__hint">{t('auth.hint')}</p>

      <form className="auth-panel__form" onSubmit={onSubmit} noValidate>
        <label className="auth-panel__field">
          <span className="auth-panel__label">{t('auth.fields.email')}</span>
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
          <span className="auth-panel__label">{t('auth.fields.password')}</span>
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
          {busy ? t('auth.actions.working') : mode === 'signin' ? t('auth.actions.signIn') : t('auth.actions.signUp')}
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
        {mode === 'signin' ? t('auth.actions.needAccount') : t('auth.actions.haveAccount')}
      </button>
    </section>
  )
}
