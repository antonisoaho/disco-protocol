import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { translateUserError } from '../i18n/translateError'
import type { CourseHoleTemplate } from '../firebase/models/course'
import { updateTemplate, type CourseTemplateWithId } from './courseData'
import { TemplateHoleGrid } from './TemplateHoleGrid'

type Props = {
  courseId: string
  template: CourseTemplateWithId
  canEdit: boolean
}

export function CoursePickerTemplatePanel({ courseId, template, canEdit }: Props) {
  const { t } = useTranslation('common')
  const [draft, setDraft] = useState(() => ({
    label: template.label,
    holes: template.holes.map((h) => ({ ...h })) as CourseHoleTemplate[],
  }))
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  function setLabelDraft(next: string) {
    setDraft((prev) => ({ ...prev, label: next }))
  }

  function setHolesDraft(next: CourseHoleTemplate[]) {
    setDraft((prev) => ({ ...prev, holes: next }))
  }

  async function handleSave() {
    if (!canEdit) return
    setSaving(true)
    setSaveError(null)
    try {
      await updateTemplate({
        courseId,
        templateId: template.id,
        label: draft.label,
        holes: draft.holes,
      })
    } catch (err) {
      setSaveError(
        err instanceof Error ? translateUserError(t, err.message) : t('courses.errors.updateTemplateFailed'),
      )
    } finally {
      setSaving(false)
    }
  }

  const gridHoles = canEdit && draft.holes.length > 0 ? draft.holes : template.holes

  return (
    <>
      <p className="course-picker__hint" role="status">
        {t('courses.hints.canonicalLayout', {
          label: template.label,
          holeCount: template.holes.length,
        })}
      </p>
      <div className="course-picker__add">
        <label className="course-picker__add-label" htmlFor="course-picker-layout-label">
          {t('courses.forms.layoutName')}
        </label>
        <div className="course-picker__add-row">
          <input
            id="course-picker-layout-label"
            value={canEdit ? draft.label : template.label}
            onChange={(e) => setLabelDraft(e.target.value)}
            autoComplete="off"
            disabled={!canEdit}
            aria-label={t('courses.aria.layoutName')}
          />
        </div>
      </div>
      {!canEdit ? <p className="course-picker__hint">{t('courses.hints.templateReadOnly')}</p> : null}
      <TemplateHoleGrid
        idPrefix="course-picker-template"
        holes={gridHoles}
        disabled={!canEdit}
        onChange={setHolesDraft}
      />
      {canEdit ? (
        <div className="course-picker__add-row">
          <button type="button" disabled={saving} onClick={() => void handleSave()}>
            {saving ? t('courses.actions.saving') : t('courses.actions.saveTemplate')}
          </button>
        </div>
      ) : null}
      {saveError ? (
        <p className="course-picker__error" role="alert">
          {saveError}
        </p>
      ) : null}
    </>
  )
}
