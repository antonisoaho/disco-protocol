import { renderToString } from 'react-dom/server'
import { I18nextProvider } from 'react-i18next'
import { describe, expect, it } from 'vitest'

import { i18n } from '@common/i18n'
import { HoleForm } from '@modules/scoring/components/HoleForm'

describe('HoleForm', () => {
  it('renders as a form so Enter submits the hole action', () => {
    const html = renderToString(
      <I18nextProvider i18n={i18n}>
        <HoleForm
          holeNumber={18}
          parValue="3"
          lengthValue="107"
          onParChange={() => {}}
          onLengthChange={() => {}}
          disableLength={false}
          saveStateLabel="Saved"
          onSubmit={() => {}}
        >
          <button type="submit">Finish round</button>
        </HoleForm>
      </I18nextProvider>,
    )

    expect(html).toContain('<form')
    expect(html).toContain('type="submit"')
  })
})
