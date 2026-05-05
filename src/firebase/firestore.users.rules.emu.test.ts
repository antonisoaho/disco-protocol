/// <reference types="node" />
import { readFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rules = readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8')

function emulatorHostPort() {
  const raw = process.env.FIRESTORE_EMULATOR_HOST
  if (!raw) throw new Error('FIRESTORE_EMULATOR_HOST is required for rules emulator tests.')
  const [host, portStr] = raw.split(':')
  if (!host || !portStr) throw new Error(`Invalid FIRESTORE_EMULATOR_HOST: ${raw}`)
  const port = Number.parseInt(portStr, 10)
  if (!Number.isFinite(port)) throw new Error(`Invalid FIRESTORE_EMULATOR_HOST port: ${portStr}`)
  return { host, port }
}

const describeIfEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip

describeIfEmulator('firestore users rules (emulator)', () => {
  let testEnv: RulesTestEnvironment

  beforeAll(async () => {
    const { host, port } = emulatorHostPort()
    testEnv = await initializeTestEnvironment({
      projectId: 'disc-protocol-issue-147',
      firestore: {
        host,
        port,
        rules,
      },
    })
  })

  beforeEach(async () => {
    await testEnv.clearFirestore()
  })

  afterAll(async () => {
    await testEnv.cleanup()
  })

  it('allows authenticated self create using ensureUserProfile payload shape', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()
    await assertSucceeds(
      setDoc(doc(db, 'users/alice'), {
        displayName: 'new.player',
        photoUrl: null,
        createdAt: serverTimestamp(),
      }),
    )
  })

  it('denies unauthenticated create with same payload (signedIn predicate)', async () => {
    const db = testEnv.unauthenticatedContext().firestore()
    await assertFails(
      setDoc(doc(db, 'users/alice'), {
        displayName: 'new.player',
        photoUrl: null,
        createdAt: serverTimestamp(),
      }),
    )
  })

  it('denies authenticated cross-user create and admin self-escalation', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()
    await assertFails(
      setDoc(doc(db, 'users/bob'), {
        displayName: 'Bob',
        photoUrl: null,
        createdAt: serverTimestamp(),
      }),
    )
    await assertFails(
      setDoc(doc(db, 'users/alice'), {
        displayName: 'Alice',
        photoUrl: null,
        createdAt: serverTimestamp(),
        admin: true,
      }),
    )
  })
})
