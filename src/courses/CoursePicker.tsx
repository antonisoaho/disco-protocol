import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/useAuth'
import { translateUserError } from '../i18n/translateError'
import {
  createTemplate,
  createCourseWithDefaultTemplate,
  deleteCourseWithTemplates,
  updateCourseDetails,
  subscribeCourses,
  subscribeTemplates,
  updateTemplate,
  type CourseRoundSelection,
  type CourseTemplateWithId,
  type CourseWithId,
} from './courseData'
import { filterCoursesForDiscovery, type LatLng } from './discovery'
import {
  normalizeCourseCity,
  normalizeCourseName,
  normalizeHoleCount,
  validateCourseName,
} from './templateDraft'

type Props = {
  selection: CourseRoundSelection | null
  onSelectionChange: (selection: CourseRoundSelection | null) => void
}

export function CoursePicker({ selection, onSelectionChange }: Props) {
  const { t } = useTranslation('common')
  const { user, isAdmin } = useAuth()
  const [courses, setCourses] = useState<CourseWithId[]>([])
  const [listError, setListError] = useState<string | null>(null)
  const [nameQuery, setNameQuery] = useState('')
  const [cityQuery, setCityQuery] = useState('')
  const [sortByDistance, setSortByDistance] = useState(false)
  const [nearMeOnly, setNearMeOnly] = useState(false)
  const [userLocation, setUserLocation] = useState<LatLng | null>(null)
  const [locationState, setLocationState] = useState<'idle' | 'requesting' | 'ready' | 'denied' | 'unavailable'>(
    'idle',
  )
  const [locationError, setLocationError] = useState<string | null>(null)
  const [activeCourseId, setActiveCourseId] = useState<string | null>(selection?.courseId ?? null)
  const [templateState, setTemplateState] = useState<{
    courseId: string | null
    rows: CourseTemplateWithId[]
  }>({ courseId: null, rows: [] })
  const [templatesError, setTemplatesError] = useState<string | null>(null)
  const [pickedTemplateId, setPickedTemplateId] = useState<string | null>(selection?.templateId ?? null)

  const [newName, setNewName] = useState('')
  const [newCity, setNewCity] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState<{ courseId: string | null; name: string; city: string }>({
    courseId: null,
    name: '',
    city: '',
  })
  const [renaming, setRenaming] = useState(false)
  const [renameError, setRenameError] = useState<string | null>(null)
  const [createTemplateLabel, setCreateTemplateLabel] = useState('Main')
  const [createTemplateHoleCount, setCreateTemplateHoleCount] = useState(18)
  const [createTemplateError, setCreateTemplateError] = useState<string | null>(null)
  const [creatingTemplate, setCreatingTemplate] = useState(false)
  const [templateEditDraft, setTemplateEditDraft] = useState<{
    templateId: string | null
    label: string
    holeCount: number
  }>({
    templateId: null,
    label: 'Main',
    holeCount: 18,
  })
  const [editTemplateError, setEditTemplateError] = useState<string | null>(null)
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [deletingCourse, setDeletingCourse] = useState(false)
  const [deleteCourseError, setDeleteCourseError] = useState<string | null>(null)

  useEffect(() => {
    const unsub = subscribeCourses(
      (rows) => {
        setCourses(rows)
        setListError(null)
        setActiveCourseId((prev) => {
          if (prev && rows.some((course) => course.id === prev)) {
            return prev
          }
          if (selection?.courseId && rows.some((course) => course.id === selection.courseId)) {
            return selection.courseId
          }
          return rows[0]?.id ?? null
        })
      },
      (e) => setListError(translateUserError(t, e.message)),
    )
    return () => unsub()
  }, [selection?.courseId, t])

  useEffect(() => {
    if (!activeCourseId) return
    const id = activeCourseId
    const unsub = subscribeTemplates(
      id,
      (rows) => {
        setTemplateState({ courseId: id, rows })
        setTemplatesError(null)
        setPickedTemplateId((prev) => {
          if (prev && rows.some((r) => r.id === prev)) return prev
          if (
            selection?.courseId === id &&
            selection.templateId &&
            rows.some((template) => template.id === selection.templateId)
          ) {
            return selection.templateId
          }
          const def = rows.find((r) => r.isDefault)
          return def?.id ?? rows[0]?.id ?? null
        })
      },
      (e) => setTemplatesError(translateUserError(t, e.message)),
    )
    return () => unsub()
  }, [activeCourseId, selection?.courseId, selection?.templateId, t])

  const templates = useMemo(() => {
    if (!activeCourseId || templateState.courseId !== activeCourseId) {
      return []
    }
    return templateState.rows
  }, [activeCourseId, templateState.courseId, templateState.rows])

  const activeCourse = useMemo(
    () => courses.find((course) => course.id === activeCourseId) ?? null,
    [activeCourseId, courses],
  )
  const filteredCourses = useMemo(
    () =>
      filterCoursesForDiscovery(courses, {
        nameQuery,
        cityQuery,
        userLocation,
        nearMeOnly,
        sortByDistance,
      }),
    [cityQuery, courses, nameQuery, nearMeOnly, sortByDistance, userLocation],
  )
  const pickedTemplate = useMemo(
    () => templates.find((template) => template.id === pickedTemplateId) ?? null,
    [pickedTemplateId, templates],
  )
  const renameName =
    activeCourse && renameDraft.courseId === activeCourse.id ? renameDraft.name : (activeCourse?.name ?? '')
  const renameCity =
    activeCourse && renameDraft.courseId === activeCourse.id ? renameDraft.city : (activeCourse?.city ?? '')
  const editTemplateLabel =
    pickedTemplate && templateEditDraft.templateId === pickedTemplate.id
      ? templateEditDraft.label
      : (pickedTemplate?.label ?? 'Main')
  const editTemplateHoleCount =
    pickedTemplate && templateEditDraft.templateId === pickedTemplate.id
      ? templateEditDraft.holeCount
      : (pickedTemplate?.holes.length ?? 18)
  const geolocationSupported = typeof navigator !== 'undefined' && 'geolocation' in navigator
  const geolocationStatusMessage = useMemo(() => {
    if (locationState === 'ready' && userLocation) {
      return t('courses.location.usingLocation', {
        latitude: userLocation.latitude.toFixed(3),
        longitude: userLocation.longitude.toFixed(3),
      })
    }
    if (locationState === 'requesting') {
      return t('courses.location.requesting')
    }
    if (locationState === 'denied') {
      return t('courses.location.deniedStatus')
    }
    if (locationState === 'unavailable') {
      return t('courses.location.unavailableStatus')
    }
    return null
  }, [locationState, t, userLocation])

  useEffect(() => {
    if (!activeCourse || !pickedTemplate) {
      onSelectionChange(null)
      return
    }
    onSelectionChange({
      courseId: activeCourse.id,
      courseName: activeCourse.name,
      templateId: pickedTemplate.id,
      templateLabel: pickedTemplate.label,
      holeCount: pickedTemplate.holes.length,
    })
  }, [activeCourse, pickedTemplate, onSelectionChange])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    const nameError = validateCourseName(newName)
    if (nameError) {
      setCreateError(t('courses.errors.courseNameRequired'))
      return
    }
    setCreating(true)
    setCreateError(null)
    try {
      const { courseId } = await createCourseWithDefaultTemplate({
        name: normalizeCourseName(newName),
        city: normalizeCourseCity(newCity),
        uid: user.uid,
      })
      setNewName('')
      setNewCity('')
      setActiveCourseId(courseId)
    } catch (err) {
      setCreateError(
        err instanceof Error ? translateUserError(t, err.message) : t('courses.errors.createCourseFailed'),
      )
    } finally {
      setCreating(false)
    }
  }

  async function handleRenameCourse(e: React.FormEvent) {
    e.preventDefault()
    if (!activeCourse || !isAdmin) return
    const nameError = validateCourseName(renameName)
    if (nameError) {
      setRenameError(t('courses.errors.courseNameRequired'))
      return
    }
    setRenaming(true)
    setRenameError(null)
    try {
      await updateCourseDetails({
        courseId: activeCourse.id,
        name: renameName,
        city: normalizeCourseCity(renameCity),
      })
      setRenameDraft({ courseId: null, name: '', city: '' })
    } catch (err) {
      setRenameError(
        err instanceof Error ? translateUserError(t, err.message) : t('courses.errors.renameCourseFailed'),
      )
    } finally {
      setRenaming(false)
    }
  }

  async function handleCreateTemplate(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !activeCourseId) return
    setCreatingTemplate(true)
    setCreateTemplateError(null)
    try {
      const templateId = await createTemplate({
        courseId: activeCourseId,
        uid: user.uid,
        label: createTemplateLabel,
        holeCount: createTemplateHoleCount,
      })
      setPickedTemplateId(templateId)
      setCreateTemplateLabel('Main')
      setCreateTemplateHoleCount(18)
    } catch (err) {
      setCreateTemplateError(
        err instanceof Error ? translateUserError(t, err.message) : t('courses.errors.createTemplateFailed'),
      )
    } finally {
      setCreatingTemplate(false)
    }
  }

  async function handleUpdateTemplate(e: React.FormEvent) {
    e.preventDefault()
    if (!activeCourseId || !pickedTemplateId) return
    setSavingTemplate(true)
    setEditTemplateError(null)
    try {
      await updateTemplate({
        courseId: activeCourseId,
        templateId: pickedTemplateId,
        label: editTemplateLabel,
        holeCount: editTemplateHoleCount,
      })
      setTemplateEditDraft({ templateId: null, label: 'Main', holeCount: 18 })
    } catch (err) {
      setEditTemplateError(
        err instanceof Error ? translateUserError(t, err.message) : t('courses.errors.updateTemplateFailed'),
      )
    } finally {
      setSavingTemplate(false)
    }
  }

  async function handleDeleteCourse() {
    if (!activeCourse || !isAdmin) return
    if (!window.confirm(t('courses.deleteCourseConfirm', { courseName: activeCourse.name }))) {
      return
    }

    const deletingCourseId = activeCourse.id
    setDeletingCourse(true)
    setDeleteCourseError(null)
    try {
      await deleteCourseWithTemplates(deletingCourseId)
      setPickedTemplateId(null)
      setActiveCourseId((prev) => (prev === deletingCourseId ? null : prev))
      onSelectionChange(null)
    } catch (err) {
      setDeleteCourseError(err instanceof Error ? err.message : t('courses.deleteCourseError'))
    } finally {
      setDeletingCourse(false)
    }
  }

  function handleUseMyLocation() {
    if (!geolocationSupported) {
      setLocationState('unavailable')
      setLocationError(t('courses.location.unsupported'))
      return
    }

    setLocationState('requesting')
    setLocationError(null)

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        })
        setLocationState('ready')
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          setLocationState('denied')
          setLocationError(t('courses.location.permissionDenied'))
          return
        }
        setLocationState('unavailable')
        setLocationError(t('courses.location.unavailableNow'))
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 5 * 60 * 1000,
      },
    )
  }

  return (
    <section className="course-picker card" aria-label={t('courses.aria.chooseCourseAndLayout')}>
      <div className="course-picker__toolbar">
        <h2 className="course-picker__heading">{t('courses.heading')}</h2>
        {isAdmin ? (
          <span className="badge course-picker__badge" data-variant="success" title={t('courses.admin.title')}>
            {t('courses.admin.badge')}
          </span>
        ) : null}
      </div>

      {listError ? (
        <p className="course-picker__error" role="alert" data-variant="error">
          {listError}
        </p>
      ) : null}

      <div className="course-picker__filters" aria-label={t('courses.aria.filterCourses')}>
        <div className="course-picker__filter-group">
          <label className="course-picker__add-label" htmlFor="course-picker-filter-name">
            {t('courses.filters.searchByName')}
          </label>
          <input
            id="course-picker-filter-name"
            value={nameQuery}
            onChange={(e) => setNameQuery(e.target.value)}
            placeholder={t('courses.filters.namePlaceholder')}
            autoComplete="off"
          />
        </div>
        <div className="course-picker__filter-group">
          <label className="course-picker__add-label" htmlFor="course-picker-filter-city">
            {t('courses.filters.filterByCity')}
          </label>
          <input
            id="course-picker-filter-city"
            value={cityQuery}
            onChange={(e) => setCityQuery(e.target.value)}
            placeholder={t('courses.filters.cityPlaceholder')}
            autoComplete="off"
          />
        </div>
        <div className="course-picker__filter-actions" role="group" aria-label={t('courses.aria.locationTools')}>
          <button
            type="button"
            data-variant="secondary"
            onClick={handleUseMyLocation}
            disabled={!geolocationSupported || locationState === 'requesting'}
          >
            {locationState === 'requesting' ? t('courses.location.locating') : t('courses.location.useMyLocation')}
          </button>
          {userLocation ? (
            <button
              type="button"
              data-variant="secondary"
              onClick={() => {
                setUserLocation(null)
                setSortByDistance(false)
                setNearMeOnly(false)
                setLocationState('idle')
                setLocationError(null)
              }}
            >
              {t('courses.location.clearLocation')}
            </button>
          ) : null}
          <label className="course-picker__checkbox">
            <input
              type="checkbox"
              checked={sortByDistance}
              onChange={(e) => setSortByDistance(e.target.checked)}
              disabled={!userLocation}
            />
            {t('courses.filters.sortByNearest')}
          </label>
          <label className="course-picker__checkbox">
            <input
              type="checkbox"
              checked={nearMeOnly}
              onChange={(e) => setNearMeOnly(e.target.checked)}
              disabled={!userLocation}
            />
            {t('courses.filters.nearMeOnly')}
          </label>
        </div>
        {geolocationStatusMessage ? <p className="course-picker__hint">{geolocationStatusMessage}</p> : null}
        {locationError ? (
          <p className="course-picker__error" role="alert" data-variant="error">
            {locationError}
          </p>
        ) : null}
      </div>

      {courses.length === 0 && !listError ? (
        <p className="course-picker__empty">{t('courses.empty.noCourses')}</p>
      ) : filteredCourses.length === 0 ? (
        <p className="course-picker__empty">{t('courses.empty.noMatches')}</p>
      ) : (
        <ul className="course-picker__list">
          {filteredCourses.map((c) => (
            <li key={c.id} className="course-picker__item">
              <button
                type="button"
                className={`course-picker__course-btn${c.id === activeCourseId ? ' course-picker__course-btn--active' : ''}`}
                onClick={() => setActiveCourseId(c.id)}
              >
                <span className="course-picker__course-name">{c.name}</span>
                <span className="course-picker__course-meta">
                  {[c.city, c.organization, c.slug].filter(Boolean).join(' · ') || t('courses.courseCard.fallbackMeta')}
                </span>
                {typeof c.distanceKm === 'number' ? (
                  <span className="course-picker__course-meta">
                    {t('courses.courseCard.distanceKmAway', { distanceKm: c.distanceKm.toFixed(1) })}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}

      {activeCourseId && activeCourse ? (
        <div className="course-picker__templates">
          <h3 className="course-picker__templates-title">{t('courses.layoutsForCourse', { courseName: activeCourse.name })}</h3>
          <form className="course-picker__add" onSubmit={(e) => void handleRenameCourse(e)}>
            <label className="course-picker__add-label" htmlFor="course-picker-course-name">
              {t('courses.forms.courseName')}
            </label>
            <div className="course-picker__add-row">
              <input
                id="course-picker-course-name"
                value={renameName}
                onChange={(e) =>
                  setRenameDraft({
                    courseId: activeCourse.id,
                    name: e.target.value,
                    city: renameCity,
                  })
                }
                autoComplete="off"
                disabled={renaming || !isAdmin}
              />
              <input
                id="course-picker-course-city"
                aria-label={t('courses.aria.courseCity')}
                value={renameCity}
                onChange={(e) =>
                  setRenameDraft({
                    courseId: activeCourse.id,
                    name: renameName,
                    city: e.target.value,
                  })
                }
                placeholder={t('courses.forms.cityPlaceholder')}
                autoComplete="off"
                disabled={renaming || !isAdmin}
              />
              <button
                type="submit"
                data-variant="secondary"
                disabled={renaming || !isAdmin || validateCourseName(renameName) !== null}
              >
                {renaming ? t('courses.actions.saving') : t('courses.actions.saveName')}
              </button>
            </div>
            {!isAdmin ? <p className="course-picker__hint">{t('courses.hints.onlyAdminsRename')}</p> : null}
            {renameError ? (
              <p className="course-picker__error" role="alert" data-variant="error">
                {renameError}
              </p>
            ) : null}
          </form>
          {isAdmin ? (
            <form className="course-picker__add" onSubmit={(e) => e.preventDefault()}>
              <label className="course-picker__add-label">{t('courses.deleteCourseLabel')}</label>
              <div className="course-picker__add-row">
                <button
                  type="button"
                  data-variant="error"
                  onClick={() => void handleDeleteCourse()}
                  disabled={deletingCourse}
                >
                  {deletingCourse ? t('courses.deletingCourse') : t('courses.deleteCourse')}
                </button>
              </div>
              {deleteCourseError ? (
                <p className="course-picker__error" role="alert" data-variant="error">
                  {deleteCourseError}
                </p>
              ) : null}
            </form>
          ) : null}

          {templatesError ? (
            <p className="course-picker__error" role="alert" data-variant="error">
              {templatesError}
            </p>
          ) : null}
          <ul className="course-picker__template-list">
            {templates.map((template) => (
              <li key={template.id} className="course-picker__item">
                <button
                  type="button"
                  className={`course-picker__template-btn${template.id === pickedTemplateId ? ' course-picker__template-btn--picked' : ''}`}
                  onClick={() => setPickedTemplateId(template.id)}
                >
                  {template.label}
                  <span className="course-picker__template-meta">
                    {t('courses.templateMeta.holeCount', { count: template.holes.length })} · {template.source}
                    {template.isDefault ? ` · ${t('courses.templateMeta.default')}` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <form className="course-picker__add" onSubmit={(e) => void handleCreateTemplate(e)}>
            <label className="course-picker__add-label" htmlFor="course-picker-template-label">
              {t('courses.forms.addTemplate')}
            </label>
            <div className="course-picker__add-row">
              <input
                id="course-picker-template-label"
                value={createTemplateLabel}
                onChange={(e) => setCreateTemplateLabel(e.target.value)}
                autoComplete="off"
              />
              <input
                id="course-picker-template-holes"
                className="course-picker__input-compact"
                type="number"
                min={1}
                max={27}
                value={createTemplateHoleCount}
                onChange={(e) => setCreateTemplateHoleCount(normalizeHoleCount(Number(e.target.value)))}
              />
              <button type="submit" disabled={creatingTemplate}>
                {creatingTemplate ? t('courses.actions.saving') : t('courses.actions.addTemplate')}
              </button>
            </div>
            {createTemplateError ? (
              <p className="course-picker__error" role="alert" data-variant="error">
                {createTemplateError}
              </p>
            ) : null}
          </form>
          {pickedTemplate ? (
            <form className="course-picker__add" onSubmit={(e) => void handleUpdateTemplate(e)}>
              <label className="course-picker__add-label" htmlFor="course-picker-template-edit-label">
                {t('courses.forms.editSelectedTemplate')}
              </label>
              <div className="course-picker__add-row">
                <input
                  id="course-picker-template-edit-label"
                  value={editTemplateLabel}
                  onChange={(e) =>
                    setTemplateEditDraft({
                      templateId: pickedTemplate.id,
                      label: e.target.value,
                      holeCount: editTemplateHoleCount,
                    })
                  }
                  autoComplete="off"
                />
                <input
                  id="course-picker-template-edit-holes"
                  className="course-picker__input-compact"
                  type="number"
                  min={1}
                  max={27}
                  value={editTemplateHoleCount}
                  onChange={(e) =>
                    setTemplateEditDraft({
                      templateId: pickedTemplate.id,
                      label: editTemplateLabel,
                      holeCount: normalizeHoleCount(Number(e.target.value)),
                    })
                  }
                />
                <button type="submit" disabled={savingTemplate}>
                  {savingTemplate ? t('courses.actions.saving') : t('courses.actions.saveTemplate')}
                </button>
              </div>
              {editTemplateError ? (
                <p className="course-picker__error" role="alert" data-variant="error">
                  {editTemplateError}
                </p>
              ) : null}
            </form>
          ) : null}
        </div>
      ) : null}

      {activeCourse && pickedTemplate ? (
        <p className="course-picker__selection">
          {t('courses.selection.selected')}:{' '}
          <strong>
            {activeCourse.name} — {pickedTemplate.label}
          </strong>{' '}
          <span className="course-picker__course-meta">{t('courses.selection.templateId', { templateId: pickedTemplate.id })}</span>
        </p>
      ) : null}

      <form className="course-picker__add" onSubmit={(e) => void handleCreate(e)}>
        <label className="course-picker__add-label" htmlFor="course-picker-new-name">
          {t('courses.forms.newCourse')}
        </label>
        <div className="course-picker__add-row">
          <input
            id="course-picker-new-name"
            placeholder={t('courses.forms.courseNamePlaceholder')}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            autoComplete="off"
          />
          <input
            id="course-picker-new-city"
            placeholder={t('courses.forms.cityOptionalPlaceholder')}
            value={newCity}
            onChange={(e) => setNewCity(e.target.value)}
            autoComplete="off"
            aria-label={t('courses.aria.newCourseCity')}
          />
          <button type="submit" disabled={creating}>
            {creating ? t('courses.actions.saving') : t('courses.actions.add')}
          </button>
        </div>
        {createError ? (
          <p className="course-picker__error" role="alert" data-variant="error">
            {createError}
          </p>
        ) : null}
      </form>
    </section>
  )
}
