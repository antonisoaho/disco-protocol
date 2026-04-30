import { useEffect, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import {
  createCourseWithDefaultTemplate,
  subscribeCourses,
  subscribeTemplates,
  type CourseTemplateWithId,
  type CourseWithId,
} from './courseData'

export function CoursePicker() {
  const { user, isAdmin } = useAuth()
  const [courses, setCourses] = useState<CourseWithId[]>([])
  const [listError, setListError] = useState<string | null>(null)
  const [activeCourseId, setActiveCourseId] = useState<string | null>(null)
  const [templateState, setTemplateState] = useState<{
    courseId: string | null
    rows: CourseTemplateWithId[]
  }>({ courseId: null, rows: [] })
  const [templatesError, setTemplatesError] = useState<string | null>(null)
  const [pickedTemplateId, setPickedTemplateId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  useEffect(() => {
    const unsub = subscribeCourses(
      (rows) => {
        setCourses(rows)
        setListError(null)
      },
      (e) => setListError(e.message),
    )
    return () => unsub()
  }, [])

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
          const def = rows.find((r) => r.isDefault)
          return def?.id ?? rows[0]?.id ?? null
        })
      },
      (e) => setTemplatesError(e.message),
    )
    return () => unsub()
  }, [activeCourseId])

  const templates =
    activeCourseId && templateState.courseId === activeCourseId ? templateState.rows : []

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    const name = newName.trim()
    if (!name) return
    setCreating(true)
    setCreateError(null)
    try {
      const { courseId } = await createCourseWithDefaultTemplate({ name, uid: user.uid })
      setNewName('')
      setActiveCourseId(courseId)
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Could not create course')
    } finally {
      setCreating(false)
    }
  }

  const activeCourse = courses.find((c) => c.id === activeCourseId)
  const pickedTemplate = templates.find((t) => t.id === pickedTemplateId)

  return (
    <section className="course-picker" aria-label="Choose course and layout">
      <div className="course-picker__toolbar">
        <h2 className="course-picker__heading">Courses</h2>
        {isAdmin ? (
          <span className="course-picker__badge" title="Firebase custom claim admin">
            Admin
          </span>
        ) : null}
      </div>

      {listError ? <p className="course-picker__error">{listError}</p> : null}

      {courses.length === 0 && !listError ? (
        <p className="course-picker__empty">No courses yet. Add one below to get started.</p>
      ) : (
        <ul className="course-picker__list">
          {courses.map((c) => (
            <li key={c.id} className="course-picker__item">
              <button
                type="button"
                className={`course-picker__course-btn${c.id === activeCourseId ? ' course-picker__course-btn--active' : ''}`}
                onClick={() => setActiveCourseId(c.id)}
              >
                <span className="course-picker__course-name">{c.name}</span>
                <span className="course-picker__course-meta">
                  {[c.organization, c.slug].filter(Boolean).join(' · ') || 'Layout templates inside'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {activeCourseId && activeCourse ? (
        <div className="course-picker__templates">
          <h3 className="course-picker__templates-title">Layouts for {activeCourse.name}</h3>
          {templatesError ? <p className="course-picker__error">{templatesError}</p> : null}
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
            className="course-picker__input"
            placeholder="Course name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            autoComplete="off"
          />
          <button type="submit" className="course-picker__submit" disabled={creating || !newName.trim()}>
            {creating ? 'Saving…' : 'Add'}
          </button>
        </div>
        {createError ? <p className="course-picker__error">{createError}</p> : null}
      </form>
    </section>
  )
}
