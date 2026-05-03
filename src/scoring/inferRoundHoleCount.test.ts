import { describe, expect, it } from 'vitest'
import type { HoleScoreEntry, RoundDoc } from '../firebase/roundTypes'
import { inferRoundHoleCount } from './inferRoundHoleCount'

const ts = { seconds: 0, nanoseconds: 0 } as RoundDoc['startedAt']

function holeScore(strokes: number, par: number): HoleScoreEntry {
  return { strokes, par, updatedAt: ts, updatedBy: 'o' }
}

function baseRound(overrides: Partial<RoundDoc> = {}): RoundDoc {
  return {
    ownerId: 'o',
    participantIds: ['o'],
    courseId: 'c',
    templateId: 't',
    scoreProtocolVersion: 1,
    holeCount: null,
    visibility: 'private',
    startedAt: ts,
    completedAt: null,
    holeScores: {},
    participantHoleScores: {},
    createdAt: ts,
    updatedAt: ts,
    ...overrides,
  }
}

describe('inferRoundHoleCount', () => {
  it('uses explicit holeCount when valid', () => {
    expect(inferRoundHoleCount(baseRound({ holeCount: 14 }))).toBe(14)
  })

  it('does not force 18 when holeCount is missing but scores imply 14 holes', () => {
    const oScores: Record<string, HoleScoreEntry> = {}
    for (let n = 1; n <= 14; n += 1) {
      oScores[String(n)] = holeScore(4, 4)
    }
    expect(
      inferRoundHoleCount(baseRound({ holeCount: null, participantHoleScores: { o: oScores } })),
    ).toBe(14)
  })

  it('reads max hole from legacy holeScores map', () => {
    expect(
      inferRoundHoleCount(
        baseRound({
          holeCount: null,
          holeScores: {
            '12': holeScore(3, 3),
          },
        }),
      ),
    ).toBe(12)
  })

  it('uses fresh draft hole count when no scores yet', () => {
    expect(
      inferRoundHoleCount(
        baseRound({
          courseSource: 'fresh',
          holeCount: null,
          courseDraft: {
            name: 'X',
            holes: Array.from({ length: 9 }, (_, i) => ({ number: i + 1, par: 3 })),
          },
        }),
      ),
    ).toBe(9)
  })

  it('defaults to 18 when there is no holeCount, scores, or draft holes', () => {
    expect(inferRoundHoleCount(baseRound({ holeCount: null }))).toBe(18)
  })
})
