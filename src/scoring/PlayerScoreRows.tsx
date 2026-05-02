import type { TFunction } from 'i18next'
import {
  scoreTierToNotationClassName,
  strokesParDeltaToNotation,
  type ScoreTier,
} from '../lib/scoreSemantic'
import { useTranslation } from 'react-i18next'

type Props = {
  participantIds: string[]
  participantNames: Record<string, string>
  scoreInputs: Record<string, string>
  onScoreChange: (participantUid: string, value: string) => void
  expandedByUid: Record<string, boolean>
  onToggleExpanded: (participantUid: string) => void
  parValue: number | null
}

function parseIntegerInput(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null
  return Number(value)
}

function scoreTierLabel(t: TFunction<'common'>, tier: ScoreTier): string {
  switch (tier) {
    case 'albatross-plus':
      return t('scoring.scoreTier.albatrossPlus')
    case 'eagle':
      return t('scoring.scoreTier.eagle')
    case 'birdie':
      return t('scoring.scoreTier.birdie')
    case 'par':
      return t('scoring.scoreTier.par')
    case 'bogey':
      return t('scoring.scoreTier.bogey')
    case 'double-bogey':
      return t('scoring.scoreTier.doubleBogey')
    case 'triple-bogey-plus':
      return t('scoring.scoreTier.tripleBogeyPlus')
    default:
      return ''
  }
}

export function PlayerScoreRows({
  participantIds,
  participantNames,
  scoreInputs,
  onScoreChange,
  expandedByUid,
  onToggleExpanded,
  parValue,
}: Props) {
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
        const isExpanded = expandedByUid[participantUid] ?? true
        const panelId = `player-row-${participantUid}`
        return (
          <article key={participantUid} className="scoring-panel__player-row" role="listitem">
            <button
              type="button"
              className="scoring-panel__player-row-toggle"
              aria-expanded={isExpanded}
              aria-controls={panelId}
              onClick={() => onToggleExpanded(participantUid)}
            >
              <span className="scoring-panel__player-row-name">{displayName}</span>
              <span className="scoring-panel__player-row-summary">
                {inputValue.trim().length > 0
                  ? t('scoring.playerRows.strokesSummary', { strokes: inputValue })
                  : t('scoring.playerRows.noScoreYet')}
              </span>
            </button>
            {isExpanded ? (
              <div id={panelId} className="scoring-panel__player-row-body">
                <label className="scoring-panel__field scoring-panel__field--grow">
                  <span className="scoring-panel__label">{t('scoring.playerRows.strokes')}</span>
                  <input
                    className="scoring-panel__input"
                    type="number"
                    min={1}
                    max={99}
                    value={inputValue}
                    onChange={(event) => onScoreChange(participantUid, event.target.value)}
                    aria-label={t('scoring.playerRows.strokesForPlayerAria', { displayName })}
                  />
                </label>
                {notation && parsedScore !== null && notationLabel ? (
                  <p
                    className={`scoring-panel__player-row-notation ${scoreTierToNotationClassName(notation.tier)}`}
                    aria-label={t('scoring.playerRows.notationAria', { displayName, label: notationLabel })}
                  >
                    {notationLabel} ({notation.delta > 0 ? `+${notation.delta}` : notation.delta})
                  </p>
                ) : (
                  <p className="scoring-panel__muted">{t('scoring.playerRows.enterStrokesHint')}</p>
                )}
              </div>
            ) : null}
          </article>
        )
      })}
    </div>
  )
}
