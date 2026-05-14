type CourseRow = {
  id: string
  name: string
}

export function sortCoursesForRoundStart<TCourse extends CourseRow>(
  courses: TCourse[],
  favoriteCourseIds: string[],
): TCourse[] {
  const favoriteIds = new Set(favoriteCourseIds)
  return [...courses].sort((left, right) => {
    const leftFavorite = favoriteIds.has(left.id)
    const rightFavorite = favoriteIds.has(right.id)
    if (leftFavorite !== rightFavorite) {
      return leftFavorite ? -1 : 1
    }
    return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
  })
}
