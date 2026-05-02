import { updateProfile, type User } from 'firebase/auth'
import { type FormEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'

const DISPLAY_NAME_MAX_LENGTH = 80
const NON_WHITESPACE_PATTERN = '.*\\S.*'

type Props = {
  user: User
}

export function ProfileDisplayName({ user }: Props) {
  const { t } = useTranslation('common')
  const initialDisplayName = user.displayName?.trim() ?? ''
  const [displayName, setDisplayName] = useState(initialDisplayName)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  function resolveError(input: HTMLInputElement): string {
    if (input.validity.valueMissing || input.validity.patternMismatch) {
      return t('shell.profile.errors.required')
    }
    if (input.validity.tooLong) {
      return t('shell.profile.errors.tooLong', { max: DISPLAY_NAME_MAX_LENGTH })
    }
    return input.validationMessage || t('shell.profile.errors.required')
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const input = event.currentTarget.elements.namedItem('displayName')
    if (!(input instanceof HTMLInputElement)) {
      return
    }

    setSaved(false)
    setError(null)
    if (!input.checkValidity()) {
      setError(resolveError(input))
      return
    }

    const normalizedDisplayName = displayName.trim().replace(/\s+/g, ' ')
    if (normalizedDisplayName === initialDisplayName) {
      setDisplayName(normalizedDisplayName)
      setSaved(true)
      return
    }

    setBusy(true)
    try {
      await updateProfile(user, { displayName: normalizedDisplayName })
      setDisplayName(normalizedDisplayName)
      setSaved(true)
    } catch {
      setError(t('shell.profile.errors.updateFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="app-shell__profile card" aria-labelledby="profile-display-name-title">
      <h2 id="profile-display-name-title" className="app-shell__profile-title">
        {t('shell.profile.title')}
      </h2>
      <form className="app-shell__profile-form" onSubmit={(event) => void onSubmit(event)} noValidate>
        <label className="field" htmlFor="profile-display-name">
          <span className="field__label">{t('shell.profile.fields.displayName')}</span>
          <input
            id="profile-display-name"
            name="displayName"
            className={`field__control${error ? ' field__control--invalid' : ''}`}
            value={displayName}
            onChange={(event) => {
              setDisplayName(event.target.value)
              setSaved(false)
              if (error && event.currentTarget.validity.valid) {
                setError(null)
              }
            }}
            onInvalid={(event) => {
              event.preventDefault()
              setSaved(false)
              setError(resolveError(event.currentTarget))
            }}
            required
            maxLength={DISPLAY_NAME_MAX_LENGTH}
            pattern={NON_WHITESPACE_PATTERN}
            autoComplete="nickname"
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={error ? 'profile-display-name-error' : undefined}
            disabled={busy}
          />
        </label>
        {error ? (
          <p id="profile-display-name-error" className="field__error" role="alert">
            {error}
          </p>
        ) : null}
        {saved ? <p className="app-shell__profile-status">{t('shell.profile.status.saved')}</p> : null}
        <button type="submit" disabled={busy}>
          {busy ? t('shell.profile.actions.saving') : t('shell.profile.actions.save')}
        </button>
      </form>
    </section>
  )
}
