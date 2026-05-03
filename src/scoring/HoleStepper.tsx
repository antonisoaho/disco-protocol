import { useTranslation } from 'react-i18next'

type Props = {
  holeCount: number
  currentHole: number
  onSelectHole: (holeNumber: number) => void
  onPrevious: () => void
  onNext: () => void
  disabled?: boolean
  statusLabel?: string
  /** Shown above the hole title (e.g. leading player vs par). */
  leaderHint?: string | null
}

export function HoleStepper({
  holeCount,
  currentHole,
  onSelectHole,
  onPrevious,
  onNext,
  disabled = false,
  statusLabel,
  leaderHint,
}: Props) {
  const { t } = useTranslation('common')
  const safeHoleCount = Number.isFinite(holeCount) && holeCount > 0 ? Math.floor(holeCount) : 1

  return (
    <div className="scoring-panel__hole-stepper">
      <div className="scoring-panel__hole-stepper-header">
        <div>
          {leaderHint ? <p className="scoring-panel__hole-stepper-leader">{leaderHint}</p> : null}
          <p className="scoring-panel__hole-stepper-title">
            {t('scoring.stepper.holeTitle', { holeNumber: currentHole })}
          </p>
          <p className="scoring-panel__hole-stepper-meta">
            {currentHole} / {safeHoleCount}
            {statusLabel ? ` · ${statusLabel}` : ''}
          </p>
        </div>
        <div className="scoring-panel__hole-stepper-actions">
          <button
            type="button"
            className="scoring-panel__button"
            onClick={onPrevious}
            disabled={disabled || currentHole <= 1}
          >
            {t('scoring.stepper.previous')}
          </button>
          <button
            type="button"
            className="scoring-panel__button scoring-panel__button--primary"
            onClick={onNext}
            disabled={disabled || currentHole >= safeHoleCount}
          >
            {t('scoring.stepper.next')}
          </button>
        </div>
      </div>
      <div className="scoring-panel__hole-dots" role="tablist" aria-label={t('scoring.stepper.selectHoleAria')}>
        {Array.from({ length: safeHoleCount }, (_, index) => {
          const holeNumber = index + 1
          const isActive = holeNumber === currentHole
          return (
            <button
              key={holeNumber}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-label={t('scoring.stepper.goToHoleAria', { holeNumber })}
              className={`scoring-panel__hole-dot${isActive ? ' scoring-panel__hole-dot--active' : ''}`}
              onClick={() => onSelectHole(holeNumber)}
              disabled={disabled}
            >
              {holeNumber}
            </button>
          )
        })}
      </div>
    </div>
  )
}
