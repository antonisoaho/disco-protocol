import type { TFunction } from 'i18next'

export function translateUserError(t: TFunction<'common'>, message: string): string {
  const trimmed = message.trim()
  if (!trimmed) return message

  if (trimmed === 'Round not found') return t('scoring.errors.roundNotFound')
  if (trimmed === 'Not a participant of this round') return t('scoring.errors.notRoundParticipant')
  if (trimmed === 'Target participant is not in this round') return t('scoring.errors.targetNotRoundParticipant')
  if (trimmed === 'Only owner can edit another participant score') {
    return t('scoring.errors.onlyOwnerCanEditParticipant')
  }
  if (trimmed === 'Not permitted to manage this round roster.') {
    return t('scoring.errors.notPermittedToManageRoundRoster')
  }
  if (trimmed === 'Cannot remove the round owner from the participant list.') {
    return t('scoring.errors.cannotRemoveRoundOwner')
  }
  if (trimmed === 'Cannot replace the round owner on the roster.') {
    return t('scoring.errors.cannotReplaceRoundOwner')
  }
  if (trimmed === 'Replacement user is already a participant of this round.') {
    return t('scoring.errors.replacementAlreadyParticipant')
  }
  if (trimmed === 'Replacement must be a registered user account.') {
    return t('scoring.errors.replacementMustBeRegistered')
  }
  if (trimmed === 'Replace source and target must differ.') {
    return t('scoring.errors.replaceSourceEqualsTarget')
  }
  if (trimmed === 'Replacement user is required.') {
    return t('scoring.errors.replacementUserRequired')
  }
  if (trimmed === 'Round does not support fresh hole metadata edits') {
    return t('scoring.errors.roundDoesNotSupportFreshMetadataEdits')
  }
  if (trimmed === 'Set a hole count and fill missing hole metadata before completing this round.') {
    return t('scoring.errors.setHoleCountAndFillMetadata')
  }
  if (trimmed === 'You cannot follow yourself.') return t('social.errors.cannotFollowSelf')
  if (trimmed === 'followerUid is required.' || trimmed === 'followeeUid is required.') {
    return t('social.errors.invalidFollowRequest')
  }
  if (trimmed === 'Course name is required' || trimmed === 'Course name is required.') {
    return t('courses.errors.courseNameRequired')
  }

  const parRangeMatch = trimmed.match(/^Par must be an integer in range (\d+)-(\d+)\.?$/)
  if (parRangeMatch) {
    return t('scoring.errors.parRange', {
      min: parRangeMatch[1],
      max: parRangeMatch[2],
    })
  }

  const lengthRangeMatch = trimmed.match(/^Length must be an integer in range (\d+)-(\d+) meters\.?$/)
  if (lengthRangeMatch) {
    return t('scoring.errors.lengthRangeMeters', {
      min: lengthRangeMatch[1],
      max: lengthRangeMatch[2],
    })
  }

  const freshRoundHoleCountMatch = trimmed.match(/^Fresh rounds must include (\d+)-(\d+) holes\.?$/)
  if (freshRoundHoleCountMatch) {
    return t('scoring.errors.freshRoundHoleCountRange', {
      min: freshRoundHoleCountMatch[1],
      max: freshRoundHoleCountMatch[2],
    })
  }

  const holeRangeMatch = trimmed.match(/^Hole must be an integer in range (\d+)-(\d+)\.?$/)
  if (holeRangeMatch) {
    return t('scoring.errors.holeRange', {
      min: holeRangeMatch[1],
      max: holeRangeMatch[2],
    })
  }

  const holeSequentialMatch = trimmed.match(/^Hole numbering must be sequential \(expected (\d+)\)\.?$/)
  if (holeSequentialMatch) {
    return t('scoring.errors.holeSequentialExpected', { expected: holeSequentialMatch[1] })
  }

  if (trimmed === 'Par is required before completing the round.') {
    return t('scoring.errors.parRequiredBeforeComplete')
  }
  if (trimmed === 'Length is required before completing the round.') {
    return t('scoring.errors.lengthRequiredBeforeComplete')
  }

  return message
}
