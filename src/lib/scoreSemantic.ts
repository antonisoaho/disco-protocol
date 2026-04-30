/** Mirrors `src/styles/_variables.scss` `$score-par-delta-token` for BEM modifiers. */
export type ScoreSemantic = 'eagle' | 'birdie' | 'par' | 'bogey' | 'double-bogey-plus'

export function strokesParDeltaToSemantic(strokes: number, par: number): ScoreSemantic {
  const delta = strokes - par
  if (delta <= -2) return 'eagle'
  if (delta === -1) return 'birdie'
  if (delta === 0) return 'par'
  if (delta === 1) return 'bogey'
  return 'double-bogey-plus'
}
