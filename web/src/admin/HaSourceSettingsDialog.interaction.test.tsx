import '../../test/happydom'

import { afterEach, describe, expect, it } from 'bun:test'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

import type { HaSourceSettingsApiError, HaStatus } from '../api'
import { translations } from '../i18n'
import HaSourceSettingsDialog from './HaSourceSettingsDialog'

const strings = translations.zh.admin.systemSettings.ha

const baseStatus: HaStatus = {
  mode: 'active_standby',
  nodeId: 'node-b',
  nodePublicOrigin: '203.0.113.10:58087',
  role: 'full_master',
  degraded: false,
  allowsBasicBusiness: true,
  allowsFullWrites: true,
  edgeoneDomain: 'api.example.com',
  edgeoneOrigin: '203.0.113.9:58087',
  edgeoneExpectedOrigin: '203.0.113.9:58087',
  edgeoneCurrentTarget: '203.0.113.9:58087',
  edgeoneExpectedTarget: '203.0.113.9:58087',
  edgeoneCurrentSourceKind: 'direct',
  edgeoneExpectedSourceKind: 'direct',
  edgeoneCurrentOriginGroupId: null,
  edgeoneExpectedOriginGroupId: null,
  haSourceDefaults: {
    sourceKind: 'direct',
    directOriginScheme: 'https',
    directOriginHost: '203.0.113.9',
    directOriginPort: 58087,
    originGroupId: null,
    target: '203.0.113.9:58087',
  },
  haSourceOverride: null,
  haSourceEffective: {
    sourceKind: 'direct',
    directOriginScheme: 'https',
    directOriginHost: '203.0.113.9',
    directOriginPort: 58087,
    originGroupId: null,
    target: '203.0.113.9:58087',
  },
  edgeoneApiConfigured: true,
  lastEdgeoneCheckAt: 1_700_000_000,
  lastSyncAt: 1_700_000_002,
  syncLagSeconds: 8,
  recoveryStatus: null,
  message: 'node is serving as active master',
}

async function flushEffects(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  })
}

afterEach(() => {
  document.body.innerHTML = ''
})

function getPortalText(): string {
  return document.body.textContent ?? ''
}

describe('HaSourceSettingsDialog interactions', () => {
  it('shows field-level validation without rendering a submit failure alert', async () => {
    let submitCalled = false
    const invalidDirectStatus: HaStatus = {
      ...baseStatus,
      haSourceDefaults: {
        ...baseStatus.haSourceDefaults!,
        directOriginHost: '',
        target: ':58087',
      },
      haSourceEffective: {
        ...baseStatus.haSourceEffective!,
        directOriginHost: '',
        target: ':58087',
      },
    }

    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <HaSourceSettingsDialog
          open
          status={invalidDirectStatus}
          strings={strings}
          onOpenChange={() => undefined}
          onSaved={() => undefined}
          submitSourceSettings={async () => {
            submitCalled = true
            return baseStatus
          }}
        />,
      )
    })
    await flushEffects()

    const saveButton = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.trim() === strings.sourceSave,
    )
    expect(saveButton).not.toBeNull()

    await act(async () => {
      saveButton!.click()
    })
    await flushEffects()

    expect(getPortalText()).toContain(strings.sourceInvalidDirectHost)
    expect(getPortalText()).not.toContain(strings.sourceSaveFailedTitle)
    expect(document.body.querySelector('.alert.alert-error')).toBeNull()
    expect(submitCalled).toBe(false)

    await act(async () => root.unmount())
  })

  it('renders a destructive alert with collapsible technical details on submit failure', async () => {
    const submitSourceSettings = async (): Promise<HaStatus> => {
      const error = new Error('Failed to deserialize the JSON body into the target type') as HaSourceSettingsApiError
      error.status = 400
      error.rawDetail =
        'Failed to deserialize the JSON body into the target type: directOriginScheme: unknown variant `https`'
      throw error
    }

    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <HaSourceSettingsDialog
          open
          status={baseStatus}
          strings={strings}
          onOpenChange={() => undefined}
          onSaved={() => undefined}
          submitSourceSettings={submitSourceSettings}
        />,
      )
    })
    await flushEffects()

    const applyButton = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.trim() === strings.sourceSaveAndApply,
    )
    expect(applyButton).not.toBeNull()

    await act(async () => {
      applyButton!.click()
    })
    await flushEffects()

    const alert = document.body.querySelector('.alert.alert-error')
    expect(alert).not.toBeNull()
    expect(alert?.textContent).toContain(strings.sourceApplyFailedTitle)
    expect(alert?.textContent).toContain(strings.sourceSubmitFailedDescription)
    expect(alert?.textContent).toContain(strings.sourceTechnicalDetailsLabel)
    expect(alert?.textContent).not.toContain('unknown variant `https`')

    const details = alert?.querySelector('details')
    expect(details).not.toBeNull()
    expect(details?.open).toBe(false)

    await act(async () => {
      details?.setAttribute('open', '')
      details?.dispatchEvent(new Event('toggle'))
    })
    await flushEffects()

    expect(details?.open).toBe(true)
    expect(alert?.textContent).toContain('unknown variant `https`')

    await act(async () => root.unmount())
  })
})
