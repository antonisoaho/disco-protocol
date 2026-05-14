/** Firestore collection / subcollection path segments (single source for client + docs alignment). */
export const COLLECTIONS = {
  users: 'users',
  courses: 'courses',
  templates: 'templates',
  rounds: 'rounds',
} as const

export function courseDoc(courseId: string) {
  return `${COLLECTIONS.courses}/${courseId}`
}

export function templateDoc(courseId: string, templateId: string) {
  return `${courseDoc(courseId)}/${COLLECTIONS.templates}/${templateId}`
}
