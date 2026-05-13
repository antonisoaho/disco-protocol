import { scoreTierToNotationClassName, strokesParDeltaToNotation } from '../lib/scoreSemantic'
import { useTranslation } from 'react-i18next'
import { scoreTierLabel } from './scoreTierI18n'

type Props = {
  participantIds: string[]
  participantNames: Record<string, string>
  scoreInputs: Record<string, string>
  onScoreChange: (participantUid: string, value: string) => void
  parValue: number | null
}

function parseIntegerInput(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null
  return Number(value)
}

export function PlayerScoreRows({ participantIds, participantNames, scoreInputs, onScoreChange, parValue }: Props) {
  const { t } = useTranslation('common')

  return (
    <div className="scoring-panel__player-rows" role="list" aria-label={t('scoring.playerRows.listAria')}>
      {participantIds.map((participantUid) => {
        const displayName = participantNames[participantUid] ?? participantUid
        const inputValue = scoreInputs[participantUid] ?? ''
        const parsedScore = parseIntegerInput(inputValue)
        const notation =
          parsedScore !== null && typeof parValue === 'number'
            ? strokesParDeltaToNotation(parsedScore, parValue)
            : null
        const notationLabel = notation ? scoreTierLabel(t, notation.tier) : null
        const chipClass = notation ? scoreTierToNotationClassName(notation.tier) : 'scoring-panel__player-score-chip--muted'
        const deltaText =
          notation && parsedScore !== null
            ? notation.delta > 0
              ? `+${notation.delta}`
              : `${notation.delta}`
            : null

        return (
          <div key={participantUid} className="scoring-panel__player-row scoring-panel__player-row--compact" role="listitem">
            <span className="scoring-panel__player-row-name scoring-panel__player-row-name--compact">{displayName}</span>
            <div className="scoring-panel__player-score-control">
              <div className="scoring-panel__player-score-input-shell">
                <input
                  className="scoring-panel__player-score-input"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={2}
                  autoComplete="off"
                  value={inputValue}
                  onChange={(event) => onScoreChange(participantUid, event.target.value.replace(/\D/g, '').slice(0, 2))}
                  aria-label={t('scoring.playerRows.strokesForPlayerAria', { displayName })}
                />
                <span
                  className={`scoring-panel__player-score-chip ${chipClass}`}
                  aria-hidden={notation ? undefined : true}
                  title={
                    notation && notationLabel && deltaText !== null
                      ? `${notationLabel} (${deltaText})`
                      : typeof parValue !== 'number'
                        ? t('scoring.playerRows.needParForResult')
                        : undefined
                  }
                >
                  {notation && notationLabel && deltaText !== null ? (
                    <>
                      <span className="scoring-panel__player-score-chip-label">{notationLabel}</span>
                      <span className="scoring-panel__player-score-chip-delta">{deltaText}</span>
                    </>
                  ) : typeof parValue !== 'number' ? (
                    <span className="scoring-panel__player-score-chip-placeholder">—</span>
                  ) : inputValue.trim() === '' ? (
                    <span className="scoring-panel__player-score-chip-placeholder">—</span>
                  ) : (
                    <span className="scoring-panel__player-score-chip-placeholder">…</span>
                  )}
                </span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
