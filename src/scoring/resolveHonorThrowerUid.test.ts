import { describe, expect, it } from 'vitest'
import { resolveHonorThrowerUid } from './resolveHonorThrowerUid'
import type { ParticipantHoleScores } from './scorecardTable'

describe('resolveHonorThrowerUid', () => {
  it('returns sole leader on previous hole', () => {
    const s: ParticipantHoleScores = {
      a: { '1': { strokes: 3, par: 3 } },
      b: { '1': { strokes: 4, par: 3 } },
    }
    expect(resolveHonorThrowerUid(['a', 'b'], s, 2)).toBe('a')
  })

  it('breaks a tie on previous hole using the hole before among tied players', () => {
    const s: ParticipantHoleScores = {
      a: {
        '1': { strokes: 3, par: 3 },
        '2': { strokes: 4, par: 3 },
      },
      b: {
        '1': { strokes: 3, par: 3 },
        '2': { strokes: 5, par: 3 },
      },
    }
    expect(resolveHonorThrowerUid(['a', 'b'], s, 3)).toBe('a')
  })

  it('walks back among tied players until one clear leader', () => {
    const s: ParticipantHoleScores = {
      a: {
        '1': { strokes: 2, par: 3 },
        '2': { strokes: 3, par: 3 },
        '3': { strokes: 4, par: 3 },
      },
      b: {
        '1': { strokes: 3, par: 3 },
        '2': { strokes: 3, par: 3 },
        '3': { strokes: 4, par: 3 },
      },
    }
    // Hole 3: tie 4–4. Hole 2 among a,b: 3–3 tie. Hole 1 among a,b: 2 vs 3 → a.
    expect(resolveHonorThrowerUid(['a', 'b'], s, 4)).toBe('a')
  })

  it('uses roster order when ties never break by earlier holes', () => {
    const s: ParticipantHoleScores = {
      a: { '1': { strokes: 3, par: 3 }, '2': { strokes: 3, par: 3 } },
      b: { '1': { strokes: 3, par: 3 }, '2': { strokes: 3, par: 3 } },
    }
    expect(resolveHonorThrowerUid(['a', 'b'], s, 3)).toBe('a')
  })
})
