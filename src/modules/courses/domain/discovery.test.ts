import { describe, expect, it } from 'vitest'
import { filterCoursesForDiscovery, haversineDistanceKm } from '@modules/courses/domain/discovery'

const baseCourses = [
  {
    id: 'a',
    name: 'Maple Hill',
    city: 'Leicester',
    geo: { latitude: 42.245, longitude: -71.908 },
  },
  {
    id: 'b',
    name: 'Blue Ribbon Pines',
    city: 'East Bethel',
    geo: { latitude: 45.323, longitude: -93.262 },
  },
  {
    id: 'c',
    name: 'Idlewild',
    city: 'Burlington',
    geo: null,
  },
]

describe('haversineDistanceKm', () => {
  it('returns zero for identical coordinates', () => {
    expect(haversineDistanceKm({ latitude: 45, longitude: 10 }, { latitude: 45, longitude: 10 })).toBeCloseTo(
      0,
      5,
    )
  })

  it('returns expected distance for one degree latitude', () => {
    expect(haversineDistanceKm({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 })).toBeCloseTo(
      111.19,
      2,
    )
  })
})

describe('filterCoursesForDiscovery', () => {
  it('filters by name and city substrings', () => {
    const rows = filterCoursesForDiscovery(baseCourses, {
      nameQuery: 'blue',
      cityQuery: 'bethel',
      userLocation: null,
      nearMeOnly: false,
      sortByDistance: false,
    })
    expect(rows.map((row) => row.id)).toEqual(['b'])
  })

  it('sorts by nearest when user location is available', () => {
    const rows = filterCoursesForDiscovery(baseCourses, {
      nameQuery: '',
      cityQuery: '',
      userLocation: { latitude: 42.25, longitude: -71.91 },
      nearMeOnly: false,
      sortByDistance: true,
    })
    expect(rows.map((row) => row.id)).toEqual(['a', 'b', 'c'])
    expect(rows[0]?.distanceKm).not.toBeNull()
    expect(rows[2]?.distanceKm).toBeNull()
  })

  it('keeps only geocoded courses when nearMeOnly is enabled', () => {
    const rows = filterCoursesForDiscovery(baseCourses, {
      nameQuery: '',
      cityQuery: '',
      userLocation: { latitude: 42.25, longitude: -71.91 },
      nearMeOnly: true,
      sortByDistance: true,
    })
    expect(rows.map((row) => row.id)).toEqual(['a', 'b'])
  })
})
