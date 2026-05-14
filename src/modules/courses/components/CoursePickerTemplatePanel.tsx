import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { translateUserError } from '@common/i18n/translateError'
import type { CourseHoleTemplate } from '@core/domain/course'
import { updateTemplate, type CourseTemplateWithId } from '@core/domain/courseData'
import { TemplateHoleGrid } from '@modules/courses/components/TemplateHoleGrid'
import { resizeTemplateHoles } from '@core/domain/templateDraft'

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
  const holeLen = draft.holes.length
  const isStandardHoleCount = holeLen === 9 || holeLen === 18

  function setLayoutHoleCount(next: 9 | 18) {
    setDraft((prev) => ({
      ...prev,
      holes: resizeTemplateHoles(prev.holes, next),
    }))
  }

  return (
    <>
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
      {canEdit && isStandardHoleCount ? (
        <fieldset className="course-picker__hole-choice-fieldset">
          <legend className="course-picker__add-label">{t('courses.forms.courseHoleCount')}</legend>
          <div className="course-picker__add-row course-picker__add-row--radios">
            <label className="course-picker__radio-label">
              <input
                type="radio"
                name="course-picker-existing-holes"
                checked={holeLen === 9}
                onChange={() => setLayoutHoleCount(9)}
              />
              {t('courses.forms.nineHoles')}
            </label>
            <label className="course-picker__radio-label">
              <input
                type="radio"
                name="course-picker-existing-holes"
                checked={holeLen === 18}
                onChange={() => setLayoutHoleCount(18)}
              />
              {t('courses.forms.eighteenHoles')}
            </label>
          </div>
        </fieldset>
      ) : canEdit && !isStandardHoleCount ? (
        <p className="course-picker__hint">{t('courses.hints.nonStandardHoleCount', { count: holeLen })}</p>
      ) : null}
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
