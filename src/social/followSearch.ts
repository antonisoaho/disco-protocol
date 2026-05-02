import type { UserDirectoryEntry } from '../firebase/userDirectory'

export function directoryDisplayName(entry: Pick<UserDirectoryEntry, 'uid' | 'displayName'>): string {
  return entry.displayName.trim().length > 0 ? entry.displayName.trim() : entry.uid
}

export function filterDiscoverableUsers(
  entries: UserDirectoryEntry[],
  currentUid: string,
  query: string,
): UserDirectoryEntry[] {
  const normalizedQuery = query.trim().toLowerCase()
  return entries.filter((entry) => {
    if (entry.uid === currentUid) {
      return false
    }
    if (!normalizedQuery) {
      return true
    }
    const display = directoryDisplayName(entry).toLowerCase()
    return display.includes(normalizedQuery) || entry.uid.toLowerCase().includes(normalizedQuery)
  })
}
