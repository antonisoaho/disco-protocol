import { getAuth } from 'firebase/auth'
import { firebaseApp } from './app'

export const auth = getAuth(firebaseApp)
