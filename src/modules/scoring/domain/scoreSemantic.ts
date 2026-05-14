/** Mirrors `src/common/styles/_variables.scss` `$score-par-delta-token` for BEM modifiers. */
export type ScoreSemantic = 'eagle' | 'birdie' | 'par' | 'bogey' | 'double-bogey-plus'

export type ScoreTier =
  | 'albatross-plus'
  | 'eagle'
  | 'birdie'
  | 'par'
  | 'bogey'
  | 'double-bogey'
  | 'triple-bogey-plus'

export type ScoreDecorationShape = 'none' | 'circle' | 'square'

export type ScoreNotation = {
  tier: ScoreTier
  semantic: ScoreSemantic
  label: string
  delta: number
  decorationShape: ScoreDecorationShape
  decorationLayers: 0 | 1 | 2 | 3
}

const SCORE_TIER_META: Record<
  ScoreTier,
  Pick<ScoreNotation, 'semantic' | 'label' | 'decorationShape' | 'decorationLayers'>
> = {
  'albatross-plus': {
    semantic: 'eagle',
    label: 'Albatross or better',
    decorationShape: 'circle',
    decorationLayers: 3,
  },
  eagle: { semantic: 'eagle', label: 'Eagle', decorationShape: 'circle', decorationLayers: 2 },
  birdie: { semantic: 'birdie', label: 'Birdie', decorationShape: 'circle', decorationLayers: 1 },
  par: { semantic: 'par', label: 'Par', decorationShape: 'none', decorationLayers: 0 },
  bogey: { semantic: 'bogey', label: 'Bogey', decorationShape: 'square', decorationLayers: 1 },
  'double-bogey': {
    semantic: 'double-bogey-plus',
    label: 'Double bogey',
    decorationShape: 'square',
    decorationLayers: 2,
  },
  'triple-bogey-plus': {
    semantic: 'double-bogey-plus',
    label: 'Triple bogey or worse',
    decorationShape: 'square',
    decorationLayers: 3,
  },
}

function deltaToScoreTier(delta: number): ScoreTier {
  if (delta <= -3) return 'albatross-plus'
  if (delta === -2) return 'eagle'
  if (delta === -1) return 'birdie'
  if (delta === 0) return 'par'
  if (delta === 1) return 'bogey'
  if (delta === 2) return 'double-bogey'
  return 'triple-bogey-plus'
}

export function strokesParDeltaToTier(strokes: number, par: number): ScoreTier {
  return deltaToScoreTier(strokes - par)
}

export function scoreTierToNotationClassName(tier: ScoreTier): string {
  return `scoring-panel__notation--${tier}`
}

export function strokesParDeltaToNotation(strokes: number, par: number): ScoreNotation {
  const delta = strokes - par
  const tier = deltaToScoreTier(delta)
  return {
    tier,
    delta,
    ...SCORE_TIER_META[tier],
  }
}

export function strokesParDeltaToSemantic(strokes: number, par: number): ScoreSemantic {
  return SCORE_TIER_META[deltaToScoreTier(strokes - par)].semantic
}
