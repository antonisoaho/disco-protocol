import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from 'firebase/auth'

const mocks = vi.hoisted(() => ({
  updateProfileMock: vi.fn(),
  docMock: vi.fn(),
  getDocMock: vi.fn(),
  getDocFromServerMock: vi.fn(),
  setDocMock: vi.fn(),
  serverTimestampMock: vi.fn(() => 'SERVER_TIMESTAMP'),
}))

vi.mock('./firestore', () => ({
  db: { app: 'test-db' },
}))

vi.mock('firebase/auth', () => ({
  updateProfile: mocks.updateProfileMock,
}))

vi.mock('firebase/firestore', () => ({
  arrayRemove: vi.fn(),
  arrayUnion: vi.fn(),
  doc: mocks.docMock,
  getDoc: mocks.getDocMock,
  getDocFromServer: mocks.getDocFromServerMock,
  onSnapshot: vi.fn(),
  serverTimestamp: mocks.serverTimestampMock,
  setDoc: mocks.setDocMock,
  updateDoc: vi.fn(),
}))

import { ensureUserProfile } from './userProfile'

function snapshot(exists: boolean, data: Record<string, unknown> = {}) {
  return {
    exists: () => exists,
    data: () => data,
  }
}

function fakeUser(overrides: Partial<User> = {}): User {
  return {
    uid: 'uid-1',
    email: 'new.player@example.com',
    displayName: null,
    photoURL: null,
    ...overrides,
  } as unknown as User
}

describe('ensureUserProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.docMock.mockImplementation((_db: unknown, collection: string, uid: string) => ({
      path: `${collection}/${uid}`,
    }))
  })

  it('creates users/{uid} with required schema fields for a new sign-up', async () => {
    mocks.getDocMock.mockResolvedValueOnce(snapshot(false)) // loop preexisting check
    mocks.setDocMock.mockResolvedValueOnce(undefined)
    mocks.getDocFromServerMock.mockResolvedValueOnce(snapshot(true))
    mocks.updateProfileMock.mockResolvedValueOnce(undefined)

    await ensureUserProfile(fakeUser())

    expect(mocks.setDocMock).toHaveBeenCalledTimes(1)
    expect(mocks.setDocMock).toHaveBeenCalledWith(
      { path: 'users/uid-1' },
      {
        displayName: 'new.player',
        photoUrl: null,
        createdAt: 'SERVER_TIMESTAMP',
      },
    )
    expect(mocks.updateProfileMock).toHaveBeenCalledWith(expect.anything(), { displayName: 'new.player' })
  })

  it('is idempotent and skips create when users/{uid} already exists', async () => {
    mocks.getDocMock.mockResolvedValueOnce(snapshot(true, { displayName: 'Existing Name' }))

    await ensureUserProfile(fakeUser())

    expect(mocks.setDocMock).not.toHaveBeenCalled()
    expect(mocks.updateProfileMock).toHaveBeenCalledTimes(1)
  })

  it('throws when profile creation fails after retries', async () => {
    vi.useFakeTimers()
    mocks.getDocMock.mockResolvedValue(snapshot(false))
    const permissionDenied = Object.assign(new Error('permission-denied'), { code: 'permission-denied' })
    mocks.setDocMock.mockRejectedValue(permissionDenied)
    mocks.getDocFromServerMock.mockResolvedValue(snapshot(false))

    const result = ensureUserProfile(fakeUser())
    const expectedFailure = expect(result).rejects.toThrow('permission-denied')
    await vi.advanceTimersByTimeAsync(30_000)

    await expectedFailure
    expect(mocks.setDocMock).toHaveBeenCalledTimes(5)
    vi.useRealTimers()
  })

  it('retries when initial getDoc is permission-denied before auth propagation completes', async () => {
    vi.useFakeTimers()
    const permissionDenied = Object.assign(new Error('missing or insufficient permissions'), {
      code: 'permission-denied',
    })

    mocks.getDocMock
      .mockRejectedValueOnce(permissionDenied)
      .mockResolvedValueOnce(snapshot(false))
    mocks.setDocMock.mockResolvedValueOnce(undefined)
    mocks.getDocFromServerMock.mockResolvedValueOnce(snapshot(true))
    mocks.updateProfileMock.mockResolvedValueOnce(undefined)

    const result = ensureUserProfile(fakeUser())
    await vi.advanceTimersByTimeAsync(500)
    await result

    expect(mocks.getDocMock).toHaveBeenCalledTimes(2)
    expect(mocks.setDocMock).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})
