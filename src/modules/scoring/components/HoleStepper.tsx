import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { clampHoleNumber } from '@modules/scoring/domain/holeAutosave'

type Props = {
  holeCount: number
  currentHole: number
  onSelectHole: (holeNumber: number) => void
  onPrevious: () => void
  onNext: () => void
  disabled?: boolean
  /** Who throws first on this hole (lowest score on previous hole). */
  honorHint?: string | null
}

export function HoleStepper({
  holeCount,
  currentHole,
  onSelectHole,
  onPrevious,
  onNext,
  disabled = false,
  honorHint,
}: Props) {
  const { t } = useTranslation('common')
  const safeHoleCount = Number.isFinite(holeCount) && holeCount > 0 ? Math.floor(holeCount) : 1
  const [holeField, setHoleField] = useState(() => String(currentHole))
  const commitHoleField = useCallback(() => {
    const parsed = Number.parseInt(holeField.trim(), 10)
    if (!Number.isFinite(parsed)) {
      setHoleField(String(currentHole))
      return
    }
    const next = clampHoleNumber(parsed, safeHoleCount)
    setHoleField(String(next))
    if (next !== currentHole) {
      onSelectHole(next)
    }
  }, [holeField, currentHole, onSelectHole, safeHoleCount])

  return (
    <div className="scoring-panel__hole-stepper">
      <div className="scoring-panel__hole-nav" role="group" aria-label={t('scoring.stepper.navigateHoleGroupAria')}>
        <button
          type="button"
          className="scoring-panel__hole-nav-arrow scoring-panel__hole-nav-arrow--prev"
          onClick={onPrevious}
          disabled={disabled || currentHole <= 1}
          aria-label={t('scoring.stepper.previousHoleAria')}
        >
          <span aria-hidden="true">‹</span>
        </button>
        <label className="scoring-panel__hole-nav-input-label">
          <span className="scoring-panel__hole-nav-input-caption">{t('scoring.stepper.currentHoleCaption')}</span>
          <input
            className="scoring-panel__hole-nav-input"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={2}
            autoComplete="off"
            disabled={disabled}
            value={holeField}
            onChange={(event) => setHoleField(event.target.value.replace(/\D/g, '').slice(0, 2))}
            onBlur={() => commitHoleField()}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                commitHoleField()
              }
            }}
            aria-label={t('scoring.stepper.currentHoleInputAria', { total: safeHoleCount })}
          />
        </label>
        <button
          type="button"
          className="scoring-panel__hole-nav-arrow scoring-panel__hole-nav-arrow--next"
          onClick={onNext}
          disabled={disabled || currentHole >= safeHoleCount}
          aria-label={t('scoring.stepper.nextHoleAria')}
        >
          <span aria-hidden="true">›</span>
        </button>
      </div>
      <p className="scoring-panel__hole-nav-meta">
        {t('scoring.stepper.holeOfTotal', { current: currentHole, total: safeHoleCount })}
      </p>
      {honorHint ? <p className="scoring-panel__hole-honor">{honorHint}</p> : null}
    </div>
  )
}
