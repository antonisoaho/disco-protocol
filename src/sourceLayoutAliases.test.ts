import { describe, expect, it } from 'vitest'

import { i18n } from '@common/i18n'
import { COLLECTIONS } from '@core/firebase/paths'
import { DashboardHome } from '@modules/dashboard/dashboardView'

describe('source layout aliases', () => {
  it('resolve core, common, and module imports', () => {
    expect(COLLECTIONS.users).toBe('users')
    expect(i18n.language).toBeTruthy()
    expect(typeof DashboardHome).toBe('function')
  })
})
