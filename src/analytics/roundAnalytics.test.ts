import { describe, expect, it } from 'vitest'
import type { RoundDoc } from '../firebase/roundTypes'
import { computeHeadToHeadSummary, computeParticipantParSummary } from './roundAnalytics'

const ts = {} as RoundDoc['startedAt']

function scoreEntry(strokes: number, par: number, updatedBy: string) {
  return {
    strokes,
    par,
    updatedAt: ts,
    updatedBy,
  }
}

function makeRound(overrides: Partial<RoundDoc>): RoundDoc {
  return {
    ownerId: 'me',
    participantIds: ['me'],
    courseId: 'course-1',
    templateId: 'template-1',
    visibility: 'public',
    startedAt: ts,
    completedAt: ts,
    holeScores: {},
    createdAt: ts,
    updatedAt: ts,
    ...overrides,
  }
}

describe('computeParticipantParSummary', () => {
  it('aggregates completed rounds and ignores unscored or in-progress rounds', () => {
    const rounds: RoundDoc[] = [
      makeRound({
        participantIds: ['me', 'friend'],
        participantHoleScores: {
          me: {
            '1': scoreEntry(3, 3, 'me'),
            '2': scoreEntry(4, 3, 'me'),
          },
          friend: {
            '1': scoreEntry(4, 3, 'friend'),
            '2': scoreEntry(4, 3, 'friend'),
          },
        },
      }),
      makeRound({
        participantIds: ['me', 'friend'],
        // Legacy shape: infer ownership from `updatedBy`.
        holeScores: {
          '1': scoreEntry(4, 3, 'me'),
        },
      }),
      makeRound({
        participantIds: ['me', 'friend'],
        participantHoleScores: {
          friend: {
            '1': scoreEntry(3, 3, 'friend'),
          },
        },
      }),
      makeRound({
        completedAt: null,
        participantIds: ['me', 'friend'],
        participantHoleScores: {
          me: {
            '1': scoreEntry(2, 3, 'me'),
          },
        },
      }),
    ]

    expect(computeParticipantParSummary(rounds, 'me')).toEqual({
      completedRounds: 3,
      scoredRounds: 2,
      scoredHoles: 3,
      totalStrokes: 11,
      totalPar: 9,
      totalDelta: 2,
    })
  })
})

describe('computeHeadToHeadSummary', () => {
  it('computes win/loss/tie over shared completed rounds with strict comparison criteria', () => {
    const rounds: RoundDoc[] = [
      makeRound({
        participantIds: ['me', 'friend'],
        participantHoleScores: {
          me: {
            '1': scoreEntry(2, 3, 'me'),
            '2': scoreEntry(3, 3, 'me'),
          },
          friend: {
            '1': scoreEntry(3, 3, 'friend'),
            '2': scoreEntry(4, 3, 'friend'),
          },
        },
      }),
      makeRound({
        participantIds: ['me', 'friend'],
        participantHoleScores: {
          me: {
            '1': scoreEntry(4, 3, 'me'),
            '2': scoreEntry(4, 3, 'me'),
          },
          friend: {
            '1': scoreEntry(3, 3, 'friend'),
            '2': scoreEntry(3, 3, 'friend'),
          },
        },
      }),
      makeRound({
        participantIds: ['me', 'friend'],
        participantHoleScores: {
          me: {
            '1': scoreEntry(3, 3, 'me'),
            '2': scoreEntry(3, 3, 'me'),
          },
          friend: {
            '1': scoreEntry(3, 3, 'friend'),
            '2': scoreEntry(3, 3, 'friend'),
          },
        },
      }),
      makeRound({
        participantIds: ['me', 'friend'],
        // Mismatched scored hole counts => skip from comparison.
        participantHoleScores: {
          me: {
            '1': scoreEntry(3, 3, 'me'),
          },
          friend: {
            '1': scoreEntry(3, 3, 'friend'),
            '2': scoreEntry(3, 3, 'friend'),
          },
        },
      }),
      makeRound({
        completedAt: null,
        participantIds: ['me', 'friend'],
        participantHoleScores: {
          me: {
            '1': scoreEntry(2, 3, 'me'),
          },
          friend: {
            '1': scoreEntry(3, 3, 'friend'),
          },
        },
      }),
    ]

    expect(computeHeadToHeadSummary(rounds, 'me', 'friend')).toEqual({
      opponentUid: 'friend',
      sharedCompletedRounds: 4,
      comparedRounds: 3,
      skippedRounds: 1,
      wins: 1,
      losses: 1,
      ties: 1,
    })
  })
})
