import type { User } from 'firebase/auth'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'
import {
  loadRoundSelectionForCourse,
  subscribeCourses,
  type CourseWithId,
} from '@core/domain/courseData'
import { sortCoursesForRoundStart } from '@core/domain/roundStartSort'
import {
  FreshRoundDraftValidationError,
  normalizeFreshCourseDraft,
} from '@core/domain/freshRoundCourse'
import { createRound } from '@core/domain/rounds'
import { subscribeFollowers, subscribeFollowing } from '@core/users/follows'
import { subscribeUserDirectory, type UserDirectoryEntry } from '@core/users/userDirectory'
import { translateUserError } from '@common/i18n/translateError'
import { formatDraftIssues } from '@common/helpers/formatDraftIssues'
import {
  createAnonymousParticipantId,
  deriveFriendUidSet,
  filterParticipantDirectoryEntries,
  mergeAnonymousParticipants,
  normalizeAnonymousParticipantName,
  type AnonymousParticipant,
} from '@core/domain/participantRoster'

type Props = {
  user: User
  favoriteCourseIds: string[]
  onRoundCreated: (roundId: string) => void
}

type NineOrEighteen = 9 | 18

const ANONYMOUS_NAME_MAX_LENGTH = 80
const NON_WHITESPACE_PATTERN = '.*\\S.*'

function participantDisplayName(entry: UserDirectoryEntry): string {
  return entry.displayName.trim().length > 0 ? entry.displayName : entry.uid
}

