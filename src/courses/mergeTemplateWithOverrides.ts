import type { CourseHoleTemplate } from '../firebase/models/course'
import type { HoleOverrideMap } from '../firebase/models/round'

/**
 * Returns a full hole list for `holeCount` holes, filling missing template par/length from overrides.
 * Used client-side when rendering a scorecard and when proposing a derived template after completion.
 */
export function mergeTemplateWithOverrides(
  templateHoles: CourseHoleTemplate[],
  overrides: HoleOverrideMap,
  holeCount: number,
): CourseHoleTemplate[] {
  const byNumber = new Map(templateHoles.map((h) => [h.number, { ...h }]))

  const result: CourseHoleTemplate[] = []
  for (let n = 1; n <= holeCount; n++) {
    const base = byNumber.get(n)
    const o = overrides[String(n)] ?? {}
    const par = base?.par ?? o.par
    const lengthMeters =
      base?.lengthMeters !== undefined && base?.lengthMeters !== null
        ? base.lengthMeters
        : o.lengthMeters !== undefined
          ? o.lengthMeters
          : null

    if (par === undefined || typeof par !== 'number') {
      throw new Error(`Missing par for hole ${n} (template or override required)`)
    }

    result.push({
      number: n,
      par,
      lengthMeters: lengthMeters ?? null,
      notes: base?.notes ?? null,
    })
  }
  return result
}

/** True if every hole 1..holeCount has par (and optionally length) after merge. */
export function isMergeComplete(
  templateHoles: CourseHoleTemplate[],
  overrides: HoleOverrideMap,
  holeCount: number,
): boolean {
  try {
    mergeTemplateWithOverrides(templateHoles, overrides, holeCount)
    return true
  } catch {
    return false
  }
}
