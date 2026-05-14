import type { Timestamp } from 'firebase/firestore'

export type RoundStatus = 'in_progress' | 'completed'

/**
 * Per-hole values supplied by the player when the chosen template omits par and/or length.
 * Keys are 1-based hole numbers as decimal strings (Firestore map keys).
 */
export type HoleOverrideMap = Record<
  string,
  {
    par?: number
    lengthMeters?: number | null
  }
>

/**
 * `rounds/{roundId}` — minimal shape for course epic (scoring epic will extend).
 * `holeOverrides` holds user par/length when the template is incomplete for that hole.
 */
export type RoundDoc = {
  ownerId: string
  courseId: string
  templateId: string
  status: RoundStatus
  holeOverrides: HoleOverrideMap
  startedAt: Timestamp
  completedAt?: Timestamp | null
}
