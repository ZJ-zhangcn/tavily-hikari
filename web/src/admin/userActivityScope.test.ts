import { describe, expect, it } from 'bun:test'

import {
  resolveAdminUserActivityScope,
  resolveAdminUserActivityScopeFromSettings,
  resolveAdminUserActivityScopeFromSettingsOrThrow,
} from './userActivityScope'

describe('resolveAdminUserActivityScope', () => {
  it('defaults to active90d when the admin setting is enabled and the search query is empty', () => {
    expect(resolveAdminUserActivityScope('', true)).toBe('active90d')
    expect(resolveAdminUserActivityScope('   ', true)).toBe('active90d')
  })

  it('falls back to all users when the admin setting is disabled', () => {
    expect(resolveAdminUserActivityScope('', false)).toBe('all')
    expect(resolveAdminUserActivityScope('', undefined)).toBe('all')
    expect(resolveAdminUserActivityScope('', null)).toBe('all')
  })

  it('always searches across all users once a query is present', () => {
    expect(resolveAdminUserActivityScope('alice', true)).toBe('all')
    expect(resolveAdminUserActivityScope('  bob  ', true)).toBe('all')
    expect(resolveAdminUserActivityScope('charlie', false)).toBe('all')
  })

  it('prefers freshly loaded settings over stale fallback settings', () => {
    expect(
      resolveAdminUserActivityScopeFromSettings(
        '',
        { adminDefaultActiveUsersOnly: true },
        { adminDefaultActiveUsersOnly: false },
      ),
    ).toBe('active90d')
  })

  it('falls back to the previous settings when refreshed settings are unavailable', () => {
    expect(
      resolveAdminUserActivityScopeFromSettings(
        '',
        null,
        { adminDefaultActiveUsersOnly: true },
      ),
    ).toBe('active90d')
  })

  it('throws when the empty-query scope still has no settings to resolve from', () => {
    expect(() => resolveAdminUserActivityScopeFromSettingsOrThrow('', null, null)).toThrow(
      'Missing system settings for admin user activity scope.',
    )
  })

  it('still allows search to expand to all users without settings', () => {
    expect(resolveAdminUserActivityScopeFromSettingsOrThrow('charlie', null, null)).toBe('all')
  })
})
