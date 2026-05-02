import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

type Props = {
  holeNumber: number
  parValue: string
  lengthValue: string
  onParChange: (value: string) => void
  onLengthChange: (value: string) => void
  disableLength: boolean
  saveStateLabel: string
  children: ReactNode
}

export function HoleForm({
  holeNumber,
  parValue,
  lengthValue,
  onParChange,
  onLengthChange,
  disableLength,
  saveStateLabel,
  children,
}: Props) {
  const { t } = useTranslation('common')

  return (
    <section
      className="scoring-panel__hole-form"
      aria-label={t('scoring.holeForm.sectionAria', { holeNumber })}
    >
      <div className="scoring-panel__hole-meta-row">
        <label className="scoring-panel__field scoring-panel__field--compact">
          <span className="scoring-panel__label">{t('scoring.holeForm.par')}</span>
          <input
            className="scoring-panel__input"
            type="number"
            min={2}
            max={9}
            value={parValue}
            onChange={(event) => onParChange(event.target.value)}
            aria-label={t('scoring.holeForm.parAria', { holeNumber })}
          />
        </label>
        <label className="scoring-panel__field scoring-panel__field--compact">
          <span className="scoring-panel__label">{t('scoring.holeForm.lengthMeters')}</span>
          <input
            className="scoring-panel__input"
            type="number"
            min={1}
            max={5000}
            value={lengthValue}
            onChange={(event) => onLengthChange(event.target.value)}
            aria-label={t('scoring.holeForm.lengthAria', { holeNumber })}
            disabled={disableLength}
          />
        </label>
      </div>
      <p className="scoring-panel__muted scoring-panel__save-status" role="status" aria-live="polite">
        {saveStateLabel}
      </p>
      {children}
    </section>
  )
}
