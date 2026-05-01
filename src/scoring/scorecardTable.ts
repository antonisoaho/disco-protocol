import { strokesParDeltaToSemantic, type ScoreSemantic } from '../lib/scoreSemantic'

export type ScorecardColumn =
  | { key: 'hole'; kind: 'hole'; label: 'Hole #' }
  | { key: 'par'; kind: 'par'; label: 'Par' }
  | { key: 'length'; kind: 'length'; label: 'Length' }
  | { key: string; kind: 'participant'; label: string; participantId: string }

export type ParticipantHoleScore = {
  strokes: number
  par: number
}

export type ParticipantHoleScores = Record<string, Record<string, ParticipantHoleScore>>

export type ParticipantTotals = {
  totalStrokes: number
  totalPar: number
  totalDelta: number
  scoredHoles: number
}

export type ScorecardGrandTotals = {
  totalStrokes: number
  totalPar: number
  totalDelta: number
  scoredHoles: number
  participantCount: number
}

export type HoleOutcome = {
  semantic: ScoreSemantic
  label: string
  symbol: string
  delta: number
}

export function buildScorecardColumns(
  participantIds: string[],
  displayNameByUid: Record<string, string>,
): ScorecardColumn[] {
  const baseColumns: ScorecardColumn[] = [
    { key: 'hole', kind: 'hole', label: 'Hole #' },
    { key: 'par', kind: 'par', label: 'Par' },
    { key: 'length', kind: 'length', label: 'Length' },
  ]
  const unique = new Set<string>()
  for (const participantId of participantIds) {
    if (!participantId || unique.has(participantId)) continue
    unique.add(participantId)
    const displayName = displayNameByUid[participantId]?.trim()
    baseColumns.push({
      key: `player:${participantId}`,
      kind: 'participant',
      label: displayName && displayName.length > 0 ? displayName : participantId,
      participantId,
    })
  }
  return baseColumns
}

export function computeParticipantTotals(
  participantIds: string[],
  participantHoleScores: ParticipantHoleScores,
): Record<string, ParticipantTotals> {
  const totals: Record<string, ParticipantTotals> = {}
  for (const participantId of participantIds) {
    const perParticipant = participantHoleScores[participantId] ?? {}
    let totalStrokes = 0
    let totalPar = 0
    let scoredHoles = 0
    for (const score of Object.values(perParticipant)) {
      if (!score) continue
      totalStrokes += score.strokes
      totalPar += score.par
      scoredHoles += 1
    }
    totals[participantId] = {
      totalStrokes,
      totalPar,
      totalDelta: totalStrokes - totalPar,
      scoredHoles,
    }
  }
  return totals
}

export function collectScorecardEditedHoleNumbers(edits: Record<string, string>): number[] {
  const holeNumbers = new Set<number>()
  for (const key of Object.keys(edits)) {
    if (key.startsWith('par:') || key.startsWith('length:')) {
      const hole = Number(key.split(':')[1])
      if (Number.isInteger(hole) && hole >= 1) {
        holeNumbers.add(hole)
      }
      continue
    }
    if (key.startsWith('score:')) {
      const parts = key.split(':')
      const hole = Number(parts[2])
      if (Number.isInteger(hole) && hole >= 1) {
        holeNumbers.add(hole)
      }
    }
  }
  return Array.from(holeNumbers).sort((a, b) => a - b)
}

export function computeGrandTotals(participantTotals: Record<string, ParticipantTotals>): ScorecardGrandTotals {
  const values = Object.values(participantTotals)
  let totalStrokes = 0
  let totalPar = 0
  let totalDelta = 0
  let scoredHoles = 0
  for (const totals of values) {
    totalStrokes += totals.totalStrokes
    totalPar += totals.totalPar
    totalDelta += totals.totalDelta
    scoredHoles += totals.scoredHoles
  }
  return {
    totalStrokes,
    totalPar,
    totalDelta,
    scoredHoles,
    participantCount: values.length,
  }
}

function outcomeLabel(delta: number): string {
  if (delta <= -2) return 'Eagle or better'
  if (delta === -1) return 'Birdie'
  if (delta === 0) return 'Par'
  if (delta === 1) return 'Bogey'
  return 'Double bogey or worse'
}

function outcomeSymbol(delta: number): string {
  if (delta <= -2) return 'E+'
  if (delta === -1) return 'B'
  if (delta === 0) return 'PAR'
  if (delta === 1) return 'BG'
  return 'D+'
}

export function getOutcomeForScore(strokes: number, par: number): HoleOutcome {
  const delta = strokes - par
  return {
    semantic: strokesParDeltaToSemantic(strokes, par),
    label: outcomeLabel(delta),
    symbol: outcomeSymbol(delta),
    delta,
  }
}
