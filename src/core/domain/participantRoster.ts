import type { UserDirectoryEntry } from '@core/users/userDirectory'

export const ANONYMOUS_PARTICIPANT_PREFIX = 'anon:'

export type AnonymousParticipant = {
  id: string
  displayName: string
}

function participantDisplayName(entry: UserDirectoryEntry): string {
  return entry.displayName.trim().length > 0 ? entry.displayName.trim() : entry.uid
}

export function isAnonymousParticipantId(participantId: string): boolean {
  return participantId.trim().startsWith(ANONYMOUS_PARTICIPANT_PREFIX)
}

export function createAnonymousParticipantId(): string {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function') {
    return `${ANONYMOUS_PARTICIPANT_PREFIX}${globalThis.crypto.randomUUID()}`
  }
  const randomSuffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  return `${ANONYMOUS_PARTICIPANT_PREFIX}${randomSuffix}`
}

export function normalizeAnonymousParticipantName(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

export function deriveFriendUidSet(followingIds: string[], followerIds: string[]): Set<string> {
  const followingSet = new Set(followingIds.map((uid) => uid.trim()).filter((uid) => uid.length > 0))
  const friends = new Set<string>()
  for (const followerUid of followerIds) {
    const normalizedUid = followerUid.trim()
    if (normalizedUid.length > 0 && followingSet.has(normalizedUid)) {
      friends.add(normalizedUid)
    }
  }
  return friends
}

export function filterParticipantDirectoryEntries(params: {
  entries: UserDirectoryEntry[]
  query: string
  friendUidSet: Set<string>
}): UserDirectoryEntry[] {
  const normalizedQuery = params.query.trim().toLowerCase()
  if (normalizedQuery.length === 0) {
    return params.entries.filter((entry) => params.friendUidSet.has(entry.uid))
  }
  return params.entries.filter((entry) => {
    const display = participantDisplayName(entry).toLowerCase()
    return display.includes(normalizedQuery) || entry.uid.toLowerCase().includes(normalizedQuery)
  })
}

export function mergeAnonymousParticipants(
  participantIds: string[],
  anonymousParticipants: AnonymousParticipant[] | null | undefined,
): AnonymousParticipant[] {
  if (!Array.isArray(anonymousParticipants) || anonymousParticipants.length === 0) {
    return []
  }

  const byId = new Map<string, string>()
  for (const participant of anonymousParticipants) {
    if (!participant || typeof participant.id !== 'string' || typeof participant.displayName !== 'string') continue
    const id = participant.id.trim()
    const displayName = normalizeAnonymousParticipantName(participant.displayName)
    if (!isAnonymousParticipantId(id) || displayName.length === 0 || byId.has(id)) continue
    byId.set(id, displayName)
  }

  const merged: AnonymousParticipant[] = []
  const seen = new Set<string>()
  for (const participantId of participantIds) {
    if (!isAnonymousParticipantId(participantId) || seen.has(participantId)) continue
    seen.add(participantId)
    const displayName = byId.get(participantId)
    if (!displayName) continue
    merged.push({ id: participantId, displayName })
  }

  return merged
}

export function buildAnonymousParticipantNameMap(
  anonymousParticipants: AnonymousParticipant[] | null | undefined,
): Record<string, string> {
  const map: Record<string, string> = {}
  for (const participant of anonymousParticipants ?? []) {
    if (!participant || typeof participant.id !== 'string' || typeof participant.displayName !== 'string') continue
    const id = participant.id.trim()
    const displayName = normalizeAnonymousParticipantName(participant.displayName)
    if (!isAnonymousParticipantId(id) || displayName.length === 0 || map[id]) continue
    map[id] = displayName
  }
  return map
}
