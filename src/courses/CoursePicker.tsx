import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import {
  createTemplate,
  createCourseWithDefaultTemplate,
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
      (e) => setListError(e.message),
    )
    return () => unsub()
  }, [selection?.courseId])

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
      (e) => setTemplatesError(e.message),
    )
    return () => unsub()
  }, [activeCourseId, selection?.courseId, selection?.templateId])

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
      return `Using your location (${userLocation.latitude.toFixed(3)}, ${userLocation.longitude.toFixed(3)}).`
    }
    if (locationState === 'requesting') {
      return 'Requesting your location...'
    }
    if (locationState === 'denied') {
      return 'Location permission denied. You can still search by name and city.'
    }
    if (locationState === 'unavailable') {
      return 'Could not determine your location.'
    }
    return null
  }, [locationState, userLocation])

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
      setCreateError(nameError)
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
      setCreateError(err instanceof Error ? err.message : 'Could not create course')
    } finally {
      setCreating(false)
    }
  }

  async function handleRenameCourse(e: React.FormEvent) {
    e.preventDefault()
    if (!activeCourse || !isAdmin) return
    const nameError = validateCourseName(renameName)
    if (nameError) {
      setRenameError(nameError)
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
      setRenameError(err instanceof Error ? err.message : 'Could not rename course')
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
      setCreateTemplateError(err instanceof Error ? err.message : 'Could not create template')
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
      setEditTemplateError(err instanceof Error ? err.message : 'Could not update template')
    } finally {
      setSavingTemplate(false)
    }
  }

  function handleUseMyLocation() {
    if (!geolocationSupported) {
      setLocationState('unavailable')
      setLocationError('Geolocation is not available in this browser.')
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
          setLocationError('Permission denied. Enable location permission to sort by distance.')
          return
        }
        setLocationState('unavailable')
        setLocationError('Could not determine your location right now.')
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 5 * 60 * 1000,
      },
    )
  }

  return (
    <section className="course-picker card" aria-label="Choose course and layout">
      <div className="course-picker__toolbar">
        <h2 className="course-picker__heading">Courses</h2>
        {isAdmin ? (
          <span className="badge course-picker__badge" data-variant="success" title="Firebase custom claim admin">
            Admin
          </span>
        ) : null}
      </div>

      {listError ? (
        <p className="course-picker__error" role="alert" data-variant="error">
          {listError}
        </p>
      ) : null}

      <div className="course-picker__filters" aria-label="Filter courses">
        <div className="course-picker__filter-group">
          <label className="course-picker__add-label" htmlFor="course-picker-filter-name">
            Search by name
          </label>
          <input
            id="course-picker-filter-name"
            value={nameQuery}
            onChange={(e) => setNameQuery(e.target.value)}
            placeholder="Maple Hill"
            autoComplete="off"
          />
        </div>
        <div className="course-picker__filter-group">
          <label className="course-picker__add-label" htmlFor="course-picker-filter-city">
            Filter by city
          </label>
          <input
            id="course-picker-filter-city"
            value={cityQuery}
            onChange={(e) => setCityQuery(e.target.value)}
            placeholder="Leicester"
            autoComplete="off"
          />
        </div>
        <div className="course-picker__filter-actions" role="group" aria-label="Location tools">
          <button
            type="button"
            data-variant="secondary"
            onClick={handleUseMyLocation}
            disabled={!geolocationSupported || locationState === 'requesting'}
          >
            {locationState === 'requesting' ? 'Locating…' : 'Use my location'}
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
              Clear location
            </button>
          ) : null}
          <label className="course-picker__checkbox">
            <input
              type="checkbox"
              checked={sortByDistance}
              onChange={(e) => setSortByDistance(e.target.checked)}
              disabled={!userLocation}
            />
            Sort by nearest
          </label>
          <label className="course-picker__checkbox">
            <input
              type="checkbox"
              checked={nearMeOnly}
              onChange={(e) => setNearMeOnly(e.target.checked)}
              disabled={!userLocation}
            />
            Near me only
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
        <p className="course-picker__empty">No courses yet. Add one below to get started.</p>
      ) : filteredCourses.length === 0 ? (
        <p className="course-picker__empty">No courses match your filters yet.</p>
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
                  {[c.city, c.organization, c.slug].filter(Boolean).join(' · ') || 'Layout templates inside'}
                </span>
                {typeof c.distanceKm === 'number' ? (
                  <span className="course-picker__course-meta">{c.distanceKm.toFixed(1)} km away</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}

      {activeCourseId && activeCourse ? (
        <div className="course-picker__templates">
          <h3 className="course-picker__templates-title">Layouts for {activeCourse.name}</h3>
          <form className="course-picker__add" onSubmit={(e) => void handleRenameCourse(e)}>
            <label className="course-picker__add-label" htmlFor="course-picker-course-name">
              Course name
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
                aria-label="Course city"
                value={renameCity}
                onChange={(e) =>
                  setRenameDraft({
                    courseId: activeCourse.id,
                    name: renameName,
                    city: e.target.value,
                  })
                }
                placeholder="City"
                autoComplete="off"
                disabled={renaming || !isAdmin}
              />
              <button
                type="submit"
                data-variant="secondary"
                disabled={renaming || !isAdmin || validateCourseName(renameName) !== null}
              >
                {renaming ? 'Saving…' : 'Save name'}
              </button>
            </div>
            {!isAdmin ? <p className="course-picker__hint">Only admins can rename canonical courses.</p> : null}
            {renameError ? (
              <p className="course-picker__error" role="alert" data-variant="error">
                {renameError}
              </p>
            ) : null}
          </form>

          {templatesError ? (
            <p className="course-picker__error" role="alert" data-variant="error">
              {templatesError}
            </p>
          ) : null}
          <ul className="course-picker__template-list">
            {templates.map((t) => (
              <li key={t.id} className="course-picker__item">
                <button
                  type="button"
                  className={`course-picker__template-btn${t.id === pickedTemplateId ? ' course-picker__template-btn--picked' : ''}`}
                  onClick={() => setPickedTemplateId(t.id)}
                >
                  {t.label}
                  <span className="course-picker__template-meta">
                    {t.holes.length} holes · {t.source}
                    {t.isDefault ? ' · default' : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <form className="course-picker__add" onSubmit={(e) => void handleCreateTemplate(e)}>
            <label className="course-picker__add-label" htmlFor="course-picker-template-label">
              Add template
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
                {creatingTemplate ? 'Saving…' : 'Add template'}
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
                Edit selected template
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
                  {savingTemplate ? 'Saving…' : 'Save template'}
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
          Selected:{' '}
          <strong>
            {activeCourse.name} — {pickedTemplate.label}
          </strong>{' '}
          <span className="course-picker__course-meta">(template id {pickedTemplate.id})</span>
        </p>
      ) : null}

      <form className="course-picker__add" onSubmit={(e) => void handleCreate(e)}>
        <label className="course-picker__add-label" htmlFor="course-picker-new-name">
          New course
        </label>
        <div className="course-picker__add-row">
          <input
            id="course-picker-new-name"
            placeholder="Course name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            autoComplete="off"
          />
          <input
            id="course-picker-new-city"
            placeholder="City (optional)"
            value={newCity}
            onChange={(e) => setNewCity(e.target.value)}
            autoComplete="off"
            aria-label="New course city"
          />
          <button type="submit" disabled={creating}>
            {creating ? 'Saving…' : 'Add'}
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
