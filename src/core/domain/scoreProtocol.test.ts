import { describe, expect, it } from 'vitest'
import {
  SCORE_PROTOCOL_V1,
  ScoreProtocolValidationError,
  aggregateScoreProtocol,
  normalizeHoleScoreUpdate,
  normalizeScoreProtocol,
  validateScoreProtocol,
} from '@core/domain/scoreProtocol'

describe('normalizeScoreProtocol', () => {
  it('normalizes protocol version, hole keys, and numeric values', () => {
    const normalized = normalizeScoreProtocol({
      holeCount: '3',
      holeScores: {
        '02': { strokes: '4', par: '3' },
        '1': { strokes: 2, par: 3 },
      },
    })

    expect(normalized).toEqual({
      version: SCORE_PROTOCOL_V1,
      holeCount: 3,
      holeScores: {
        '1': { strokes: 2, par: 3 },
        '2': { strokes: 4, par: 3 },
      },
    })
  })

  it('rejects hole maps that collide after key normalization', () => {
    expect(() =>
      normalizeScoreProtocol({
        holeCount: 3,
        holeScores: {
          '1': { strokes: 3, par: 3 },
          '01': { strokes: 2, par: 3 },
        },
      }),
    ).toThrow(ScoreProtocolValidationError)
  })
})

describe('validateScoreProtocol', () => {
  it('reports protocol and hole validation issues', () => {
    const issues = validateScoreProtocol({
      version: 2,
      holeCount: 2,
      holeScores: {
        '3': { strokes: 5, par: 3 },
        '1': { strokes: 0, par: 3 },
      },
    })

    expect(issues.map((issue) => issue.code).sort()).toEqual([
      'hole_out_of_range',
      'invalid_strokes',
      'unsupported_version',
    ])
  })
})

describe('aggregateScoreProtocol', () => {
  it('computes totals and missing holes for partial rounds', () => {
    const summary = aggregateScoreProtocol(
      normalizeScoreProtocol({
        holeCount: 4,
        holeScores: {
          '3': { strokes: 4, par: 3 },
          '1': { strokes: 2, par: 3 },
          '2': { strokes: 4, par: 3 },
        },
      }),
    )

    expect(summary).toEqual({
      scoredHoles: 3,
      totalStrokes: 10,
      totalPar: 9,
      totalDelta: 1,
      missingHoles: [4],
    })
  })
})

describe('normalizeHoleScoreUpdate', () => {
  it('normalizes user-entered values into a canonical hole mutation', () => {
    expect(
      normalizeHoleScoreUpdate({
        holeNumber: '07',
        strokes: '4',
        par: '3',
      }),
    ).toEqual({
      holeNumber: 7,
      holeKey: '7',
      strokes: 4,
      par: 3,
    })
  })

  it('rejects updates beyond configured hole count', () => {
    expect(() =>
      normalizeHoleScoreUpdate(
        {
          holeNumber: 19,
          strokes: 4,
          par: 3,
        },
        { holeCount: 18 },
      ),
    ).toThrow(ScoreProtocolValidationError)
  })
})
