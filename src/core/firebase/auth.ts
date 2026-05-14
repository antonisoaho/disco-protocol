import { getAuth } from 'firebase/auth'
import { firebaseApp } from '@core/firebase/app'

export const auth = getAuth(firebaseApp)
