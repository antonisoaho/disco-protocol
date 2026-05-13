import type { User } from 'firebase/auth'
import { Navigate, useParams } from 'react-router-dom'
import { DashboardHome } from './DashboardHome'

type Props = {
  viewer: User
}

export function PublicPlayerDashboard({ viewer }: Props) {
  const { userId } = useParams()
  if (!userId) {
    return <Navigate to="/players" replace />
  }
  const readOnly = userId !== viewer.uid
  return <DashboardHome viewer={viewer} profileUid={userId} readOnly={readOnly} />
}
