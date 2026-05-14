import { describe, expect, it } from 'vitest'
import {
  scoreTierToNotationClassName,
  strokesParDeltaToNotation,
  strokesParDeltaToTier,
} from '@modules/scoring/domain/scoreSemantic'

describe('strokesParDeltaToTier', () => {
  it('maps score deltas to traditional golf tiers', () => {
    expect(strokesParDeltaToTier(2, 5)).toBe('albatross-plus')
    expect(strokesParDeltaToTier(2, 4)).toBe('eagle')
    expect(strokesParDeltaToTier(2, 3)).toBe('birdie')
    expect(strokesParDeltaToTier(3, 3)).toBe('par')
    expect(strokesParDeltaToTier(4, 3)).toBe('bogey')
    expect(strokesParDeltaToTier(5, 3)).toBe('double-bogey')
    expect(strokesParDeltaToTier(6, 3)).toBe('triple-bogey-plus')
  })
})

describe('strokesParDeltaToNotation', () => {
  it('returns decorative shape and nesting depth per tier', () => {
    expect(strokesParDeltaToNotation(2, 5)).toMatchObject({
      tier: 'albatross-plus',
      decorationShape: 'circle',
      decorationLayers: 3,
      label: 'Albatross or better',
    })

    expect(strokesParDeltaToNotation(2, 4)).toMatchObject({
      tier: 'eagle',
      decorationShape: 'circle',
      decorationLayers: 2,
      label: 'Eagle',
    })

    expect(strokesParDeltaToNotation(2, 3)).toMatchObject({
      tier: 'birdie',
      decorationShape: 'circle',
      decorationLayers: 1,
      label: 'Birdie',
    })

    expect(strokesParDeltaToNotation(3, 3)).toMatchObject({
      tier: 'par',
      decorationShape: 'none',
      decorationLayers: 0,
      label: 'Par',
    })

    expect(strokesParDeltaToNotation(4, 3)).toMatchObject({
      tier: 'bogey',
      decorationShape: 'square',
      decorationLayers: 1,
      label: 'Bogey',
    })

    expect(strokesParDeltaToNotation(5, 3)).toMatchObject({
      tier: 'double-bogey',
      decorationShape: 'square',
      decorationLayers: 2,
      label: 'Double bogey',
    })

    expect(strokesParDeltaToNotation(7, 3)).toMatchObject({
      tier: 'triple-bogey-plus',
      decorationShape: 'square',
      decorationLayers: 3,
      label: 'Triple bogey or worse',
    })
  })
})

describe('scoreTierToNotationClassName', () => {
  it('builds notation class names from a single tier source', () => {
    expect(scoreTierToNotationClassName('birdie')).toBe('scoring-panel__notation--birdie')
    expect(scoreTierToNotationClassName('triple-bogey-plus')).toBe(
      'scoring-panel__notation--triple-bogey-plus',
    )
  })
})
