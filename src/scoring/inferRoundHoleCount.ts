import type { RoundDoc } from '../firebase/roundTypes'

const DEFAULT_FULL_ROUND_HOLES = 18

/**
 * Effective layout length for UI and score protocol.
 * Prefer persisted `holeCount`; otherwise infer from scored holes or fresh draft length.
 * Does not inflate toward 18 when scores/draft already imply a shorter round (partial layouts).
 */
export function inferRoundHoleCount(data: RoundDoc): number {
  const explicit = data.holeCount
  if (typeof explicit === 'number' && Number.isInteger(explicit) && explicit >= 1) {
    return explicit
  }

  let fromScores = 0
  for (const key of Object.keys(data.holeScores ?? {})) {
    const value = Number(key)
    if (Number.isInteger(value) && value >= 1) {
      fromScores = Math.max(fromScores, value)
    }
  }

  if (data.participantHoleScores) {
    for (const holeMap of Object.values(data.participantHoleScores)) {
      if (!holeMap) continue
      for (const key of Object.keys(holeMap)) {
        const value = Number(key)
        if (Number.isInteger(value) && value >= 1) {
          fromScores = Math.max(fromScores, value)
        }
      }
    }
  }

  const fromDraftHoles = data.courseDraft?.holes?.length ?? 0
  const inferred = Math.max(fromScores, fromDraftHoles)
  if (inferred >= 1) {
    return inferred
  }

  return DEFAULT_FULL_ROUND_HOLES
}
