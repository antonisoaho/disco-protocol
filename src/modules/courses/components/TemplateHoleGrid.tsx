import { useTranslation } from 'react-i18next'
import type { CourseHoleTemplate } from '@core/domain/course'
import { clampPar, parseLengthMetersInput } from '@core/domain/templateDraft'

type Props = {
  idPrefix: string
  holes: CourseHoleTemplate[]
  disabled?: boolean
  onChange: (next: CourseHoleTemplate[]) => void
}

export function TemplateHoleGrid({ idPrefix, holes, disabled, onChange }: Props) {
  const { t } = useTranslation('common')

  function patchHole(index: number, partial: Partial<CourseHoleTemplate>) {
    onChange(
      holes.map((hole, i) =>
        i === index
          ? {
              ...hole,
              ...partial,
              number: index + 1,
            }
          : hole,
      ),
    )
  }

  return (
    <div className="course-picker__hole-grid" role="region" aria-label={t('courses.forms.templateHoleDetails')}>
      <table className="course-picker__hole-table">
        <thead>
          <tr>
            <th scope="col">{t('courses.forms.holeNumber')}</th>
            <th scope="col">{t('courses.forms.holePar')}</th>
            <th scope="col">{t('courses.forms.holeLength')}</th>
          </tr>
        </thead>
        <tbody>
          {holes.map((hole, index) => (
            <tr key={hole.number}>
              <td className="course-picker__hole-num">{hole.number}</td>
              <td>
                <input
                  id={`${idPrefix}-par-${index}`}
                  className="course-picker__hole-input"
                  type="number"
                  min={2}
                  max={6}
                  step={1}
                  value={hole.par}
                  disabled={disabled}
                  onChange={(event) => patchHole(index, { par: clampPar(Number(event.target.value)) })}
                  aria-label={t('courses.aria.holePar', { hole: hole.number })}
                />
              </td>
              <td>
                <input
                  id={`${idPrefix}-len-${index}`}
                  className="course-picker__hole-input course-picker__hole-input--length"
                  type="number"
                  min={1}
                  max={2000}
                  step={1}
                  value={hole.lengthMeters ?? ''}
                  placeholder={t('courses.forms.holeLengthPlaceholder')}
                  disabled={disabled}
                  onChange={(event) =>
                    patchHole(index, { lengthMeters: parseLengthMetersInput(event.target.value) })
                  }
                  aria-label={t('courses.aria.holeLength', { hole: hole.number })}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
