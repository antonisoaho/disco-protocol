import type { User } from 'firebase/auth'
import { useNavigate } from 'react-router-dom'
import { StartRoundForm } from '@modules/rounds/components/StartRoundForm'

type Props = {
  user: User
  favoriteCourseIds: string[]
}

export function NewRoundPage({ user, favoriteCourseIds }: Props) {
  const navigate = useNavigate()
  return (
    <StartRoundForm
      user={user}
      favoriteCourseIds={favoriteCourseIds}
      onRoundCreated={(roundId) => {
        void navigate(`/rounds/${roundId}/scorecard`, { replace: true })
      }}
    />
  )
}
