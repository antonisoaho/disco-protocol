/// <reference types="node" />
import { readFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { describe, expect, it } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const firestoreRules = readFileSync(resolve(__dirname, '../../../firestore.rules'), 'utf8')

describe('firestore users rules contract', () => {
  it('allows signed-in reads for user docs', () => {
    expect(firestoreRules).toContain('allow get, list: if signedIn();')
  })

  it('keeps users/{userId} writes scoped to signed-in self', () => {
    expect(firestoreRules).toContain('allow create, update: if signedIn() && request.auth.uid == userId;')
    expect(firestoreRules).toContain('request.auth.uid == userId')
    expect(firestoreRules).toContain('allow delete: if signedIn() && request.auth.uid == userId;')
  })
})
