import type { Timestamp } from 'firebase/firestore'

/** Who can see a round in feeds; follower-only reads land in social epic (#5). */
export type RoundVisibility = 'public' | 'private' | 'unlisted'

/** Per-hole persisted score; `par` is snapshot at time of play (template or manual). */
export type HoleScoreEntry = {
  strokes: number
  par: number
  updatedAt: Timestamp
  updatedBy: string
}

export type RoundDoc = {
  ownerId: string
  participantIds: string[]
  courseId: string
  templateId: string
  /** Score protocol schema version (currently v1). */
  scoreProtocolVersion?: number
  /** Layout hole count snapshot for protocol validation and aggregation. */
  holeCount?: number | null
  visibility: RoundVisibility
  startedAt: Timestamp
  completedAt: Timestamp | null
  /** Keys are hole numbers as strings (`"1"` …). */
  holeScores: Record<string, HoleScoreEntry>
  createdAt: Timestamp
  updatedAt: Timestamp
}
