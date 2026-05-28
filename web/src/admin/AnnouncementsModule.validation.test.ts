import { describe, expect, it } from 'bun:test'

import { isAnnouncementBodyRequired } from './AnnouncementsModule'

describe('announcement editor validation helpers', () => {
  it('keeps modal bodies required while allowing bodyless ticker announcements', () => {
    expect(isAnnouncementBodyRequired('modal')).toBe(true)
    expect(isAnnouncementBodyRequired('ticker')).toBe(false)
  })
})
