import { describe, expect, it } from 'vitest'

import { resolveHoleSubmitMode } from '@modules/scoring/domain/holeSubmit'

describe('resolveHoleSubmitMode', () => {
  it('advances while there are holes remaining', () => {
    expect(resolveHoleSubmitMode({ activeHoleNumber: 17, holeCount: 18 })).toBe('next')
  })

  it('completes the round on the final hole', () => {
    expect(resolveHoleSubmitMode({ activeHoleNumber: 18, holeCount: 18 })).toBe('complete')
  })
})
