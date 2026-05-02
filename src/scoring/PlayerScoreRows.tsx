import {
  scoreTierToNotationClassName,
  strokesParDeltaToNotation,
} from '../lib/scoreSemantic'

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

export function PlayerScoreRows({
  participantIds,
  participantNames,
  scoreInputs,
  onScoreChange,
  expandedByUid,
  onToggleExpanded,
  parValue,
}: Props) {
  return (
    <div className="scoring-panel__player-rows" role="list" aria-label="Player scoring rows">
      {participantIds.map((participantUid) => {
        const displayName = participantNames[participantUid] ?? participantUid
        const inputValue = scoreInputs[participantUid] ?? ''
        const parsedScore = parseIntegerInput(inputValue)
        const notation =
          parsedScore !== null && typeof parValue === 'number'
            ? strokesParDeltaToNotation(parsedScore, parValue)
            : null
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
                {inputValue.trim().length > 0 ? `${inputValue} strokes` : 'No score yet'}
              </span>
            </button>
            {isExpanded ? (
              <div id={panelId} className="scoring-panel__player-row-body">
                <label className="scoring-panel__field scoring-panel__field--grow">
                  <span className="scoring-panel__label">Strokes</span>
                  <input
                    className="scoring-panel__input"
                    type="number"
                    min={1}
                    max={99}
                    value={inputValue}
                    onChange={(event) => onScoreChange(participantUid, event.target.value)}
                    aria-label={`Strokes for ${displayName}`}
                  />
                </label>
                {notation && parsedScore !== null ? (
                  <p
                    className={`scoring-panel__player-row-notation ${scoreTierToNotationClassName(notation.tier)}`}
                    aria-label={`${displayName}: ${notation.label}`}
                  >
                    {notation.label} ({notation.delta > 0 ? `+${notation.delta}` : notation.delta})
                  </p>
                ) : (
                  <p className="scoring-panel__muted">Enter strokes to see notation.</p>
                )}
              </div>
            ) : null}
          </article>
        )
      })}
    </div>
  )
}
