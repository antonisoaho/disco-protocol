import type { TFunction } from 'i18next'
import type { FreshRoundDraftIssue } from '@core/domain/freshRoundCourse'
import { translateUserError } from '@common/i18n/translateError'

export function formatDraftIssues(t: TFunction<'common'>, issues: FreshRoundDraftIssue[]): string {
  if (issues.length === 0) {
    return t('scoring.errors.freshHoleMetadataIncomplete')
  }

  const perHole = new Map<number, Set<string>>()
  const generalMessages = new Set<string>()

  for (const issue of issues) {
    const holeMatch = issue.path.match(/^holes\.(\d+)\.(par|lengthMeters)$/)
    if (holeMatch) {
      const holeNumber = Number(holeMatch[1]) + 1
      const field = holeMatch[2] === 'par' ? t('scoring.fields.par') : t('scoring.fields.length')
      if (!perHole.has(holeNumber)) {
        perHole.set(holeNumber, new Set<string>())
      }
      perHole.get(holeNumber)?.add(field)
      continue
    }
    generalMessages.add(translateUserError(t, issue.message))
  }

  const holeMessages = Array.from(perHole.entries())
    .sort(([a], [b]) => a - b)
    .map(([holeNumber, fields]) =>
      t('scoring.errors.holeIssue', { holeNumber, fields: Array.from(fields).join(' + ') }),
    )

  return [...holeMessages, ...Array.from(generalMessages)].join('. ')
}