export function StartRoundForm({ user, favoriteCourseIds, onRoundCreated }: Props) {
  const { t } = useTranslation('common')
  const location = useLocation()
  const presetCourseId =
    typeof location.state === 'object' &&
    location.state !== null &&
    'courseId' in location.state &&
    typeof (location.state as { courseId?: unknown }).courseId === 'string'
      ? (location.state as { courseId: string }).courseId
      : null

  const uid = user.uid
  const [startCourseSelection, setStartCourseSelection] = useState('fresh')
  const [availableCourses, setAvailableCourses] = useState<CourseWithId[]>([])
  const [courseLoadError, setCourseLoadError] = useState<string | null>(null)
  const [freshCourseName, setFreshCourseName] = useState('')
  const [freshHoleChoice, setFreshHoleChoice] = useState<NineOrEighteen>(18)
  const [newRoundParticipants, setNewRoundParticipants] = useState<string[]>([uid])
  const [newRoundParticipantQuery, setNewRoundParticipantQuery] = useState('')
  const [newRoundAnonymousName, setNewRoundAnonymousName] = useState('')
  const [freshCourseNameError, setFreshCourseNameError] = useState<string | null>(null)
  const [newRoundAnonymousNameError, setNewRoundAnonymousNameError] = useState<string | null>(null)
  const [newRoundAnonymousParticipants, setNewRoundAnonymousParticipants] = useState<AnonymousParticipant[]>([])
  const [directoryEntries, setDirectoryEntries] = useState<UserDirectoryEntry[]>([])
  const [followingIds, setFollowingIds] = useState<string[]>([])
  const [followerIds, setFollowerIds] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const freshCourseNameInputRef = useRef<HTMLInputElement | null>(null)
  const newRoundAnonymousNameInputRef = useRef<HTMLInputElement | null>(null)

  const presetAppliedRef = useRef<string | null>(null)

  useEffect(() => {
    const unsub = subscribeCourses(
      (rows) => {
        setAvailableCourses(rows)
        setCourseLoadError(null)
        if (
          presetCourseId &&
          presetAppliedRef.current !== presetCourseId &&
          rows.some((c) => c.id === presetCourseId)
        ) {
          presetAppliedRef.current = presetCourseId
          setStartCourseSelection(presetCourseId)
        }
      },
      (nextError) => setCourseLoadError(translateUserError(t, nextError.message)),
    )
    return () => unsub()
  }, [presetCourseId, t])

  useEffect(() => {
    const unsub = subscribeUserDirectory(
      (entries) => setDirectoryEntries(entries),
      () => {
        /* directory may be restricted */
      },
    )
    return () => unsub()
  }, [])

  useEffect(() => {
    const unsub = subscribeFollowing(
      uid,
      (edges) => {
        setFollowingIds(Array.from(new Set(edges.map((edge) => edge.followeeUid))))
      },
      () => {},
    )
    return () => unsub()
  }, [uid])

  useEffect(() => {
    const unsub = subscribeFollowers(
      uid,
      (edges) => {
        setFollowerIds(Array.from(new Set(edges.map((edge) => edge.followerUid))))
      },
      () => {},
    )
    return () => unsub()
  }, [uid])

  const resolveFreshCourseNameError = useCallback(
    (input: HTMLInputElement): string => {
      if (input.validity.valueMissing || input.validity.patternMismatch) {
        return t('scoring.errors.courseNameRequired')
      }
      return input.validationMessage || t('scoring.errors.courseNameRequired')
    },
    [t],
  )

  const resolveAnonymousNameError = useCallback(
    (input: HTMLInputElement): string => {
      if (input.validity.valueMissing || input.validity.patternMismatch) {
        return t('scoring.messages.anonymousNameRequired')
      }
      if (input.validity.tooLong) {
        return t('scoring.messages.anonymousNameTooLong', {
          max: ANONYMOUS_NAME_MAX_LENGTH,
        })
      }
      return input.validationMessage || t('scoring.messages.anonymousNameRequired')
    },
    [t],
  )

  const effectiveStartCourseSelection = useMemo(() => {
    if (startCourseSelection === 'fresh') {
      return 'fresh'
    }
    return availableCourses.some((course) => course.id === startCourseSelection)
      ? startCourseSelection
      : 'fresh'
  }, [availableCourses, startCourseSelection])

  const startMode: 'saved' | 'fresh' = effectiveStartCourseSelection === 'fresh' ? 'fresh' : 'saved'
  const sortedRoundStartCourses = useMemo(
    () => sortCoursesForRoundStart(availableCourses, favoriteCourseIds),
    [availableCourses, favoriteCourseIds],
  )
  const selectedSavedCourse = useMemo(
    () => sortedRoundStartCourses.find((course) => course.id === effectiveStartCourseSelection) ?? null,
    [effectiveStartCourseSelection, sortedRoundStartCourses],
  )

  const directoryByUid = useMemo(() => {
    const map: Record<string, UserDirectoryEntry> = {}
    for (const entry of directoryEntries) {
      map[entry.uid] = entry
    }
    if (!map[uid]) {
      map[uid] = {
        uid,
        displayName: user.displayName?.trim() || user.email?.split('@')[0] || t('social.youFallback'),
        subtitle: uid,
      }
    }
    return map
  }, [directoryEntries, t, uid, user.displayName, user.email])

  const allDirectoryEntries = useMemo(
    () =>
      Object.values(directoryByUid).sort((a, b) =>
        participantDisplayName(a).localeCompare(participantDisplayName(b), undefined, {
          sensitivity: 'base',
        }),
      ),
    [directoryByUid],
  )

  const friendUidSet = useMemo(() => deriveFriendUidSet(followingIds, followerIds), [followerIds, followingIds])

  const searchableDirectoryEntries = useMemo(
    () => allDirectoryEntries.filter((entry) => entry.uid !== uid),
    [allDirectoryEntries, uid],
  )

  const availableNewRoundParticipants = useMemo(
    () =>
      filterParticipantDirectoryEntries({
        entries: searchableDirectoryEntries,
        query: newRoundParticipantQuery,
        friendUidSet,
      }),
    [friendUidSet, newRoundParticipantQuery, searchableDirectoryEntries],
  )

  const onAddNewRoundAnonymousParticipant = useCallback(() => {
    const anonymousInput = newRoundAnonymousNameInputRef.current
    if (!anonymousInput) {
      return
    }
    anonymousInput.setCustomValidity('')
    if (newRoundAnonymousName.trim().length === 0) {
      anonymousInput.setCustomValidity(t('scoring.messages.anonymousNameRequired'))
    }
    if (!anonymousInput.checkValidity()) {
      setNewRoundAnonymousNameError(resolveAnonymousNameError(anonymousInput))
      return
    }

    const normalizedName = normalizeAnonymousParticipantName(newRoundAnonymousName)
    const id = createAnonymousParticipantId()
    setNewRoundAnonymousParticipants((current) => [...current, { id, displayName: normalizedName }])
    setNewRoundParticipants((current) => Array.from(new Set([...current, id])))
    setNewRoundAnonymousName('')
    setNewRoundAnonymousNameError(null)
    anonymousInput.setCustomValidity('')
    setError(null)
  }, [newRoundAnonymousName, resolveAnonymousNameError, t])

  const onRemoveNewRoundAnonymousParticipant = useCallback((participantId: string) => {
    setNewRoundAnonymousParticipants((current) =>
      current.filter((participant) => participant.id !== participantId),
    )
    setNewRoundParticipants((current) => current.filter((participant) => participant !== participantId))
  }, [])

  const onCreateRound = useCallback(async () => {
    if (startMode === 'fresh') {
      const freshNameInput = freshCourseNameInputRef.current
      if (freshNameInput) {
        if (!freshNameInput.checkValidity()) {
          setFreshCourseNameError(resolveFreshCourseNameError(freshNameInput))
          return
        }
      }
    }

    setBusy(true)
    setError(null)
    try {
      const participantIds = Array.from(new Set([uid, ...newRoundParticipants])).filter(
        (participantId) => participantId.trim().length > 0,
      )
      const anonymousParticipants = mergeAnonymousParticipants(participantIds, newRoundAnonymousParticipants)
      let id = ''
      if (startMode === 'saved') {
        if (!selectedSavedCourse) {
          setError(t('scoring.errors.selectCourseOrFresh'))
          return
        }
        const selection = await loadRoundSelectionForCourse({
          courseId: selectedSavedCourse.id,
          courseName: selectedSavedCourse.name,
        })
        if (!selection) {
          setError(t('scoring.errors.selectedCourseHasNoTemplates'))
          return
        }
        id = await createRound({
          ownerId: uid,
          courseSource: 'saved',
          courseId: selection.courseId,
          templateId: selection.templateId,
          holeCount: selection.holeCount,
          courseName: selectedSavedCourse.name,
          visibility: 'public',
          participantIds,
          anonymousParticipants,
        })
      } else {
        const courseDraft = normalizeFreshCourseDraft({
          name: freshCourseName,
          holes: Array.from({ length: freshHoleChoice }, () => ({
            par: null,
            lengthMeters: null,
          })),
        })
        id = await createRound({
          ownerId: uid,
          courseSource: 'fresh',
          courseDraft,
          holeCount: courseDraft.holes.length,
          visibility: 'public',
          participantIds,
          anonymousParticipants,
        })
      }
      setFreshCourseNameError(null)
      setNewRoundParticipantQuery('')
      setNewRoundAnonymousName('')
      setNewRoundAnonymousNameError(null)
      setNewRoundAnonymousParticipants([])
      setNewRoundParticipants([uid])
      setFreshHoleChoice(18)
      setStartCourseSelection('fresh')
      setFreshCourseName('')
      onRoundCreated(id)
    } catch (nextError) {
      if (nextError instanceof FreshRoundDraftValidationError) {
        setError(formatDraftIssues(t, nextError.issues))
      } else {
        setError(
          nextError instanceof Error
            ? translateUserError(t, nextError.message)
            : t('scoring.errors.failedToCreateRound'),
        )
      }
    } finally {
      setBusy(false)
    }
  }, [
    freshCourseName,
    freshHoleChoice,
    newRoundAnonymousParticipants,
    newRoundParticipants,
    onRoundCreated,
    resolveFreshCourseNameError,
    selectedSavedCourse,
    startMode,
    t,
    uid,
  ])

  return (
    <section className="start-round-form" aria-labelledby="start-round-form-title">
      <h2 id="start-round-form-title" className="scoring-panel__title">
        {t('rounds.new.title')}
      </h2>
      {error ? (
        <p className="scoring-panel__error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="scoring-panel__section">
        <span className="scoring-panel__label">{t('scoring.sections.startRound')}</span>
        <div className="scoring-panel__field scoring-panel__field--grow">
          <label className="scoring-panel__label" htmlFor="start-round-course-selection">
            {t('scoring.start.courseToPlay')}
          </label>
          <select
            id="start-round-course-selection"
            className="scoring-panel__select"
            value={effectiveStartCourseSelection}
            onChange={(event) => {
              setStartCourseSelection(event.target.value)
              setFreshCourseNameError(null)
            }}
            disabled={busy}
          >
            <option value="fresh">{t('courses.freshOption')}</option>
            {sortedRoundStartCourses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name}
              </option>
            ))}
          </select>
          {courseLoadError ? (
            <p className="scoring-panel__error" role="alert">
              {courseLoadError}
            </p>
          ) : null}
        </div>
        {startMode === 'saved' ? (
          selectedSavedCourse ? (
            <p className="scoring-panel__selection">
              {t('scoring.start.savedSelection', {
                courseName: selectedSavedCourse.name,
              })}
            </p>
          ) : (
            <p className="scoring-panel__muted">{t('scoring.start.noSavedCourses')}</p>
          )
        ) : (
          <>
            <p className="scoring-panel__muted">{t('scoring.start.freshHint')}</p>
            <div className="scoring-panel__row">
              <div className="scoring-panel__field scoring-panel__field--grow field">
                <label className="scoring-panel__label field__label" htmlFor="start-fresh-course-name">
                  {t('scoring.start.courseName')}
                </label>
                <input
                  id="start-fresh-course-name"
                  ref={freshCourseNameInputRef}
                  className={`scoring-panel__input field__control${freshCourseNameError ? ' field__control--invalid' : ''}`}
                  value={freshCourseName}
                  onChange={(event) => {
                    setFreshCourseName(event.target.value)
                    if (freshCourseNameError && event.currentTarget.validity.valid) {
                      setFreshCourseNameError(null)
                    }
                  }}
                  onInvalid={(event) => {
                    event.preventDefault()
                    setFreshCourseNameError(resolveFreshCourseNameError(event.currentTarget))
                  }}
                  placeholder={t('scoring.start.courseNamePlaceholder')}
                  autoComplete="off"
                  required
                  pattern={NON_WHITESPACE_PATTERN}
                  aria-invalid={freshCourseNameError ? 'true' : 'false'}
                  aria-describedby={freshCourseNameError ? 'start-fresh-course-name-error' : undefined}
                />
                {freshCourseNameError ? (
                  <p id="start-fresh-course-name-error" className="field__error" role="alert">
                    {freshCourseNameError}
                  </p>
                ) : null}
              </div>
              <fieldset className="scoring-panel__field field">
                <legend className="scoring-panel__label field__label">{t('scoring.start.roundLength')}</legend>
                <div className="scoring-panel__row scoring-panel__row--compact" role="group">
                  <label className="scoring-panel__participant-option">
                    <input
                      type="radio"
                      name="start-fresh-hole-choice"
                      checked={freshHoleChoice === 9}
                      disabled={busy}
                      onChange={() => setFreshHoleChoice(9)}
                    />
                    <span>{t('scoring.start.holes9')}</span>
                  </label>
                  <label className="scoring-panel__participant-option">
                    <input
                      type="radio"
                      name="start-fresh-hole-choice"
                      checked={freshHoleChoice === 18}
                      disabled={busy}
                      onChange={() => setFreshHoleChoice(18)}
                    />
                    <span>{t('scoring.start.holes18')}</span>
                  </label>
                </div>
              </fieldset>
            </div>
          </>
        )}
        <div className="scoring-panel__field scoring-panel__field--grow">
          <label className="scoring-panel__label" htmlFor="start-participant-search">
            {t('scoring.start.participants')}
          </label>
          <input
            id="start-participant-search"
            className="scoring-panel__input"
            value={newRoundParticipantQuery}
            onChange={(event) => setNewRoundParticipantQuery(event.target.value)}
            placeholder={t('scoring.start.searchParticipantsPlaceholder')}
            autoComplete="off"
          />
          <div
            className="scoring-panel__participant-list"
            role="group"
            aria-label={t('scoring.aria.selectRoundParticipants')}
          >
            {availableNewRoundParticipants.map((entry) => {
              const checked = newRoundParticipants.includes(entry.uid)
              return (
                <label key={entry.uid} className="scoring-panel__participant-option">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={busy}
                    onChange={() => {
                      setNewRoundParticipants((current) => {
                        if (current.includes(entry.uid)) {
                          return current.filter((participantId) => participantId !== entry.uid)
                        }
                        return [...current, entry.uid]
                      })
                    }}
                  />
                  <span>{participantDisplayName(entry)}</span>
                </label>
              )
            })}
          </div>
        </div>
        <div className="scoring-panel__row scoring-panel__row--compact">
          <div className="scoring-panel__field scoring-panel__field--grow scoring-panel__field--compact scoring-panel__field--add-player field">
            <label className="scoring-panel__label field__label" htmlFor="start-new-round-anonymous-name">
              {t('scoring.labels.playerNameOptional')}
            </label>
            <input
              id="start-new-round-anonymous-name"
              ref={newRoundAnonymousNameInputRef}
              className={`scoring-panel__input field__control${newRoundAnonymousNameError ? ' field__control--invalid' : ''}`}
              value={newRoundAnonymousName}
              onChange={(event) => {
                event.currentTarget.setCustomValidity('')
                setNewRoundAnonymousName(event.target.value)
                if (newRoundAnonymousNameError && event.currentTarget.validity.valid) {
                  setNewRoundAnonymousNameError(null)
                }
              }}
              onInvalid={(event) => {
                event.preventDefault()
                setNewRoundAnonymousNameError(resolveAnonymousNameError(event.currentTarget))
              }}
              pattern={NON_WHITESPACE_PATTERN}
              maxLength={ANONYMOUS_NAME_MAX_LENGTH}
              placeholder={t('scoring.placeholders.playerName')}
              autoComplete="off"
              aria-invalid={newRoundAnonymousNameError ? 'true' : 'false'}
              aria-describedby={newRoundAnonymousNameError ? 'start-new-round-anonymous-name-error' : undefined}
            />
            {newRoundAnonymousNameError ? (
              <p id="start-new-round-anonymous-name-error" className="field__error" role="alert">
                {newRoundAnonymousNameError}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="scoring-panel__button scoring-panel__button--primary scoring-panel__button--field-submit"
            onClick={onAddNewRoundAnonymousParticipant}
            disabled={busy}
          >
            {t('scoring.buttons.addPlayer')}
          </button>
        </div>
        {newRoundAnonymousParticipants.length > 0 ? (
          <ul className="scoring-panel__list">
            {newRoundAnonymousParticipants.map((participant) => (
              <li key={participant.id} className="scoring-panel__list-item">
                <strong>{participant.displayName}</strong>
                <button
                  type="button"
                  className="scoring-panel__button scoring-panel__button--inline"
                  onClick={() => onRemoveNewRoundAnonymousParticipant(participant.id)}
                  disabled={busy}
                >
                  {t('scoring.buttons.removeAnonymous')}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="scoring-panel__muted scoring-panel__hint">{t('rounds.new.visibilityPublicHint')}</p>
        <div className="scoring-panel__row">
          <button
            type="button"
            className="dashboard-home__cta scoring-panel__button scoring-panel__button--primary"
            onClick={() => void onCreateRound()}
            disabled={busy || (startMode === 'saved' && !selectedSavedCourse)}
          >
            {t('rounds.new.continueToScorecard')}
          </button>
        </div>
      </div>
    </section>
  )
}
