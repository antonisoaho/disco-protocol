import type { TFunction } from 'i18next'
import type { ScoreTier } from '../lib/scoreSemantic'

/** Short tier text for tight UI (e.g. chip beside strokes). */
export function scoreTierChipLabel(t: TFunction<'common'>, tier: ScoreTier): string {
  switch (tier) {
    case 'albatross-plus':
      return t('scoring.scoreTier.chipAlbatrossPlus')
    case 'eagle':
      return t('scoring.scoreTier.chipEagle')
    case 'birdie':
      return t('scoring.scoreTier.chipBirdie')
    case 'par':
      return t('scoring.scoreTier.chipPar')
    case 'bogey':
      return t('scoring.scoreTier.chipBogey')
    case 'double-bogey':
      return t('scoring.scoreTier.chipDoubleBogey')
    case 'triple-bogey-plus':
      return t('scoring.scoreTier.chipTripleBogeyPlus')
    default:
      return ''
  }
}

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
