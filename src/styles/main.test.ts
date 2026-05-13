import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'

const mainStyles = readFileSync(resolve(__dirname, 'main.scss'), 'utf8')

describe('global style entrypoint', () => {
  it('loads the app shell layout styles used by header, main, and bottom navigation', () => {
    expect(mainStyles).toMatch(/@use ['"]blocks\/app-shell['"];/)
  })
})
