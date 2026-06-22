import type { ReactNode } from 'react'

import AdminLoadingRegion from '../../components/AdminLoadingRegion'
import AdminTablePagination from '../../components/AdminTablePagination'
import AdminTableShell from '../../components/AdminTableShell'
import { StatusBadge } from '../../components/StatusBadge'
import type {
  AdminUnboundTokenUsageSortField,
  AdminUnboundTokenUsageSummary,
  SortDirection,
} from '../../api'
import type { AdminTranslations } from '../../i18n'
import { formatRequestRateSummary, resolveRequestRate } from '../../requestRate'

import type { QueryLoadState } from '../queryLoadState'

import {
  AdminTableValueStack,
  AdminUsersSortableHeader,
  MonthlyBrokenCountTrigger,
  formatUnboundTokenIdentityMeta,
  formatSuccessRateStackValue,
  type StackedValue,
  UsagePageIntro,
} from './shared'

export interface UnboundTokenUsageScreenProps {
  items: AdminUnboundTokenUsageSummary[]
  language: 'en' | 'zh'
  usersStrings: AdminTranslations['users']
  unboundTokenUsageStrings: AdminTranslations['unboundTokenUsage']
  tokenStrings: AdminTranslations['tokens']
  searchControls: ReactNode
  loadState: QueryLoadState
  loadingLabel: ReactNode
  errorLabel: ReactNode
  activeSortField: AdminUnboundTokenUsageSortField | null
  activeSortOrder: SortDirection | null
  onToggleSort: (field: AdminUnboundTokenUsageSortField) => void
  onOpenToken: (tokenId: string) => void
  onOpenMonthlyBrokenDrawer: (tokenId: string, label: string) => void
  formatNumber: (value: number) => string
  formatTimestamp: (value: number | null) => string
  formatQuotaUsagePair: (used: number, limit: number) => string
  formatQuotaStackValue: (used: number, limit: number) => StackedValue
  formatCompactSuccessRateValue: (success: number, failure: number, language: 'en' | 'zh') => string
  formatStackedTimestamp: (value: number | null, language: 'en' | 'zh') => StackedValue
  formatMonthlyBrokenStackValue: (count: number, limit: number) => StackedValue
  pagination?: ReactNode
}

