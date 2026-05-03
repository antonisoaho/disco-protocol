import type { User } from 'firebase/auth'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { followUser, subscribeFollowers, subscribeFollowing, unfollowUser } from '../firebase/follows'
import { translateUserError } from '../i18n/translateError'
import { subscribeUserDirectory, type UserDirectoryEntry } from '../firebase/userDirectory'
import { directoryDisplayName, filterDiscoverableUsers } from './followSearch'

type Props = {
  user: User
}

export function FollowPanel({ user }: Props) {
  const { t } = useTranslation('common')
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
      (nextError) => setActionState((current) => ({ ...current, error: translateUserError(t, nextError.message) })),
    )
    return () => unsub()
  }, [t])

  useEffect(() => {
    const unsub = subscribeFollowing(
      user.uid,
      (edges) => {
        setRelationshipState((current) => ({
          ...current,
          followingIds: Array.from(new Set(edges.map((edge) => edge.followeeUid))),
        }))
      },
      (nextError) => setActionState((current) => ({ ...current, error: translateUserError(t, nextError.message) })),
    )
    return () => unsub()
  }, [t, user.uid])

  useEffect(() => {
    const unsub = subscribeFollowers(
      user.uid,
      (edges) => {
        setRelationshipState((current) => ({
          ...current,
          followerIds: Array.from(new Set(edges.map((edge) => edge.followerUid))),
        }))
      },
      (nextError) => setActionState((current) => ({ ...current, error: translateUserError(t, nextError.message) })),
    )
    return () => unsub()
  }, [t, user.uid])

  const followingIdSet = useMemo(
    () => new Set(relationshipState.followingIds),
    [relationshipState.followingIds],
  )

  const visibleEntries = useMemo(() => {
    return filterDiscoverableUsers(directoryEntries, user.uid, query)
  }, [directoryEntries, query, user.uid])

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
        error: nextError instanceof Error ? translateUserError(t, nextError.message) : t('follow.errors.updateRelationshipFallback'),
      }))
    } finally {
      setActionState((current) => ({ ...current, pendingUid: null }))
    }
  }

  return (
    <section className="follow-panel card" aria-labelledby="follow-panel-title">
      <h2 id="follow-panel-title" className="follow-panel__title">
        {t('follow.title')}
      </h2>
      <p className="follow-panel__meta">
        {t('follow.relationshipCounts', {
          followingCount: relationshipState.followingIds.length,
          followerCount: relationshipState.followerIds.length,
        })}
      </p>
      {actionState.error ? (
        <p className="follow-panel__error" role="alert">
          {actionState.error}
        </p>
      ) : null}
      <label className="follow-panel__label" htmlFor="follow-search">
        {t('follow.searchLabel')}
      </label>
      <input
        id="follow-search"
        className="follow-panel__search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t('follow.searchPlaceholder')}
        autoComplete="off"
      />
      {visibleEntries.length === 0 ? <p className="follow-panel__meta">{t('follow.noResults')}</p> : null}
      <ul className="follow-panel__list">
        {visibleEntries.map((entry) => {
          const isFollowing = followingIdSet.has(entry.uid)
          const isPending = actionState.pendingUid === entry.uid
          return (
            <li key={entry.uid} className="follow-panel__item">
              <div>
                <strong>{directoryDisplayName(entry)}</strong>
              </div>
              <button
                type="button"
                className={isFollowing ? 'outline' : ''}
                data-variant={isFollowing ? 'secondary' : undefined}
                disabled={isPending}
                onClick={() => void onToggleFollow(entry.uid)}
              >
                {isPending
                  ? t('follow.buttons.saving')
                  : isFollowing
                    ? t('follow.buttons.unfollow')
                    : t('follow.buttons.follow')}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
