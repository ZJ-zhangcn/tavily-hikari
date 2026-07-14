import { useMemo } from 'react'

import type { QueryLoadState } from './queryLoadState'
import type { Language, AdminTranslations } from '../i18n'
import type { UpstreamPrivacyGate, UpstreamPrivacyStatus, UpstreamProjectIdMode } from '../api'
import AdminLoadingRegion from '../components/AdminLoadingRegion'
import { StatusBadge } from '../components/StatusBadge'
import { Icon } from '../lib/icons'
import { Button } from '../components/ui/button'
import { Switch } from '../components/ui/switch'

interface UpstreamPrivacyStatusModuleProps {
  strings: AdminTranslations['systemSettings']['privacy']
  formStrings: AdminTranslations['systemSettings']['form']
  language: Language
  status: UpstreamPrivacyStatus | null
  loadState: QueryLoadState
  error: string | null
  refreshing: boolean
  autoRefreshEnabled: boolean
  onAutoRefreshChange: (next: boolean) => void
  onRefresh: () => Promise<void> | void
}

function phaseTone(phase: UpstreamPrivacyStatus['phase']): 'neutral' | 'info' | 'success' | 'warning' | 'error' {
  switch (phase) {
    case 'active':
      return 'success'
    case 'pending':
      return 'info'
    case 'draining':
      return 'warning'
    case 'degraded':
      return 'error'
    default:
      return 'neutral'
  }
}

function formatOptionalValue(value: string | null | undefined, emptyLabel: string): string {
  return value && value.length > 0 ? value : emptyLabel
}

function formatSignedCount(value: number): string {
  if (value > 0) return `+${value}`
  return String(value)
}

function gateLabel(strings: AdminTranslations['systemSettings']['privacy'], gate: UpstreamPrivacyGate): string {
  switch (gate.key) {
    case 'accessTokenMode':
      return strings.gateAccessTokenMode
    case 'apiRebalance':
      return strings.gateApiRebalance
    case 'mcpRebalance':
      return strings.gateMcpRebalance
    case 'controlSessionsDrained':
      return strings.gateControlSessionsDrained
    default:
      return gate.key
  }
}

function modeLabel(
  strings: AdminTranslations['systemSettings']['form'],
  mode: UpstreamProjectIdMode,
): string {
  switch (mode) {
    case 'passthrough':
      return strings.upstreamProjectIdModePassthrough
    case 'fixed':
      return strings.upstreamProjectIdModeFixed
    case 'accessToken':
      return strings.upstreamProjectIdModeAccessToken
    default:
      return mode
  }
}

