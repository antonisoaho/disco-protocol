import { describe, expect, it } from 'vitest'
import type { Timestamp } from 'firebase/firestore'
import { pickCanonicalCourseTemplate, type CourseTemplateWithId } from './courseData'

function tpl(id: string, holes: number, isDefault?: boolean): CourseTemplateWithId {
  return {
    id,
    label: id === 'a' ? 'A' : 'B',
    holes: Array.from({ length: holes }, (_, i) => ({
      number: i + 1,
      par: 3,
      lengthMeters: null,
      notes: null,
    })),
    source: 'crowd',
    createdBy: 'u',
    createdAt: { seconds: 0, nanoseconds: 0 } as unknown as Timestamp,
    isDefault: isDefault === true,
  }
}

describe('pickCanonicalCourseTemplate', () => {
  it('prefers the default template when present', () => {
    const rows = [tpl('a', 9, false), tpl('b', 18, true)]
    expect(pickCanonicalCourseTemplate(rows)?.id).toBe('b')
  })

  it('falls back to the first template when no default', () => {
    const rows = [tpl('first', 12, false), tpl('second', 18, false)]
    expect(pickCanonicalCourseTemplate(rows)?.id).toBe('first')
  })

  it('uses the sole template even when it is not marked default', () => {
    const rows = [tpl('only', 14, false)]
    expect(pickCanonicalCourseTemplate(rows)?.id).toBe('only')
    expect(pickCanonicalCourseTemplate(rows)?.holes.length).toBe(14)
  })
})
