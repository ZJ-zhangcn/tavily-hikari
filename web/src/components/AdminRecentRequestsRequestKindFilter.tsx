import { useCallback, useMemo, useState } from 'react'

import type { AdminTranslations } from '../i18n'
import { Icon } from '../lib/icons'
import {
  buildRequestKindQuickFilterSelection,
  buildVisibleRequestKindOptions,
  hasActiveRequestKindQuickFilters,
  mergeRequestKindCatalog,
  summarizeRequestKindQuickFilters,
  summarizeSelectedRequestKinds,
  type TokenLogRequestKindOption,
  type TokenLogRequestKindQuickBilling,
  type TokenLogRequestKindQuickProtocol,
} from '../tokenLogRequestKinds'

import RequestKindBadge from './RequestKindBadge'
import { Button } from './ui/button'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from './ui/drawer'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import SegmentedTabs from './ui/SegmentedTabs'

type Language = 'en' | 'zh'
type RequestKindContainer = 'dropdown' | 'drawer'

const requestKindBillingQuickFilterOptions = [
  { value: 'all', label: 'Any' },
  { value: 'billable', label: 'Paid' },
  { value: 'non_billable', label: 'Free' },
] as const

const requestKindProtocolQuickFilterOptions = [
  { value: 'all', label: 'Any' },
  { value: 'mcp', label: 'MCP' },
  { value: 'api', label: 'API' },
] as const

const recentRequestsCompactAllLabel = 'All'

function resolveRequestKindProtocolGroup(
  option: TokenLogRequestKindOption,
): 'api' | 'mcp' {
  if (option.protocol_group === 'api' || option.key.startsWith('api:')) {
    return 'api'
  }
  return 'mcp'
}

function summarizeRequestKindTrigger(
  effectiveSelectedRequestKinds: string[],
  hasActiveQuickRequestKindFilters: boolean,
  requestKindQuickSummary: string,
  requestKindSummary: string,
  language: Language,
  allLabel: string,
): string {
  if (hasActiveQuickRequestKindFilters) return requestKindQuickSummary
  if (effectiveSelectedRequestKinds.length === 0) return allLabel
  if (effectiveSelectedRequestKinds.length <= 2) return requestKindSummary
  return language === 'zh'
    ? `已选 ${effectiveSelectedRequestKinds.length} 项`
    : `${effectiveSelectedRequestKinds.length} selected`
}

interface AdminRecentRequestsRequestKindFilterProps {
  language: Language
  isSmallViewport: boolean
  strings: AdminTranslations
  requestKindOptions: TokenLogRequestKindOption[]
  requestKindQuickBilling: TokenLogRequestKindQuickBilling
  requestKindQuickProtocol: TokenLogRequestKindQuickProtocol
  selectedRequestKinds: string[]
  onRequestKindQuickFiltersChange: (
    billing: TokenLogRequestKindQuickBilling,
    protocol: TokenLogRequestKindQuickProtocol,
  ) => void
  onToggleRequestKind: (key: string) => void
  onClearRequestKinds: () => void
}

