/// <reference types="node" />
import { readFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { describe, expect, it } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const firestoreRules = readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8')

describe('firestore users rules contract', () => {
  it('keeps users/{userId} create scoped to signed-in self', () => {
    expect(firestoreRules).toContain('allow create: if signedIn()')
    expect(firestoreRules).toContain('request.auth.uid == userId')
    expect(firestoreRules).toContain('userProfileSelfCreateAllowed(request.resource.data)')
  })

  it('prevents self-escalation to admin on create and update', () => {
    expect(firestoreRules).toContain('data.admin != true')
    expect(firestoreRules).toContain('request.resource.data.admin == resource.data.admin')
  })

  it('keeps self-update limited to mutable profile fields', () => {
    expect(firestoreRules).toContain(".hasOnly(['displayName', 'favoriteCourseIds'])")
  })
})
