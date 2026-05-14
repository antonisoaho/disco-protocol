import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'

const mainStyles = readFileSync(resolve(__dirname, 'main.scss'), 'utf8')
const appShellStyles = readFileSync(resolve(__dirname, 'blocks/_app-shell.scss'), 'utf8')
const authPanelStyles = readFileSync(resolve(__dirname, 'blocks/_auth-panel.scss'), 'utf8')

describe('global style entrypoint', () => {
  it('loads the app shell layout styles used by header, main, and bottom navigation', () => {
    expect(mainStyles).toMatch(/@use ['"]blocks\/app-shell['"];/)
  })

  it('loads auth panel styles so the signed-out form does not fall back to global inline controls', () => {
    expect(mainStyles).toMatch(/@use ['"]blocks\/auth-panel['"];/)
  })

  it('defines semantic theme tokens as CSS custom properties on :root', () => {
    expect(mainStyles).toMatch(/--body-bg:/)
    expect(mainStyles).toMatch(/--surface-bg:/)
    expect(mainStyles).toMatch(/--text:/)
    expect(mainStyles).toMatch(/--text-muted:/)
    expect(mainStyles).toMatch(/--border:/)
  })
})

describe('signed-out auth styles', () => {
  it('uses a focused card surface with stacked fields and a full-width action', () => {
    expect(authPanelStyles).toMatch(/\.auth-panel\s*\{[\s\S]*box-shadow:/)
    expect(authPanelStyles).toMatch(/\.auth-panel__field\s*\{[\s\S]*flex-direction:\s*column;/)
    expect(authPanelStyles).toMatch(/\.auth-panel__submit\s*\{[\s\S]*width:\s*100%;/)
    expect(authPanelStyles).toMatch(/\.auth-panel__submit\s*\{[\s\S]*border-radius:\s*999px;/)
    expect(authPanelStyles).toMatch(/\.auth-panel__submit\s*\{[\s\S]*color:\s*#111827;/)
  })

  it('gives the signed-out page a distinct centered surface behind the auth card', () => {
    expect(appShellStyles).toMatch(/\.app-shell__main--signed-out\s*\{[\s\S]*background:/)
    expect(appShellStyles).toMatch(/\.app-shell__signed-out\s*\{[\s\S]*max-width:\s*24rem;/)
  })
})
