import { scoreTierToNotationClassName, strokesParDeltaToNotation } from '@modules/scoring/domain/scoreSemantic'
import { useTranslation } from 'react-i18next'
import { scoreTierLabel } from '@modules/scoring/domain/scoreTierI18n'

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
        const notationTitleLabel = notation ? scoreTierLabel(t, notation.tier) : null
        const shellTierClass =
          notation && parsedScore !== null ? scoreTierToNotationClassName(notation.tier) : ''
        const deltaText =
          notation && parsedScore !== null
            ? notation.delta > 0
              ? `+${notation.delta}`
              : `${notation.delta}`
            : null

        const inputTitle =
          notation && notationTitleLabel && deltaText !== null
            ? `${notationTitleLabel} (${deltaText})`
            : typeof parValue !== 'number'
              ? t('scoring.playerRows.needParForResult')
              : undefined

        return (
          <div key={participantUid} className="scoring-panel__player-row scoring-panel__player-row--compact" role="listitem">
            <span className="scoring-panel__player-row-name scoring-panel__player-row-name--compact">{displayName}</span>
            <div className="scoring-panel__player-score-control">
              <div className={`scoring-panel__player-score-input-shell ${shellTierClass}`.trim()}>
                <input
                  className="scoring-panel__player-score-input"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={2}
                  autoComplete="off"
                  value={inputValue}
                  title={inputTitle}
                  onChange={(event) => onScoreChange(participantUid, event.target.value.replace(/\D/g, '').slice(0, 2))}
                  aria-label={t('scoring.playerRows.strokesForPlayerAria', { displayName })}
                />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
