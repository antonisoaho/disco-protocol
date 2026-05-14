import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'

const mainStyles = readFileSync(resolve(__dirname, 'main.scss'), 'utf8')
const appShellStyles = readFileSync(resolve(__dirname, 'blocks/_app-shell.scss'), 'utf8')
const authPanelStyles = readFileSync(resolve(__dirname, 'blocks/_auth-panel.scss'), 'utf8')
const dashboardHomeStyles = readFileSync(resolve(__dirname, 'blocks/_dashboard-home.scss'), 'utf8')
const scoringPanelStyles = readFileSync(resolve(__dirname, 'blocks/_scoring-panel.scss'), 'utf8')

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

describe('shared button system styles', () => {
  it('makes ordinary buttons use the approved rounded secondary treatment', () => {
    expect(mainStyles).toMatch(/button\s*\{[\s\S]*justify-content:\s*center;/)
    expect(mainStyles).toMatch(/button\s*\{[\s\S]*min-height:\s*\$touch-target-comfortable;/)
    expect(mainStyles).toMatch(/button\s*\{[\s\S]*border-radius:\s*999px;/)
    expect(mainStyles).toMatch(/button\s*\{[\s\S]*background:\s*color-mix\(in srgb, var\(--surface-bg\) 78%, transparent\);/)
    expect(mainStyles).toMatch(/button\s*\{[\s\S]*color:\s*var\(--text-muted\);/)
  })

  it('aligns explicit primary buttons with the approved login submit treatment', () => {
    expect(scoringPanelStyles).toMatch(/&--primary\s*\{[\s\S]*border-radius:\s*999px;/)
    expect(scoringPanelStyles).toMatch(/&--primary\s*\{[\s\S]*background:\s*map\.get\(\$score-color, eagle\);/)
    expect(scoringPanelStyles).toMatch(/&--primary\s*\{[\s\S]*color:\s*#111827;/)
    expect(scoringPanelStyles).toMatch(/&--primary\s*\{[\s\S]*box-shadow:\s*0 0\.75rem 1\.5rem/)
  })

  it('aligns dashboard CTA links with the primary and secondary button geometry', () => {
    expect(dashboardHomeStyles).toMatch(/\.dashboard-home__cta\s*\{[\s\S]*border-radius:\s*999px;/)
    expect(dashboardHomeStyles).toMatch(/\.dashboard-home__cta\s*\{[\s\S]*background:\s*map\.get\(\$score-color, eagle\);/)
    expect(dashboardHomeStyles).toMatch(/\.dashboard-home__cta\s*\{[\s\S]*color:\s*#111827;/)
    expect(dashboardHomeStyles).toMatch(/\.dashboard-home__secondary-action\s*\{[\s\S]*border-radius:\s*999px;/)
  })

  it('keeps danger buttons distinct while sharing the rounded geometry', () => {
    expect(scoringPanelStyles).toMatch(/\.scoring-panel__button--danger\s*\{[\s\S]*border-radius:\s*999px;/)
    expect(scoringPanelStyles).toMatch(/\.scoring-panel__button--danger\s*\{[\s\S]*map\.get\(\$score-color, double-bogey-plus\)/)
  })
})
