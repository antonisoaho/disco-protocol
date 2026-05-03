import type { RoundCourseSource } from '../firebase/roundTypes'

export type HoleDraftInputs = {
  parInput: string
  lengthInput: string
  scoreInputs: Record<string, string>
}

export type PersistedHoleState = {
  par: number | null
  lengthMeters: number | null
  participantScores: Record<string, { strokes: number; par: number } | undefined>
}

export type HoleAutosavePayload = {
  metadata: { par: string; lengthMeters: string } | null
  participantScoreUpdates: Array<{ participantUid: string; strokes: number; par: number }>
  hasMeaningfulChange: boolean
  validationError: string | null
  /** When only par changes on a saved-layout round (owner/admin correction). */
  savedParSync: { par: number } | null
}

function parseIntegerInput(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null
  return Number(value)
}

export function clampHoleNumber(holeNumber: number, holeCount: number): number {
  const safeHoleCount =
    Number.isFinite(holeCount) && holeCount >= 1 ? Math.floor(holeCount) : 1
  if (!Number.isFinite(holeNumber)) return 1
  return Math.min(safeHoleCount, Math.max(1, Math.floor(holeNumber)))
}

export function stepHoleNumber(
  currentHoleNumber: number,
  direction: -1 | 1,
  holeCount: number,
): number {
  return clampHoleNumber(currentHoleNumber + direction, holeCount)
}

export function mergeAutosavePayload(params: {
  courseSource: RoundCourseSource
  participantIds: string[]
  draft: HoleDraftInputs
  persisted: PersistedHoleState
  /** When true, saved-layout rounds may sync a new par across scored cells (owner/admin UI). */
  allowSavedParAdjust?: boolean
}): HoleAutosavePayload {
  const normalizedParInput = params.draft.parInput.trim()
  const normalizedLengthInput = params.draft.lengthInput.trim()
  const persistedParInput =
    typeof params.persisted.par === 'number' ? String(params.persisted.par) : ''
  const persistedLengthInput =
    typeof params.persisted.lengthMeters === 'number'
      ? String(params.persisted.lengthMeters)
      : ''

  const metadataChanged =
    params.courseSource === 'fresh' &&
    (normalizedParInput !== persistedParInput ||
      normalizedLengthInput !== persistedLengthInput)
  const metadata =
    params.courseSource === 'fresh' && metadataChanged
      ? { par: normalizedParInput, lengthMeters: normalizedLengthInput }
      : null

  const explicitParValue = parseIntegerInput(normalizedParInput)
  const participantScoreUpdates: Array<{
    participantUid: string
    strokes: number
    par: number
  }> = []

  for (const participantUid of params.participantIds) {
    const rawScoreInput = params.draft.scoreInputs[participantUid] ?? ''
    const trimmedScoreInput = rawScoreInput.trim()
    if (trimmedScoreInput.length === 0) continue

    const strokes = parseIntegerInput(trimmedScoreInput)
    if (strokes === null) {
      return {
        metadata,
        participantScoreUpdates: [],
        hasMeaningfulChange: false,
        validationError: `Score for ${participantUid} must be an integer.`,
        savedParSync: null,
      }
    }

    const persistedScore = params.persisted.participantScores[participantUid]
    const parForScore =
      explicitParValue ?? persistedScore?.par ?? params.persisted.par ?? null
    if (typeof parForScore !== 'number') {
      return {
        metadata,
        participantScoreUpdates: [],
        hasMeaningfulChange: false,
        validationError: `Set par before saving score for ${participantUid}.`,
        savedParSync: null,
      }
    }

    const scoreChanged =
      !persistedScore ||
      persistedScore.strokes !== strokes ||
      persistedScore.par !== parForScore
    if (scoreChanged) {
      participantScoreUpdates.push({
        participantUid,
        strokes,
        par: parForScore,
      })
    }
  }

  let savedParSync: { par: number } | null = null
  if (
    params.courseSource === 'saved' &&
    params.allowSavedParAdjust &&
    explicitParValue !== null &&
    explicitParValue !== params.persisted.par &&
    participantScoreUpdates.length === 0
  ) {
    const hasAnyScore = params.participantIds.some(
      (participantUid) => params.persisted.participantScores[participantUid] !== undefined,
    )
    if (hasAnyScore) {
      savedParSync = { par: explicitParValue }
    }
  }

  return {
    metadata,
    participantScoreUpdates,
    hasMeaningfulChange: Boolean(
      metadataChanged || participantScoreUpdates.length > 0 || savedParSync !== null,
    ),
    validationError: null,
    savedParSync,
  }
}
