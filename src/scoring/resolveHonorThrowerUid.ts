import type { ParticipantHoleScores } from './scorecardTable'

/** Participants with the minimum strokes on `hole` among `candidates` who have a recorded score. */
function lowestStrokesOnHole(
  hole: number,
  candidates: readonly string[],
  scores: ParticipantHoleScores,
): string[] {
  const key = String(hole)
  let best = Infinity
  for (const id of candidates) {
    const s = scores[id]?.[key]
    if (s && typeof s.strokes === 'number') {
      best = Math.min(best, s.strokes)
    }
  }
  if (!Number.isFinite(best)) return []
  return candidates.filter((id) => {
    const s = scores[id]?.[key]
    return s && typeof s.strokes === 'number' && s.strokes === best
  })
}

/**
 * Who throws first on `activeHoleNumber`: lowest strokes on the previous hole.
 * If several tie, walk to earlier holes **among those tied players** until one leader remains;
 * if still tied after hole 1, use roster order (`participantIds`) as a deterministic tie-break.
 */
export function resolveHonorThrowerUid(
  participantIds: readonly string[],
  scores: ParticipantHoleScores,
  activeHoleNumber: number,
): string | null {
  if (activeHoleNumber <= 1) return null

  let hole = activeHoleNumber - 1
  const winners = lowestStrokesOnHole(hole, participantIds, scores)
  if (winners.length === 0) return null
  if (winners.length === 1) return winners[0]!

  let candidates = winners
  hole -= 1
  while (hole >= 1 && candidates.length > 1) {
    const next = lowestStrokesOnHole(hole, candidates, scores)
    if (next.length === 1) return next[0]!
    if (next.length > 1) {
      candidates = next
      hole -= 1
      continue
    }
    hole -= 1
  }

  const order = new Map(participantIds.map((id, idx) => [id, idx]))
  return [...candidates].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0))[0] ?? null
}
