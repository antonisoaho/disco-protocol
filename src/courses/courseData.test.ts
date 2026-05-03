import { describe, expect, it } from 'vitest'
import type { Timestamp } from 'firebase/firestore'
import { pickTemplateForRoundLength, type CourseTemplateWithId } from './courseData'

function tpl(id: string, holes: number): CourseTemplateWithId {
  return {
    id,
    label: 'Main',
    holes: Array.from({ length: holes }, (_, i) => ({
      number: i + 1,
      par: 3,
      lengthMeters: null,
      notes: null,
    })),
    source: 'crowd',
    createdBy: 'u',
    createdAt: { seconds: 0, nanoseconds: 0 } as unknown as Timestamp,
    isDefault: holes === 18,
  }
}

describe('pickTemplateForRoundLength', () => {
  it('prefers exact hole count match', () => {
    const rows = [tpl('a', 9), tpl('b', 18)]
    expect(pickTemplateForRoundLength(rows, 9)?.id).toBe('a')
    expect(pickTemplateForRoundLength(rows, 18)?.id).toBe('b')
  })

  it('uses smallest template that fits when no exact match', () => {
    const rows = [tpl('short', 12)]
    expect(pickTemplateForRoundLength(rows, 9)?.id).toBe('short')
    expect(pickTemplateForRoundLength(rows, 18)?.id).toBe('short')
  })
})
