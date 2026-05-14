import { describe, expect, it } from 'vitest'
import { sortCoursesForRoundStart } from '@core/domain/roundStartSort'

const rows = [
  { id: 'c2', name: 'Bravo Ridge', city: 'City B' },
  { id: 'c3', name: 'Cedar Park', city: 'City C' },
  { id: 'c1', name: 'Alpha Hills', city: 'City A' },
]

describe('sortCoursesForRoundStart', () => {
  it('sorts favorite courses first, then by name', () => {
    const sorted = sortCoursesForRoundStart(rows, ['c3'])
    expect(sorted.map((row) => row.id)).toEqual(['c3', 'c1', 'c2'])
  })

  it('sorts all rows alphabetically when there are no favorites', () => {
    const sorted = sortCoursesForRoundStart(rows, [])
    expect(sorted.map((row) => row.id)).toEqual(['c1', 'c2', 'c3'])
  })

  it('keeps relative alphabetical sorting within favorites', () => {
    const sorted = sortCoursesForRoundStart(rows, ['c2', 'c1'])
    expect(sorted.map((row) => row.id)).toEqual(['c1', 'c2', 'c3'])
  })
})
