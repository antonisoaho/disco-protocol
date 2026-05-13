import { renderToString } from 'react-dom/server'
import { I18nextProvider } from 'react-i18next'
import { describe, expect, it } from 'vitest'
import { i18n } from '../i18n'
import { ScorecardSummaryGrid } from './ScorecardSummaryGrid'

describe('ScorecardSummaryGrid', () => {
  it('renders table markup with player and stroke cells', () => {
    const html = renderToString(
      <I18nextProvider i18n={i18n}>
        <ScorecardSummaryGrid
          participantIds={['u1']}
          participantNames={{ u1: 'Player One' }}
          scoresByParticipant={{
            u1: {
              '1': { strokes: 3, par: 3 },
              '2': { strokes: 4, par: 3 },
            },
          }}
          holeCount={2}
        />
      </I18nextProvider>,
    )
    expect(html).toContain('scorecard-summary-grid')
    expect(html).toContain('Player One')
    expect(html).toContain('>3<')
    expect(html).toContain('>4<')
  })
})
