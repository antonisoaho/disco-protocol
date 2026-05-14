import type { User } from 'firebase/auth'
import { useTranslation } from 'react-i18next'
import { NavLink, Navigate, useNavigate, useParams } from 'react-router-dom'
import { ScoringPanel } from '@modules/scoring/components/ScoringPanel'

type Props = {
  user: User
}

export function ScoringView({ user }: Props) {
  const { t } = useTranslation('common')
  const { roundId } = useParams()
  const navigate = useNavigate()
  if (!roundId) {
    return <Navigate to="/" replace />
  }
  return (
    <div className="app-shell__flow">
      <NavLink to="/" className="app-shell__link dashboard-home__back">
        {t('rounds.scorecard.backHome')}
      </NavLink>
      <ScoringPanel
        key={roundId}
        user={user}
        roundId={roundId}
        onAfterRoundDeleted={() => navigate('/')}
      />
    </div>
  )
}
