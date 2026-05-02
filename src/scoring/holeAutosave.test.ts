import { describe, expect, it } from 'vitest'
import {
  clampHoleNumber,
  mergeAutosavePayload,
  stepHoleNumber,
} from './holeAutosave'

describe('clampHoleNumber', () => {
  it('keeps hole number within [1..holeCount]', () => {
    expect(clampHoleNumber(0, 18)).toBe(1)
    expect(clampHoleNumber(7, 18)).toBe(7)
    expect(clampHoleNumber(25, 18)).toBe(18)
  })
})

describe('stepHoleNumber', () => {
  it('applies previous/next movement and respects bounds', () => {
    expect(stepHoleNumber(1, -1, 9)).toBe(1)
    expect(stepHoleNumber(3, 1, 9)).toBe(4)
    expect(stepHoleNumber(9, 1, 9)).toBe(9)
  })
})

describe('mergeAutosavePayload', () => {
  it('merges draft data into metadata and score updates', () => {
    const payload = mergeAutosavePayload({
      courseSource: 'fresh',
      participantIds: ['u-1', 'u-2'],
      draft: {
        parInput: '4',
        lengthInput: '101',
        scoreInputs: {
          'u-1': '3',
          'u-2': '',
        },
      },
      persisted: {
        par: 3,
        lengthMeters: 90,
        participantScores: {
          'u-1': { strokes: 4, par: 3 },
          'u-2': undefined,
        },
      },
    })

    expect(payload.validationError).toBeNull()
    expect(payload.metadata).toEqual({ par: '4', lengthMeters: '101' })
    expect(payload.participantScoreUpdates).toEqual([
      {
        participantUid: 'u-1',
        strokes: 3,
        par: 4,
      },
    ])
    expect(payload.hasMeaningfulChange).toBe(true)
  })

  it('returns no-op payload when nothing changed', () => {
    const payload = mergeAutosavePayload({
      courseSource: 'saved',
      participantIds: ['u-1'],
      draft: {
        parInput: '3',
        lengthInput: '',
        scoreInputs: {
          'u-1': '3',
        },
      },
      persisted: {
        par: 3,
        lengthMeters: null,
        participantScores: {
          'u-1': { strokes: 3, par: 3 },
        },
      },
    })

    expect(payload).toEqual({
      metadata: null,
      participantScoreUpdates: [],
      hasMeaningfulChange: false,
      validationError: null,
    })
  })
})