export default function AdminRecentRequestsRequestKindFilter({
  language,
  isSmallViewport,
  strings,
  requestKindOptions,
  requestKindQuickBilling,
  requestKindQuickProtocol,
  selectedRequestKinds,
  onRequestKindQuickFiltersChange,
  onToggleRequestKind,
  onClearRequestKinds,
}: AdminRecentRequestsRequestKindFilterProps): JSX.Element {
  const [requestKindFilterOpen, setRequestKindFilterOpen] = useState(false)

  const normalizedSelectedRequestKinds = useMemo(
    () => Array.from(new Set(selectedRequestKinds.map((value) => value.trim()).filter(Boolean))),
    [selectedRequestKinds],
  )

  const requestKindCatalog = useMemo(
    () => mergeRequestKindCatalog(requestKindOptions),
    [requestKindOptions],
  )

  const requestKindQuickFilters = useMemo(
    () => ({
      billing: requestKindQuickBilling,
      protocol: requestKindQuickProtocol,
    }),
    [requestKindQuickBilling, requestKindQuickProtocol],
  )

  const hasActiveQuickRequestKindFilters = useMemo(
    () => hasActiveRequestKindQuickFilters(requestKindQuickFilters),
    [requestKindQuickFilters],
  )

  const quickSelection = useMemo(
    () => buildRequestKindQuickFilterSelection(requestKindOptions, requestKindQuickFilters),
    [requestKindOptions, requestKindQuickFilters],
  )

  const effectiveSelectedRequestKinds = useMemo(
    () => (hasActiveQuickRequestKindFilters ? quickSelection : normalizedSelectedRequestKinds),
    [hasActiveQuickRequestKindFilters, normalizedSelectedRequestKinds, quickSelection],
  )

  const visibleRequestKindOptions = useMemo(
    () =>
      buildVisibleRequestKindOptions(
        effectiveSelectedRequestKinds,
        requestKindCatalog,
        Object.fromEntries(requestKindCatalog.map((option) => [option.key, option])),
      ),
    [effectiveSelectedRequestKinds, requestKindCatalog],
  )

  const requestKindSummary = useMemo(
    () =>
      summarizeSelectedRequestKinds(
        effectiveSelectedRequestKinds,
        visibleRequestKindOptions,
        strings.logs.filters.requestTypeAll,
      ),
    [effectiveSelectedRequestKinds, strings.logs.filters.requestTypeAll, visibleRequestKindOptions],
  )

  const requestKindQuickSummary = useMemo(
    () => summarizeRequestKindQuickFilters(requestKindQuickFilters),
    [requestKindQuickFilters],
  )

  const requestKindClearDisabled =
    effectiveSelectedRequestKinds.length === 0 && !hasActiveQuickRequestKindFilters

  const requestKindColumnGroups = useMemo(() => {
    const api: TokenLogRequestKindOption[] = []
    const mcp: TokenLogRequestKindOption[] = []

    for (const option of visibleRequestKindOptions) {
      if (resolveRequestKindProtocolGroup(option) === 'api') {
        api.push(option)
      } else {
        mcp.push(option)
      }
    }

    return { api, mcp }
  }, [visibleRequestKindOptions])

  const requestKindTriggerSummary = useMemo(
    () =>
      summarizeRequestKindTrigger(
        effectiveSelectedRequestKinds,
        hasActiveQuickRequestKindFilters,
        requestKindQuickSummary,
        requestKindSummary,
        language,
        recentRequestsCompactAllLabel,
      ),
    [
      effectiveSelectedRequestKinds,
      hasActiveQuickRequestKindFilters,
      language,
      requestKindQuickSummary,
      requestKindSummary,
    ],
  )

  const handleClearRequestKinds = useCallback(() => {
    if (requestKindClearDisabled) return
    onClearRequestKinds()
  }, [onClearRequestKinds, requestKindClearDisabled])

  const renderRequestKindOptionsList = useCallback(
    (
      options: TokenLogRequestKindOption[],
      groupLabel: string,
      container: RequestKindContainer,
    ) => (
      <div className="token-request-kind-group">
        <div className="token-request-kind-group-label">{groupLabel}</div>
        {options.length === 0 ? (
          <div className="token-request-kind-empty">{strings.logs.filters.requestTypeEmpty}</div>
        ) : (
          <div className="token-request-kind-group-options">
            {options.map((option) => {
              const checked = effectiveSelectedRequestKinds.includes(option.key)
              const content = (
                <span className="recent-requests-request-kind-option">
                  <RequestKindBadge
                    requestKindKey={option.key}
                    requestKindLabel={option.label}
                    size="sm"
                  />
                  <span className="recent-requests-request-kind-count">{`x${option.count ?? 0}`}</span>
                </span>
              )

              if (container === 'drawer') {
                return (
                  <button
                    key={option.key}
                    type="button"
                    role="checkbox"
                    aria-checked={checked}
                    className={`recent-requests-request-kind-drawer-item${
                      checked ? ' recent-requests-request-kind-drawer-item--checked' : ''
                    }`}
                    onClick={() => onToggleRequestKind(option.key)}
                  >
                    <span className="recent-requests-request-kind-drawer-mark" aria-hidden="true">
                      {checked ? <Icon icon="mdi:check" width={16} height={16} /> : null}
                    </span>
                    {content}
                  </button>
                )
              }

              return (
                <DropdownMenuCheckboxItem
                  key={option.key}
                  className="cursor-pointer recent-requests-request-kind-item"
                  checked={checked}
                  onSelect={(event) => event.preventDefault()}
                  onCheckedChange={() => onToggleRequestKind(option.key)}
                >
                  {content}
                </DropdownMenuCheckboxItem>
              )
            })}
          </div>
        )}
      </div>
    ),
    [effectiveSelectedRequestKinds, onToggleRequestKind, strings.logs.filters.requestTypeEmpty],
  )

  const renderRequestKindFiltersContent = useCallback(
    (container: RequestKindContainer) => (
      <div
        className={[
          'token-request-kind-panel',
          `token-request-kind-panel--${container}`,
        ].join(' ')}
      >
        <div className="token-request-kind-panel-header">
          <div className="token-request-kind-panel-title">{strings.logs.filters.requestType}</div>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="token-request-kind-clear"
            disabled={requestKindClearDisabled}
            onClick={handleClearRequestKinds}
          >
            {strings.users.clear}
          </Button>
        </div>
        <div className="token-request-kind-layout">
          <div className="token-request-kind-quick-filters">
            <div className="token-request-kind-quick-cell">
              <div className="token-request-kind-group-label">
                {strings.logs.filters.billingGroup}
              </div>
              <SegmentedTabs<TokenLogRequestKindQuickBilling>
                value={requestKindQuickBilling}
                onChange={(next) =>
                  onRequestKindQuickFiltersChange(next, requestKindQuickProtocol)
                }
                options={requestKindBillingQuickFilterOptions}
                ariaLabel={strings.logs.filters.billingGroup}
                className="token-request-quick-segmented"
                smallViewportBehavior={container === 'drawer' ? 'buttons' : 'select'}
              />
            </div>
            <div className="token-request-kind-quick-cell">
              <div className="token-request-kind-group-label">
                {strings.logs.filters.protocolGroup}
              </div>
              <SegmentedTabs<TokenLogRequestKindQuickProtocol>
                value={requestKindQuickProtocol}
                onChange={(next) =>
                  onRequestKindQuickFiltersChange(requestKindQuickBilling, next)
                }
                options={requestKindProtocolQuickFilterOptions}
                ariaLabel={strings.logs.filters.protocolGroup}
                className="token-request-quick-segmented"
                smallViewportBehavior={container === 'drawer' ? 'buttons' : 'select'}
              />
            </div>
          </div>
          <div className="token-request-kind-columns">
            {renderRequestKindOptionsList(requestKindColumnGroups.api, 'API', container)}
            {renderRequestKindOptionsList(requestKindColumnGroups.mcp, 'MCP', container)}
          </div>
        </div>
      </div>
    ),
    [
      handleClearRequestKinds,
      onRequestKindQuickFiltersChange,
      renderRequestKindOptionsList,
      requestKindClearDisabled,
      requestKindColumnGroups.api,
      requestKindColumnGroups.mcp,
      requestKindQuickBilling,
      requestKindQuickProtocol,
      strings.logs.filters.billingGroup,
      strings.logs.filters.protocolGroup,
      strings.logs.filters.requestType,
      strings.users.clear,
    ],
  )

  return (
    <div className="recent-requests-filter-field recent-requests-filter-field--request-kind">
      <span className="recent-requests-filter-label">{strings.logs.filters.requestType}</span>
      {isSmallViewport ? (
        <Drawer
          open={requestKindFilterOpen}
          onOpenChange={setRequestKindFilterOpen}
          shouldScaleBackground={false}
        >
          <button
            type="button"
            className="recent-requests-filter-select-trigger recent-requests-filter-select-trigger--menu"
            aria-label={`${strings.logs.filters.requestType}: ${requestKindTriggerSummary}`}
            onClick={() => setRequestKindFilterOpen(true)}
          >
            <span className="recent-requests-filter-select-text">{requestKindTriggerSummary}</span>
            <Icon icon="mdi:chevron-down" width={16} height={16} aria-hidden="true" />
          </button>
          <DrawerContent className="token-request-kind-drawer">
            <DrawerHeader className="sr-only">
              <DrawerTitle>{strings.logs.filters.requestType}</DrawerTitle>
              <DrawerDescription>{strings.logs.descriptionFallback}</DrawerDescription>
            </DrawerHeader>
            {renderRequestKindFiltersContent('drawer')}
          </DrawerContent>
        </Drawer>
      ) : (
        <DropdownMenu open={requestKindFilterOpen} onOpenChange={setRequestKindFilterOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="recent-requests-filter-select-trigger recent-requests-filter-select-trigger--menu"
              aria-label={`${strings.logs.filters.requestType}: ${requestKindTriggerSummary}`}
            >
              <span className="recent-requests-filter-select-text">{requestKindTriggerSummary}</span>
              <Icon icon="mdi:chevron-down" width={16} height={16} aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="token-request-kind-menu recent-requests-filter-menu recent-requests-filter-menu--request-kind"
          >
            {renderRequestKindFiltersContent('dropdown')}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}
