import type { User } from 'firebase/auth'
import { useEffect, useMemo, useState } from 'react'
import { followUser, subscribeFollowers, subscribeFollowing, unfollowUser } from '../firebase/follows'
import { subscribeUserDirectory, type UserDirectoryEntry } from '../firebase/userDirectory'

type Props = {
  user: User
}

function displayName(entry: UserDirectoryEntry): string {
  return entry.displayName.trim().length > 0 ? entry.displayName.trim() : entry.uid
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function FollowPanel({ user }: Props) {
  const [directoryEntries, setDirectoryEntries] = useState<UserDirectoryEntry[]>([])
  const [relationshipState, setRelationshipState] = useState<{
    followingIds: string[]
    followerIds: string[]
  }>({
    followingIds: [],
    followerIds: [],
  })
  const [query, setQuery] = useState('')
  const [actionState, setActionState] = useState<{ pendingUid: string | null; error: string | null }>({
    pendingUid: null,
    error: null,
  })

  useEffect(() => {
    const unsub = subscribeUserDirectory(
      (entries) => setDirectoryEntries(entries),
      (nextError) => setActionState((current) => ({ ...current, error: nextError.message })),
    )
    return () => unsub()
  }, [])

  useEffect(() => {
    const unsub = subscribeFollowing(
      user.uid,
      (edges) => {
        setRelationshipState((current) => ({
          ...current,
          followingIds: Array.from(new Set(edges.map((edge) => edge.followeeUid))),
        }))
      },
      (nextError) => setActionState((current) => ({ ...current, error: nextError.message })),
    )
    return () => unsub()
  }, [user.uid])

  useEffect(() => {
    const unsub = subscribeFollowers(
      user.uid,
      (edges) => {
        setRelationshipState((current) => ({
          ...current,
          followerIds: Array.from(new Set(edges.map((edge) => edge.followerUid))),
        }))
      },
      (nextError) => setActionState((current) => ({ ...current, error: nextError.message })),
    )
    return () => unsub()
  }, [user.uid])

  const followingIdSet = useMemo(
    () => new Set(relationshipState.followingIds),
    [relationshipState.followingIds],
  )
  const directoryByUid = useMemo(() => {
    const map: Record<string, UserDirectoryEntry> = {}
    for (const entry of directoryEntries) {
      map[entry.uid] = entry
    }
    if (!map[user.uid]) {
      map[user.uid] = {
        uid: user.uid,
        displayName: user.displayName?.trim() || user.email?.split('@')[0] || 'You',
        subtitle: user.uid,
      }
    }
    return map
  }, [directoryEntries, user.displayName, user.email, user.uid])

  const visibleEntries = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const searchRegex = normalizedQuery ? new RegExp(escapeRegExp(normalizedQuery), 'i') : null
    const next: UserDirectoryEntry[] = []
    for (const entry of directoryEntries) {
      if (entry.uid === user.uid) {
        continue
      }
      if (!searchRegex) {
        next.push(entry)
        continue
      }
      const match = searchRegex.test(displayName(entry)) || searchRegex.test(entry.uid)
      if (match) {
        next.push(entry)
      }
    }
    return next
  }, [directoryEntries, query, user.uid])

  const followingNames = useMemo(() => {
    if (relationshipState.followingIds.length === 0) {
      return []
    }
    return relationshipState.followingIds
      .map((uid) => displayName(directoryByUid[uid] ?? { uid, displayName: uid, subtitle: uid }))
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  }, [directoryByUid, relationshipState.followingIds])

  async function onToggleFollow(targetUid: string) {
    setActionState({ pendingUid: targetUid, error: null })
    try {
      if (followingIdSet.has(targetUid)) {
        await unfollowUser({ followerUid: user.uid, followeeUid: targetUid })
      } else {
        await followUser({ followerUid: user.uid, followeeUid: targetUid })
      }
    } catch (nextError) {
      setActionState((current) => ({
        ...current,
        error: nextError instanceof Error ? nextError.message : 'Could not update follow relationship.',
      }))
    } finally {
      setActionState((current) => ({ ...current, pendingUid: null }))
    }
  }

  return (
    <section className="follow-panel card" aria-labelledby="follow-panel-title">
      <h2 id="follow-panel-title" className="follow-panel__title">
        Social graph MVP
      </h2>
      <p className="follow-panel__meta">
        Following <strong>{relationshipState.followingIds.length}</strong> · Followers{' '}
        <strong>{relationshipState.followerIds.length}</strong>
      </p>
      <p className="follow-panel__meta">
        Directory players: <strong>{directoryEntries.length}</strong>
      </p>
      {followingNames.length > 0 ? (
        <p className="follow-panel__meta">
          Following list: <span>{followingNames.slice(0, 8).join(', ')}</span>
          {followingNames.length > 8 ? '…' : ''}
        </p>
      ) : (
        <p className="follow-panel__meta">You are not following anyone yet.</p>
      )}
      {actionState.error ? (
        <p className="follow-panel__error" role="alert">
          {actionState.error}
        </p>
      ) : null}
      <label className="follow-panel__label" htmlFor="follow-search">
        Search players to follow
      </label>
      <input
        id="follow-search"
        className="follow-panel__search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search by display name or uid"
        autoComplete="off"
      />
      <ul className="follow-panel__list">
        {visibleEntries.map((entry) => {
          const isFollowing = followingIdSet.has(entry.uid)
          const isPending = actionState.pendingUid === entry.uid
          return (
            <li key={entry.uid} className="follow-panel__item">
              <div>
                <strong>{displayName(entry)}</strong>
                <p className="follow-panel__uid">{entry.uid}</p>
              </div>
              <button
                type="button"
                className={isFollowing ? 'outline' : ''}
                data-variant={isFollowing ? 'secondary' : undefined}
                disabled={isPending}
                onClick={() => void onToggleFollow(entry.uid)}
              >
                {isPending ? 'Saving…' : isFollowing ? 'Unfollow' : 'Follow'}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
