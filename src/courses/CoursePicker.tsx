import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import {
  createTemplate,
  createCourseWithDefaultTemplate,
  renameCourse,
  subscribeCourses,
  subscribeTemplates,
  updateTemplate,
  type CourseRoundSelection,
  type CourseTemplateWithId,
  type CourseWithId,
} from './courseData'
import {
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
  const [activeCourseId, setActiveCourseId] = useState<string | null>(selection?.courseId ?? null)
  const [templateState, setTemplateState] = useState<{
    courseId: string | null
    rows: CourseTemplateWithId[]
  }>({ courseId: null, rows: [] })
  const [templatesError, setTemplatesError] = useState<string | null>(null)
  const [pickedTemplateId, setPickedTemplateId] = useState<string | null>(selection?.templateId ?? null)

  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState<{ courseId: string | null; value: string }>({
    courseId: null,
    value: '',
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
  const pickedTemplate = useMemo(
    () => templates.find((template) => template.id === pickedTemplateId) ?? null,
    [pickedTemplateId, templates],
  )
  const renameName =
    activeCourse && renameDraft.courseId === activeCourse.id ? renameDraft.value : (activeCourse?.name ?? '')
  const editTemplateLabel =
    pickedTemplate && templateEditDraft.templateId === pickedTemplate.id
      ? templateEditDraft.label
      : (pickedTemplate?.label ?? 'Main')
  const editTemplateHoleCount =
    pickedTemplate && templateEditDraft.templateId === pickedTemplate.id
      ? templateEditDraft.holeCount
      : (pickedTemplate?.holes.length ?? 18)

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
        uid: user.uid,
      })
      setNewName('')
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
      await renameCourse({ courseId: activeCourse.id, name: renameName })
      setRenameDraft({ courseId: null, value: '' })
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
          <form className="course-picker__add" onSubmit={(e) => void handleRenameCourse(e)}>
            <label className="course-picker__add-label" htmlFor="course-picker-course-name">
              Course name
            </label>
            <div className="course-picker__add-row">
              <input
                id="course-picker-course-name"
                className="course-picker__input"
                value={renameName}
                onChange={(e) =>
                  setRenameDraft({
                    courseId: activeCourse.id,
                    value: e.target.value,
                  })
                }
                autoComplete="off"
                disabled={renaming || !isAdmin}
              />
              <button
                type="submit"
                className="course-picker__submit"
                disabled={renaming || !isAdmin || validateCourseName(renameName) !== null}
              >
                {renaming ? 'Saving…' : 'Save name'}
              </button>
            </div>
            {!isAdmin ? <p className="course-picker__hint">Only admins can rename canonical courses.</p> : null}
            {renameError ? <p className="course-picker__error">{renameError}</p> : null}
          </form>

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
          <form className="course-picker__add" onSubmit={(e) => void handleCreateTemplate(e)}>
            <label className="course-picker__add-label" htmlFor="course-picker-template-label">
              Add template
            </label>
            <div className="course-picker__add-row">
              <input
                id="course-picker-template-label"
                className="course-picker__input"
                value={createTemplateLabel}
                onChange={(e) => setCreateTemplateLabel(e.target.value)}
                autoComplete="off"
              />
              <input
                id="course-picker-template-holes"
                className="course-picker__input course-picker__input--compact"
                type="number"
                min={1}
                max={27}
                value={createTemplateHoleCount}
                onChange={(e) => setCreateTemplateHoleCount(normalizeHoleCount(Number(e.target.value)))}
              />
              <button type="submit" className="course-picker__submit" disabled={creatingTemplate}>
                {creatingTemplate ? 'Saving…' : 'Add template'}
              </button>
            </div>
            {createTemplateError ? <p className="course-picker__error">{createTemplateError}</p> : null}
          </form>
          {pickedTemplate ? (
            <form className="course-picker__add" onSubmit={(e) => void handleUpdateTemplate(e)}>
              <label className="course-picker__add-label" htmlFor="course-picker-template-edit-label">
                Edit selected template
              </label>
              <div className="course-picker__add-row">
                <input
                  id="course-picker-template-edit-label"
                  className="course-picker__input"
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
                  className="course-picker__input course-picker__input--compact"
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
                <button type="submit" className="course-picker__submit" disabled={savingTemplate}>
                  {savingTemplate ? 'Saving…' : 'Save template'}
                </button>
              </div>
              {editTemplateError ? <p className="course-picker__error">{editTemplateError}</p> : null}
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
            className="course-picker__input"
            placeholder="Course name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            autoComplete="off"
          />
          <button type="submit" className="course-picker__submit" disabled={creating}>
            {creating ? 'Saving…' : 'Add'}
          </button>
        </div>
        {createError ? <p className="course-picker__error">{createError}</p> : null}
      </form>
    </section>
  )
}
