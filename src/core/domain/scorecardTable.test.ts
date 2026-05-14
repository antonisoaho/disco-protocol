import { describe, expect, it } from 'vitest'
import {
  buildScorecardColumns,
  collectScorecardEditedHoleNumbers,
  computeGrandTotals,
  computeParticipantTotals,
  getOutcomeForScore,
  pickLeadingParticipantIds,
} from '@core/domain/scorecardTable'

describe('buildScorecardColumns', () => {
  it('builds fixed columns and dynamic participant columns in order', () => {
    expect(
      buildScorecardColumns(['u-1', 'u-2'], {
        'u-1': 'Ada',
        'u-2': 'Byron',
      }),
    ).toEqual([
      { key: 'hole', kind: 'hole', label: 'Hole #' },
      { key: 'par', kind: 'par', label: 'Par' },
      { key: 'length', kind: 'length', label: 'Length' },
      { key: 'player:u-1', kind: 'participant', label: 'Ada', participantId: 'u-1' },
      { key: 'player:u-2', kind: 'participant', label: 'Byron', participantId: 'u-2' },
    ])
  })
})

describe('computeParticipantTotals', () => {
  it('aggregates strokes and par per participant', () => {
    expect(
      computeParticipantTotals(['u-1', 'u-2'], {
        'u-1': {
          '1': { strokes: 3, par: 3 },
          '2': { strokes: 4, par: 3 },
        },
        'u-2': {
          '1': { strokes: 2, par: 3 },
        },
      }),
    ).toEqual({
      'u-1': { totalStrokes: 7, totalPar: 6, totalDelta: 1, scoredHoles: 2 },
      'u-2': { totalStrokes: 2, totalPar: 3, totalDelta: -1, scoredHoles: 1 },
    })
  })
})

describe('pickLeadingParticipantIds', () => {
  it('returns empty when nobody has scored a hole', () => {
    expect(
      pickLeadingParticipantIds(['u-1', 'u-2'], {
        'u-1': { totalStrokes: 0, totalPar: 0, totalDelta: 0, scoredHoles: 0 },
        'u-2': { totalStrokes: 0, totalPar: 0, totalDelta: 0, scoredHoles: 0 },
      }),
    ).toEqual([])
  })

  it('picks lowest totalDelta, tie-break by fewer total strokes', () => {
    const totals = {
      'u-1': { totalStrokes: 7, totalPar: 6, totalDelta: 1, scoredHoles: 2 },
      'u-2': { totalStrokes: 2, totalPar: 3, totalDelta: -1, scoredHoles: 1 },
    }
    expect(pickLeadingParticipantIds(['u-1', 'u-2'], totals)).toEqual(['u-2'])
    expect(pickLeadingParticipantIds(['u-2', 'u-1'], totals)).toEqual(['u-2'])
  })

  it('returns co-leaders in participant order when delta and strokes match', () => {
    const totals = {
      a: { totalStrokes: 4, totalPar: 3, totalDelta: 1, scoredHoles: 1 },
      b: { totalStrokes: 4, totalPar: 3, totalDelta: 1, scoredHoles: 1 },
      c: { totalStrokes: 6, totalPar: 3, totalDelta: 3, scoredHoles: 1 },
    }
    expect(pickLeadingParticipantIds(['a', 'b', 'c'], totals)).toEqual(['a', 'b'])
    expect(pickLeadingParticipantIds(['b', 'a', 'c'], totals)).toEqual(['b', 'a'])
  })
})

describe('collectScorecardEditedHoleNumbers', () => {
  it('collects unique hole numbers from par, length, and score edits', () => {
    expect(
      collectScorecardEditedHoleNumbers({
        'par:1': '3',
        'length:2': '85',
        'score:u-1:2': '4',
        'score:u-2:2': '3',
        'score:u-2:11': '5',
        'score:u-2:bad': 'x',
      }),
    ).toEqual([1, 2, 11])
  })
})

describe('computeGrandTotals', () => {
  it('aggregates participant totals into one footer summary', () => {
    expect(
      computeGrandTotals({
        'u-1': { totalStrokes: 34, totalPar: 36, totalDelta: -2, scoredHoles: 9 },
        'u-2': { totalStrokes: 31, totalPar: 30, totalDelta: 1, scoredHoles: 8 },
      }),
    ).toEqual({
      totalStrokes: 65,
      totalPar: 66,
      totalDelta: -1,
      scoredHoles: 17,
      participantCount: 2,
    })
  })
})

describe('getOutcomeForScore', () => {
  it('maps score deltas into semantic tiers, labels, and symbols', () => {
    expect(getOutcomeForScore(2, 4)).toMatchObject({
      semantic: 'eagle',
      label: 'Eagle or better',
      symbol: 'E+',
      delta: -2,
    })

    expect(getOutcomeForScore(3, 4)).toMatchObject({
      semantic: 'birdie',
      label: 'Birdie',
      symbol: 'B',
      delta: -1,
    })

    expect(getOutcomeForScore(4, 4)).toMatchObject({
      semantic: 'par',
      label: 'Par',
      symbol: 'PAR',
      delta: 0,
    })

    expect(getOutcomeForScore(5, 4)).toMatchObject({
      semantic: 'bogey',
      label: 'Bogey',
      symbol: 'BG',
      delta: 1,
    })

    expect(getOutcomeForScore(7, 4)).toMatchObject({
      semantic: 'double-bogey-plus',
      label: 'Double bogey or worse',
      symbol: 'D+',
      delta: 3,
    })
  })
})