export function UnboundTokenUsageScreen({
  items,
  language,
  usersStrings,
  unboundTokenUsageStrings,
  tokenStrings,
  searchControls,
  loadState,
  loadingLabel,
  errorLabel,
  activeSortField,
  activeSortOrder,
  onToggleSort,
  onOpenToken,
  onOpenMonthlyBrokenDrawer,
  formatTimestamp,
  formatQuotaUsagePair,
  formatQuotaStackValue,
  formatCompactSuccessRateValue,
  formatStackedTimestamp,
  formatMonthlyBrokenStackValue,
  pagination,
}: UnboundTokenUsageScreenProps): JSX.Element {
  const usageDailyRateLabel =
    language === 'zh' ? unboundTokenUsageStrings.table.dailySuccessRate : 'Daily'
  const usageMonthlyRateLabel =
    language === 'zh' ? unboundTokenUsageStrings.table.monthlySuccessRate : 'Monthly'

  return (
    <>
      <UsagePageIntro
        title={unboundTokenUsageStrings.title}
        description={unboundTokenUsageStrings.description}
        searchControls={searchControls}
      />

      <section className="surface panel">
        <AdminTableShell
          className="jobs-table-wrapper admin-users-usage-table-wrapper admin-responsive-up"
          tableClassName="jobs-table admin-users-table admin-users-usage-table"
          loadState={loadState}
          loadingLabel={loadingLabel}
          errorLabel={errorLabel}
          minHeight={360}
        >
          {items.length === 0 ? (
            <tbody>
              <tr>
                <td colSpan={10}>
                  <div className="empty-state alert">{unboundTokenUsageStrings.empty.none}</div>
                </td>
              </tr>
            </tbody>
          ) : (
            <>
              <thead>
                <tr>
                  <th>{unboundTokenUsageStrings.table.identity}</th>
                  <th>{unboundTokenUsageStrings.table.status}</th>
                  <AdminUsersSortableHeader
                    label={unboundTokenUsageStrings.table.hourlyAny}
                    field="hourlyAnyUsed"
                    activeField={activeSortField}
                    activeOrder={activeSortOrder}
                    onToggle={onToggleSort}
                  />
                  <AdminUsersSortableHeader
                    label={unboundTokenUsageStrings.table.hourly}
                    field="quotaHourlyUsed"
                    activeField={activeSortField}
                    activeOrder={activeSortOrder}
                    onToggle={onToggleSort}
                  />
                  <AdminUsersSortableHeader
                    label={unboundTokenUsageStrings.table.daily}
                    field="quotaDailyUsed"
                    activeField={activeSortField}
                    activeOrder={activeSortOrder}
                    onToggle={onToggleSort}
                  />
                  <AdminUsersSortableHeader
                    label={unboundTokenUsageStrings.table.monthly}
                    field="quotaMonthlyUsed"
                    activeField={activeSortField}
                    activeOrder={activeSortOrder}
                    onToggle={onToggleSort}
                  />
                  <AdminUsersSortableHeader
                    label={unboundTokenUsageStrings.table.monthlyBroken}
                    field="monthlyBrokenCount"
                    activeField={activeSortField}
                    activeOrder={activeSortOrder}
                    onToggle={onToggleSort}
                  />
                  <AdminUsersSortableHeader
                    label={unboundTokenUsageStrings.table.dailySuccessRate}
                    displayLabel={usageDailyRateLabel}
                    field="dailySuccessRate"
                    activeField={activeSortField}
                    activeOrder={activeSortOrder}
                    onToggle={onToggleSort}
                  />
                  <AdminUsersSortableHeader
                    label={unboundTokenUsageStrings.table.monthlySuccessRate}
                    displayLabel={usageMonthlyRateLabel}
                    field="monthlySuccessRate"
                    activeField={activeSortField}
                    activeOrder={activeSortOrder}
                    onToggle={onToggleSort}
                  />
                  <AdminUsersSortableHeader
                    label={unboundTokenUsageStrings.table.lastUsed}
                    field="lastUsedAt"
                    activeField={activeSortField}
                    activeOrder={activeSortOrder}
                    onToggle={onToggleSort}
                  />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const requestRate = resolveRequestRate(item, 'token')
                  const requestRateMetric = formatQuotaStackValue(requestRate.used, requestRate.limit)
                  const hourlyMetric = formatQuotaStackValue(item.quotaHourlyUsed, item.quotaHourlyLimit)
                  const dailyQuotaMetric = formatQuotaStackValue(item.quotaDailyUsed, item.quotaDailyLimit)
                  const monthlyQuotaMetric = formatQuotaStackValue(item.quotaMonthlyUsed, item.quotaMonthlyLimit)
                  const monthlyBrokenMetric =
                    item.monthlyBrokenCount == null || item.monthlyBrokenLimit == null
                      ? null
                      : formatMonthlyBrokenStackValue(item.monthlyBrokenCount, item.monthlyBrokenLimit)
                  const dailySuccessMetric = formatSuccessRateStackValue(
                    item.dailySuccess,
                    item.dailyFailure,
                    language,
                  )
                  const monthlySuccessMetric = formatSuccessRateStackValue(
                    item.monthlySuccess,
                    item.monthlyFailure,
                    language,
                  )
                  return (
                    <tr key={item.tokenId} data-token-row={item.tokenId}>
                      <td className="admin-users-identity-cell">
                        <button
                          type="button"
                          className="link-button admin-users-identity-button"
                          data-token-identity={item.tokenId}
                          onClick={() => onOpenToken(item.tokenId)}
                        >
                          <strong>{item.tokenId}</strong>
                        </button>
                        <div className="panel-description admin-users-identity-meta">
                          {formatUnboundTokenIdentityMeta(item.note, item.group, tokenStrings.groups.label)}
                        </div>
                      </td>
                      <td>
                        <StatusBadge tone={item.enabled ? 'success' : 'neutral'}>
                          {item.enabled ? usersStrings.status.enabled : usersStrings.status.disabled}
                        </StatusBadge>
                      </td>
                      <td className="admin-users-compact-cell">
                        <AdminTableValueStack {...requestRateMetric} />
                      </td>
                      <td className="admin-users-compact-cell">
                        <AdminTableValueStack {...hourlyMetric} />
                      </td>
                      <td className="admin-users-compact-cell">
                        <AdminTableValueStack {...dailyQuotaMetric} />
                      </td>
                      <td className="admin-users-compact-cell">
                        <AdminTableValueStack {...monthlyQuotaMetric} />
                      </td>
                      <td className="admin-users-compact-cell">
                        {monthlyBrokenMetric == null ? (
                          <AdminTableValueStack primary="—" />
                        ) : (
                          <div className="admin-table-value-stack">
                            <MonthlyBrokenCountTrigger
                              count={item.monthlyBrokenCount ?? 0}
                              onOpen={() => onOpenMonthlyBrokenDrawer(item.tokenId, item.tokenId)}
                              ariaLabel={usersStrings.brokenKeys.openDetails.replace('{label}', item.tokenId)}
                              className={monthlyBrokenMetric.primaryClassName}
                            />
                            <span className="admin-table-value-secondary">{monthlyBrokenMetric.secondary}</span>
                          </div>
                        )}
                      </td>
                      <td className="admin-users-compact-cell">
                        <AdminTableValueStack {...dailySuccessMetric} />
                      </td>
                      <td className="admin-users-compact-cell">
                        <AdminTableValueStack {...monthlySuccessMetric} />
                      </td>
                      <td className="admin-users-compact-cell">
                        <AdminTableValueStack {...formatStackedTimestamp(item.lastUsedAt, language)} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </>
          )}
        </AdminTableShell>

        <AdminLoadingRegion
          className="admin-mobile-list admin-responsive-down"
          loadState={loadState}
          loadingLabel={loadingLabel}
          errorLabel={errorLabel}
          minHeight={260}
        >
          {items.length === 0 ? (
            <div className="empty-state alert">{unboundTokenUsageStrings.empty.none}</div>
          ) : (
            items.map((item) => {
              const requestRate = resolveRequestRate(item, 'token')
              return (
                <article key={item.tokenId} className="admin-mobile-card">
                  <div className="admin-mobile-identity-block">
                    <div className="admin-mobile-identity-row">
                      <span className="admin-mobile-identity-label">{unboundTokenUsageStrings.table.identity}</span>
                      <button
                        type="button"
                        className="link-button admin-users-mobile-link"
                        onClick={() => onOpenToken(item.tokenId)}
                      >
                        <strong>{item.tokenId}</strong>
                      </button>
                    </div>
                    <div className="panel-description admin-mobile-identity-meta">
                      {formatUnboundTokenIdentityMeta(item.note, item.group, tokenStrings.groups.label)}
                    </div>
                  </div>
                  <div className="admin-mobile-kv">
                    <span>{unboundTokenUsageStrings.table.status}</span>
                    <StatusBadge tone={item.enabled ? 'success' : 'neutral'}>
                      {item.enabled ? usersStrings.status.enabled : usersStrings.status.disabled}
                    </StatusBadge>
                  </div>
                  <div className="admin-mobile-kv">
                    <span>{formatRequestRateSummary(requestRate, language)}</span>
                    <strong>{formatQuotaUsagePair(requestRate.used, requestRate.limit)}</strong>
                  </div>
                  <div className="admin-mobile-kv">
                    <span>{unboundTokenUsageStrings.table.hourly}</span>
                    <strong>{formatQuotaUsagePair(item.quotaHourlyUsed, item.quotaHourlyLimit)}</strong>
                  </div>
                  <div className="admin-mobile-kv">
                    <span>{unboundTokenUsageStrings.table.daily}</span>
                    <strong>{formatQuotaUsagePair(item.quotaDailyUsed, item.quotaDailyLimit)}</strong>
                  </div>
                  <div className="admin-mobile-kv">
                    <span>{unboundTokenUsageStrings.table.monthly}</span>
                    <strong>{formatQuotaUsagePair(item.quotaMonthlyUsed, item.quotaMonthlyLimit)}</strong>
                  </div>
                  <div className="admin-mobile-kv">
                    <span>{unboundTokenUsageStrings.table.monthlyBroken}</span>
                    {item.monthlyBrokenCount == null || item.monthlyBrokenLimit == null ? (
                      <strong>—</strong>
                    ) : item.monthlyBrokenCount > 0 ? (
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => onOpenMonthlyBrokenDrawer(item.tokenId, item.tokenId)}
                      >
                        <strong>{formatQuotaUsagePair(item.monthlyBrokenCount, item.monthlyBrokenLimit)}</strong>
                      </button>
                    ) : (
                      <strong>{formatQuotaUsagePair(item.monthlyBrokenCount, item.monthlyBrokenLimit)}</strong>
                    )}
                  </div>
                  <div className="admin-mobile-kv">
                    <span>{unboundTokenUsageStrings.table.dailySuccessRate}</span>
                    <strong>{formatCompactSuccessRateValue(item.dailySuccess, item.dailyFailure, language)}</strong>
                  </div>
                  <div className="admin-mobile-kv">
                    <span>{unboundTokenUsageStrings.table.monthlySuccessRate}</span>
                    <strong>{formatCompactSuccessRateValue(item.monthlySuccess, item.monthlyFailure, language)}</strong>
                  </div>
                  <div className="admin-mobile-kv">
                    <span>{unboundTokenUsageStrings.table.lastUsed}</span>
                    <strong>{formatTimestamp(item.lastUsedAt)}</strong>
                  </div>
                </article>
              )
            })
          )}
        </AdminLoadingRegion>

        {pagination}
      </section>
    </>
  )
}