export default function UpstreamPrivacyStatusModule({
  strings,
  formStrings,
  language,
  status,
  loadState,
  error,
  refreshing,
  autoRefreshEnabled,
  onAutoRefreshChange,
  onRefresh,
}: UpstreamPrivacyStatusModuleProps): JSX.Element {
  const timestampFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [language],
  )
  const numberFormatter = useMemo(
    () => new Intl.NumberFormat(language === 'zh' ? 'zh-CN' : 'en-US'),
    [language],
  )

  const phaseLabel = status
    ? ({
        configured: strings.phaseConfigured,
        draining: strings.phaseDraining,
        pending: strings.phasePending,
        active: strings.phaseActive,
        degraded: strings.phaseDegraded,
      } satisfies Record<UpstreamPrivacyStatus['phase'], string>)[status.phase]
    : strings.phaseConfigured

  return (
    <section className="surface panel upstream-privacy-shell">
      <div className="panel-header upstream-privacy-shell__header">
        <div>
          <h2>{strings.title}</h2>
          <p className="panel-description">{strings.description}</p>
        </div>
        <div className="upstream-privacy-shell__actions">
          <label className="upstream-privacy-auto-refresh">
            <span>{strings.autoRefresh}</span>
            <Switch checked={autoRefreshEnabled} onCheckedChange={onAutoRefreshChange} />
          </label>
          <Button type="button" variant="outline" size="sm" onClick={() => void onRefresh()} disabled={refreshing}>
            <Icon icon={refreshing ? 'mdi:loading' : 'mdi:refresh'} width={16} height={16} className={refreshing ? 'icon-spin' : undefined} />
            <span>{strings.refreshNow}</span>
          </Button>
        </div>
      </div>

      <AdminLoadingRegion
        loadState={loadState}
        loadingLabel={strings.loading}
        errorLabel={error ?? strings.loadFailed}
        minHeight={280}
      >
        {!status ? (
          <div className="empty-state alert">{strings.empty}</div>
        ) : (
          <div className="upstream-privacy-layout">
            <section className="upstream-privacy-hero">
              <div className="upstream-privacy-hero__headline">
                <StatusBadge tone={phaseTone(status.phase)}>{phaseLabel}</StatusBadge>
                <strong>
                  {numberFormatter.format(status.completedGates)}/{numberFormatter.format(status.totalGates)}
                </strong>
              </div>
              <div className="upstream-privacy-hero__grid">
                <PrivacyStat label={strings.generatedAt} value={timestampFormatter.format(new Date(status.generatedAt * 1000))} />
                <PrivacyStat label={strings.currentPeriod} value={status.currentPeriodCode} monospace />
                <PrivacyStat label={strings.currentPeriodEndsAt} value={timestampFormatter.format(new Date(status.currentPeriodEndsAt * 1000))} />
                <PrivacyStat
                  label={strings.nextEpochAt}
                  value={
                    status.nextEpochAt == null
                      ? strings.statusMissing
                      : timestampFormatter.format(new Date(status.nextEpochAt * 1000))
                  }
                />
              </div>
            </section>

            <section className="surface panel upstream-privacy-card">
              <div className="panel-header">
                <div>
                  <h3>{strings.gateTitle}</h3>
                  <p className="panel-description">{strings.gateDescription}</p>
                </div>
              </div>
              <div className="upstream-privacy-gates">
                {status.gates.map((gate) => (
                  <article key={gate.key} className="upstream-privacy-gate">
                    <div className="upstream-privacy-gate__head">
                      <strong>{gateLabel(strings, gate)}</strong>
                      <StatusBadge tone={gate.ready ? 'success' : 'warning'}>
                        {gate.ready ? strings.gateReady : strings.gateWaiting}
                      </StatusBadge>
                    </div>
                    <code>{gate.detail}</code>
                  </article>
                ))}
              </div>
            </section>

            <section className="surface panel upstream-privacy-card">
              <div className="panel-header">
                <div>
                  <h3>{strings.countersTitle}</h3>
                </div>
              </div>
              <div className="upstream-privacy-counters">
                <PrivacyStat label={strings.counterControlSessions} value={numberFormatter.format(status.activeControlSessions)} />
                <PrivacyStat label={strings.counterPendingResearch} value={numberFormatter.format(status.pendingResearch)} />
                <PrivacyStat label={strings.counterQueuedSettlements} value={numberFormatter.format(status.queuedSettlements)} />
                <PrivacyStat label={strings.counterDegradedSettlements} value={numberFormatter.format(status.degradedSettlements)} />
              </div>
            </section>

            <section className="surface panel upstream-privacy-card">
              <div className="panel-header">
                <div>
                  <h3>{strings.headersTitle}</h3>
                </div>
              </div>
              <div className="upstream-privacy-header-groups">
                <HeaderList title={strings.headersHttpTitle} items={status.httpAllowedHeaders} />
                <HeaderList title={strings.headersControlTitle} items={status.controlMcpAllowedHeaders} />
              </div>
            </section>

            <section className="surface panel upstream-privacy-card">
              <div className="panel-header">
                <div>
                  <h3>{strings.title}</h3>
                </div>
              </div>
              <div className="upstream-privacy-counters">
                <PrivacyStat
                  label={strings.projectIdModeConfigured}
                  value={modeLabel(formStrings, status.configuredProjectIdMode)}
                />
                <PrivacyStat
                  label={strings.projectIdModeEffective}
                  value={modeLabel(formStrings, status.effectiveProjectIdMode)}
                />
                <PrivacyStat
                  label={strings.fixedConfigured}
                  value={status.fixedProjectIdConfigured ? strings.statusConfigured : strings.statusMissing}
                />
                <PrivacyStat
                  label={strings.userAgentConfigured}
                  value={formatOptionalValue(status.configuredMcpUserAgent, strings.statusOmitted)}
                />
                <PrivacyStat
                  label={strings.userAgentEffective}
                  value={formatOptionalValue(status.effectiveMcpUserAgent, strings.statusOmitted)}
                />
              </div>
            </section>

            <section className="surface panel upstream-privacy-card">
              <div className="panel-header">
                <div>
                  <h3>{strings.adjustmentsTitle}</h3>
                </div>
              </div>
              {status.recentAdjustments.length === 0 ? (
                <div className="empty-state alert">{strings.adjustmentsEmpty}</div>
              ) : (
                <div className="upstream-privacy-adjustments">
                  {status.recentAdjustments.map((adjustment) => (
                    <article key={adjustment.settlementKey} className="upstream-privacy-adjustment">
                      <div className="upstream-privacy-adjustment__head">
                        <strong>{adjustment.periodCode}</strong>
                        <StatusBadge tone={adjustment.deltaCredits >= 0 ? 'warning' : 'success'}>
                          {formatSignedCount(adjustment.deltaCredits)}
                        </StatusBadge>
                      </div>
                      <dl>
                        <PrivacyDetail label={strings.adjustmentSubject} value={`${adjustment.billingSubjectKind}:${adjustment.tokenIdHint}`} />
                        <PrivacyDetail label={strings.adjustmentCreatedAt} value={timestampFormatter.format(new Date(adjustment.createdAt * 1000))} />
                        <PrivacyDetail label={strings.adjustmentSettlementKey} value={adjustment.settlementKey} monospace />
                        {adjustment.degradedReason ? (
                          <PrivacyDetail label={strings.degradedReason} value={adjustment.degradedReason} />
                        ) : null}
                      </dl>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </AdminLoadingRegion>
    </section>
  )
}

function HeaderList({ title, items }: { title: string; items: string[] }): JSX.Element {
  return (
    <div className="upstream-privacy-header-list">
      <strong>{title}</strong>
      {items.length === 0 ? (
        <span className="panel-description">—</span>
      ) : (
        <div className="upstream-privacy-pill-list">
          {items.map((item) => (
            <code key={item}>{item}</code>
          ))}
        </div>
      )}
    </div>
  )
}

function PrivacyStat({
  label,
  value,
  monospace = false,
}: {
  label: string
  value: string
  monospace?: boolean
}): JSX.Element {
  return (
    <article className="upstream-privacy-stat">
      <span>{label}</span>
      <strong className={monospace ? 'font-mono' : undefined}>{value}</strong>
    </article>
  )
}

function PrivacyDetail({
  label,
  value,
  monospace = false,
}: {
  label: string
  value: string
  monospace?: boolean
}): JSX.Element {
  return (
    <div className="upstream-privacy-detail">
      <dt>{label}</dt>
      <dd className={monospace ? 'font-mono' : undefined}>{value}</dd>
    </div>
  )
}
