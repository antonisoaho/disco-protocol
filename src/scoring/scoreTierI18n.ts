import type { TFunction } from 'i18next'
import type { ScoreTier } from '../lib/scoreSemantic'

/** i18n label for a score tier (shared by score entry and summary UI). */
export function scoreTierLabel(t: TFunction<'common'>, tier: ScoreTier): string {
  switch (tier) {
    case 'albatross-plus':
      return t('scoring.scoreTier.albatrossPlus')
    case 'eagle':
      return t('scoring.scoreTier.eagle')
    case 'birdie':
      return t('scoring.scoreTier.birdie')
    case 'par':
      return t('scoring.scoreTier.par')
    case 'bogey':
      return t('scoring.scoreTier.bogey')
    case 'double-bogey':
      return t('scoring.scoreTier.doubleBogey')
    case 'triple-bogey-plus':
      return t('scoring.scoreTier.tripleBogeyPlus')
    default:
      return ''
  }
}
