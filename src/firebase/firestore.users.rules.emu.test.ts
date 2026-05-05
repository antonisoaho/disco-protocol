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
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rules = readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8')

const describeIfEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip

function emulatorHostPort() {
  const raw = process.env.FIRESTORE_EMULATOR_HOST
  if (!raw) throw new Error('FIRESTORE_EMULATOR_HOST is required for rules emulator tests.')
  const [host, portStr] = raw.split(':')
  if (!host || !portStr) throw new Error(`Invalid FIRESTORE_EMULATOR_HOST: ${raw}`)
  const port = Number.parseInt(portStr, 10)
  if (!Number.isFinite(port)) throw new Error(`Invalid FIRESTORE_EMULATOR_HOST port: ${portStr}`)
  return { host, port }
}

describeIfEmulator('firestore users rules (emulator)', () => {
  let testEnv: RulesTestEnvironment

  beforeAll(async () => {
    const { host, port } = emulatorHostPort()
    testEnv = await initializeTestEnvironment({
      projectId: 'disc-protocol-issue-149',
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

  it('allows authenticated self create for ensureUserProfile payload', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()
    await assertSucceeds(
      setDoc(doc(db, 'users/alice'), {
        displayName: 'new.player',
        photoUrl: null,
        createdAt: serverTimestamp(),
      }),
    )
  })

  it('allows authenticated self create when photoUrl key is omitted', async () => {
    const db = testEnv.authenticatedContext('alice').firestore()
    await assertSucceeds(
      setDoc(doc(db, 'users/alice'), {
        displayName: 'new.player',
        createdAt: serverTimestamp(),
      }),
    )
  })

  it('denies unauthenticated create and cross-user write', async () => {
    const anonDb = testEnv.unauthenticatedContext().firestore()
    await assertFails(
      setDoc(doc(anonDb, 'users/alice'), {
        displayName: 'new.player',
        createdAt: serverTimestamp(),
      }),
    )

    const aliceDb = testEnv.authenticatedContext('alice').firestore()
    await assertFails(
      setDoc(doc(aliceDb, 'users/bob'), {
        displayName: 'Bob',
        createdAt: serverTimestamp(),
      }),
    )
  })

  it('allows signed-in reads and denies unauthenticated reads', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore()
      await setDoc(doc(adminDb, 'users/alice'), {
        displayName: 'existing',
        createdAt: new Date(),
        admin: false,
      })
    })

    const anonDb = testEnv.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(anonDb, 'users/alice')))

    const db = testEnv.authenticatedContext('alice').firestore()
    await assertSucceeds(getDoc(doc(db, 'users/alice')))
  })

  it('allows self update and denies cross-user update', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore()
      await setDoc(doc(adminDb, 'users/alice'), {
        displayName: 'alice',
        createdAt: new Date(),
        admin: false,
      })
    })

    const aliceDb = testEnv.authenticatedContext('alice').firestore()
    await assertSucceeds(updateDoc(doc(aliceDb, 'users/alice'), { admin: true }))

    const bobDb = testEnv.authenticatedContext('bob').firestore()
    await assertFails(updateDoc(doc(bobDb, 'users/alice'), { displayName: 'hacked' }))
  })
})
