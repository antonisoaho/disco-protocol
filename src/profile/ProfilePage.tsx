import { updateProfile } from 'firebase/auth'
import { type FormEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/useAuth'
import {
  DISPLAY_NAME_MAX_LENGTH,
  normalizeDisplayName,
  updateUserDisplayName,
  validateDisplayName,
} from '../firebase/userProfile'

const NON_WHITESPACE_PATTERN = '.*\\S.*'

export function ProfilePage() {
  const { user, profileDisplayName } = useAuth()
  const { t } = useTranslation('common')
  const [displayNameError, setDisplayNameError] = useState<string | null>(null)
  const [displayNameNotice, setDisplayNameNotice] = useState<string | null>(null)
  const [isSavingDisplayName, setIsSavingDisplayName] = useState(false)

  if (!user) {
    return null
  }

  const sessionUser = user

  const currentDisplayName =
    profileDisplayName ||
    normalizeDisplayName(sessionUser.displayName ?? '') ||
    sessionUser.email?.split('@')[0] ||
    sessionUser.uid

  function resolveDisplayNameError(input: HTMLInputElement): string {
    if (input.validity.valueMissing || input.validity.patternMismatch) {
      return t('profile.errors.displayNameRequired')
    }
    if (input.validity.tooLong) {
      return t('profile.errors.displayNameTooLong', { max: DISPLAY_NAME_MAX_LENGTH })
    }
    return input.validationMessage || t('profile.errors.displayNameRequired')
  }

  async function onSaveDisplayName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const input = event.currentTarget.elements.namedItem('displayName')
    if (!(input instanceof HTMLInputElement)) return

    setDisplayNameError(null)
    setDisplayNameNotice(null)

    if (!input.checkValidity()) {
      setDisplayNameError(resolveDisplayNameError(input))
      return
    }

    const draftDisplayName = input.value
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
    if (normalized === currentDisplayName) {
      return
    }

    setIsSavingDisplayName(true)
    try {
      const savedDisplayName = await updateUserDisplayName({
        uid: sessionUser.uid,
        displayName: normalized,
      })
      try {
        await updateProfile(sessionUser, { displayName: savedDisplayName })
        setDisplayNameNotice(t('profile.messages.displayNameSaved'))
      } catch {
        setDisplayNameNotice(t('profile.messages.displayNameSavedLocalOnly'))
      }
    } catch {
      setDisplayNameError(t('profile.errors.displayNameUpdateFailed'))
    } finally {
      setIsSavingDisplayName(false)
    }
  }

  return (
    <div className="app-shell__flow">
      <section className="app-shell__profile">
        <h2 className="app-shell__section-title">{t('profile.title')}</h2>
        <p className="app-shell__placeholder">
          {t('profile.currentDisplayName', { displayName: currentDisplayName })}
        </p>
        <form
          className="app-shell__profile-form"
          onSubmit={(event) => {
            void onSaveDisplayName(event)
          }}
          noValidate
        >
          <label className="app-shell__profile-field">
            <span className="app-shell__profile-label">{t('profile.displayName')}</span>
            <input
              className="app-shell__profile-input"
              name="displayName"
              defaultValue={currentDisplayName}
              key={`${sessionUser.uid}:${profileDisplayName ?? ''}:${currentDisplayName}`}
              required
              maxLength={DISPLAY_NAME_MAX_LENGTH}
              pattern={NON_WHITESPACE_PATTERN}
              autoComplete="nickname"
              onChange={(event) => {
                setDisplayNameNotice(null)
                if (displayNameError && event.currentTarget.validity.valid) {
                  setDisplayNameError(null)
                }
              }}
              onInvalid={(event) => {
                event.preventDefault()
                setDisplayNameNotice(null)
                setDisplayNameError(resolveDisplayNameError(event.currentTarget))
              }}
              aria-invalid={displayNameError ? 'true' : 'false'}
            />
          </label>
          <div className="app-shell__profile-actions">
            <button
              type="submit"
              disabled={isSavingDisplayName}
            >
              {isSavingDisplayName ? t('profile.actions.saving') : t('profile.actions.save')}
            </button>
          </div>
        </form>
        {displayNameError ? (
          <p className="app-shell__placeholder app-shell__placeholder--error" role="alert">
            {displayNameError}
          </p>
        ) : null}
        {displayNameNotice ? (
          <p className="app-shell__placeholder app-shell__placeholder--success">
            {displayNameNotice}
          </p>
        ) : null}
      </section>
    </div>
  )
}
