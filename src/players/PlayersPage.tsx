import type { User } from 'firebase/auth'
import { useTranslation } from 'react-i18next'
import { FollowPanel } from '../social/FollowPanel'

type Props = {
  user: User
}

export function PlayersPage({ user }: Props) {
  const { t } = useTranslation('common')
  return (
    <div className="players-page">
      <p className="players-page__intro">{t('players.intro')}</p>
      <FollowPanel user={user} profileHrefForUid={(uid) => `/players/${uid}`} />
    </div>
  )
}
