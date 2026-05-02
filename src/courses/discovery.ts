export type LatLng = {
  latitude: number
  longitude: number
}

export type DiscoveryCourse = {
  id: string
  name: string
  city?: string | null
  geo?: unknown
}

export type CourseDiscoveryRow<TCourse extends DiscoveryCourse> = TCourse & {
  distanceKm: number | null
}

export type CourseDiscoveryOptions = {
  nameQuery: string
  cityQuery: string
  userLocation: LatLng | null
  nearMeOnly: boolean
  sortByDistance: boolean
}

const EARTH_RADIUS_KM = 6371

function toRadians(value: number): number {
  return (value * Math.PI) / 180
}

function normalizeQuery(value: string): string {
  return value.trim().toLowerCase()
}

export function asLatLng(geo: unknown): LatLng | null {
  if (!geo || typeof geo !== 'object') {
    return null
  }

  const maybeGeo = geo as { latitude?: unknown; longitude?: unknown }
  if (typeof maybeGeo.latitude !== 'number' || typeof maybeGeo.longitude !== 'number') {
    return null
  }

  return { latitude: maybeGeo.latitude, longitude: maybeGeo.longitude }
}

export function haversineDistanceKm(from: LatLng, to: LatLng): number {
  const latitudeDelta = toRadians(to.latitude - from.latitude)
  const longitudeDelta = toRadians(to.longitude - from.longitude)
  const fromLatitudeRad = toRadians(from.latitude)
  const toLatitudeRad = toRadians(to.latitude)

  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitudeRad) * Math.cos(toLatitudeRad) * Math.sin(longitudeDelta / 2) ** 2

  return 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function filterCoursesForDiscovery<TCourse extends DiscoveryCourse>(
  courses: TCourse[],
  options: CourseDiscoveryOptions,
): Array<CourseDiscoveryRow<TCourse>> {
  const normalizedNameQuery = normalizeQuery(options.nameQuery)
  const normalizedCityQuery = normalizeQuery(options.cityQuery)

  const rowsWithDistance = courses.map((course) => {
    const coordinates = asLatLng(course.geo)
    const distanceKm =
      options.userLocation && coordinates ? haversineDistanceKm(options.userLocation, coordinates) : null

    return {
      ...course,
      distanceKm,
    }
  })

  const filteredRows = rowsWithDistance.filter((row) => {
    const normalizedName = row.name.toLowerCase()
    const normalizedCity = normalizeQuery(row.city ?? '')

    const matchesName = normalizedNameQuery.length === 0 || normalizedName.includes(normalizedNameQuery)
    const matchesCity = normalizedCityQuery.length === 0 || normalizedCity.includes(normalizedCityQuery)
    const matchesNearMe = !options.nearMeOnly || row.distanceKm !== null

    return matchesName && matchesCity && matchesNearMe
  })

  if (options.sortByDistance && options.userLocation) {
    return filteredRows.sort((left, right) => {
      if (left.distanceKm === null && right.distanceKm === null) {
        return left.name.localeCompare(right.name)
      }
      if (left.distanceKm === null) return 1
      if (right.distanceKm === null) return -1

      return left.distanceKm - right.distanceKm
    })
  }

  return filteredRows
}
