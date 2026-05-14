export type HoleSubmitMode = 'next' | 'complete'

export function resolveHoleSubmitMode(params: {
  activeHoleNumber: number
  holeCount: number
}): HoleSubmitMode {
  return params.activeHoleNumber >= params.holeCount ? 'complete' : 'next'
}
