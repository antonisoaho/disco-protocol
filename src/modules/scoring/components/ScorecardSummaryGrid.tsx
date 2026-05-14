import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { scoreTierToNotationClassName, strokesParDeltaToNotation } from '@modules/scoring/domain/scoreSemantic'
import { scoreTierLabel } from '@modules/scoring/domain/scoreTierI18n'
import { computeParticipantTotals, type ParticipantHoleScores } from '@core/domain/scorecardTable'

type Props = {
  participantIds: string[]
  participantNames: Record<string, string>
  scoresByParticipant: ParticipantHoleScores
  holeCount: number
}

export function ScorecardSummaryGrid({ participantIds, participantNames, scoresByParticipant, holeCount }: Props) {
  const { t } = useTranslation('common')

  const holes = useMemo(() => Array.from({ length: holeCount }, (_, i) => i + 1), [holeCount])

  const parByHole = useMemo(() => {
    const out: Record<number, number | null> = {}
    for (const h of holes) {
      let par: number | null = null
      for (const pid of participantIds) {
        const s = scoresByParticipant[pid]?.[String(h)]
        if (s && typeof s.par === 'number') {
          par = s.par
          break
        }
      }
      out[h] = par
    }
    return out
  }, [holes, participantIds, scoresByParticipant])

  const totalsByParticipant = useMemo(
    () => computeParticipantTotals(participantIds, scoresByParticipant),
    [participantIds, scoresByParticipant],
  )

  if (holeCount < 1) {
    return null
  }

  return (
    <div
      className="scorecard-summary-grid__scroll"
      role="region"
      aria-label={t('scoring.summary.aria')}
    >
      <table className="scorecard-summary-grid">
        <thead>
          <tr>
            <th scope="col" className="scorecard-summary-grid__corner">
              {t('scoring.summary.playerCol')}
            </th>
            {holes.map((h) => (
              <th key={h} scope="col" className="scorecard-summary-grid__hole-head">
                {h}
              </th>
            ))}
            <th scope="col" className="scorecard-summary-grid__total-head">
              {t('scoring.summary.totalAbbr')}
            </th>
          </tr>
          <tr className="scorecard-summary-grid__par-row">
            <th scope="row" className="scorecard-summary-grid__par-label">
              {t('scoring.summary.parRow')}
            </th>
            {holes.map((h) => (
              <td key={h} className="scorecard-summary-grid__par-cell">
                {parByHole[h] ?? '—'}
              </td>
            ))}
            <td className="scorecard-summary-grid__par-cell scorecard-summary-grid__par-cell--total">
              {(() => {
                let sum = 0
                let n = 0
                for (const h of holes) {
                  const p = parByHole[h]
                  if (typeof p === 'number') {
                    sum += p
                    n += 1
                  }
                }
                return n > 0 ? sum : '—'
              })()}
            </td>
          </tr>
        </thead>
        <tbody>
          {participantIds.map((participantId) => {
            const displayName = participantNames[participantId] ?? participantId
            const totals = totalsByParticipant[participantId]
            return (
              <tr key={participantId}>
                <th scope="row" className="scorecard-summary-grid__player-name">
                  {displayName}
                </th>
                {holes.map((h) => {
                  const key = String(h)
                  const cell = scoresByParticipant[participantId]?.[key]
                  if (!cell) {
                    return (
                      <td key={h} className="scorecard-summary-grid__stroke-cell scorecard-summary-grid__stroke-cell--empty">
                        —
                      </td>
                    )
                  }
                  const notation = strokesParDeltaToNotation(cell.strokes, cell.par)
                  const tierLabel = scoreTierLabel(t, notation.tier)
                  return (
                    <td
                      key={h}
                      className={`scorecard-summary-grid__stroke-cell ${scoreTierToNotationClassName(notation.tier)}`}
                      title={t('scoring.summary.cellTitle', {
                        strokes: cell.strokes,
                        par: cell.par,
                        label: tierLabel,
                        delta: notation.delta > 0 ? `+${notation.delta}` : `${notation.delta}`,
                      })}
                    >
                      {cell.strokes}
                    </td>
                  )
                })}
                <td className="scorecard-summary-grid__total-cell">
                  {totals && totals.scoredHoles > 0 ? totals.totalStrokes : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
