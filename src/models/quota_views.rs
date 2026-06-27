use serde::Serialize;

use super::*;

#[derive(Debug, Clone)]
pub struct AdminQuotaLimitSet {
    pub hourly_any_limit: i64,
    pub hourly_limit: i64,
    pub daily_limit: i64,
    pub monthly_limit: i64,
    pub inherits_defaults: bool,
}

#[derive(Debug, Clone)]
pub struct AdminUserTag {
    pub id: String,
    pub name: String,
    pub display_name: String,
    pub icon: Option<String>,
    pub system_key: Option<String>,
    pub effect_kind: String,
    pub hourly_any_delta: i64,
    pub hourly_delta: i64,
    pub daily_delta: i64,
    pub monthly_delta: i64,
    pub user_count: i64,
}

#[derive(Debug, Clone)]
pub struct AdminUserTagBinding {
    pub tag_id: String,
    pub name: String,
    pub display_name: String,
    pub icon: Option<String>,
    pub system_key: Option<String>,
    pub effect_kind: String,
    pub hourly_any_delta: i64,
    pub hourly_delta: i64,
    pub daily_delta: i64,
    pub monthly_delta: i64,
    pub source: String,
}

#[derive(Debug, Clone)]
pub struct AdminUserQuotaBreakdownEntry {
    pub kind: String,
    pub label: String,
    pub tag_id: Option<String>,
    pub tag_name: Option<String>,
    pub source: Option<String>,
    pub effect_kind: String,
    pub hourly_any_delta: i64,
    pub hourly_delta: i64,
    pub daily_delta: i64,
    pub monthly_delta: i64,
}

#[derive(Debug, Clone)]
pub struct AdminUserQuotaDetails {
    pub base: AdminQuotaLimitSet,
    pub effective: AdminQuotaLimitSet,
    pub breakdown: Vec<AdminUserQuotaBreakdownEntry>,
    pub tags: Vec<AdminUserTagBinding>,
}

#[derive(Debug, Clone)]
pub struct UserDashboardSummary {
    pub debug_info_shared: bool,
    pub request_rate: RequestRateView,
    pub business_calls_1h: BusinessCalls1hSummary,
    pub hourly_any_used: i64,
    pub hourly_any_limit: i64,
    pub quota_hourly_used: i64,
    pub quota_hourly_limit: i64,
    pub quota_daily_used: i64,
    pub quota_daily_limit: i64,
    pub quota_monthly_used: i64,
    pub quota_monthly_limit: i64,
    pub daily_success: i64,
    pub daily_failure: i64,
    pub monthly_success: i64,
    pub monthly_failure: i64,
    pub last_activity: Option<i64>,
    pub recharge: LinuxDoCreditRechargeSummary,
}

#[derive(Debug, Clone, Serialize, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BusinessCalls1hSummary {
    pub success_count: i64,
    pub failure_count: i64,
    pub total_count: i64,
    pub limit: i64,
    pub window_minutes: i64,
}

#[derive(Debug, Clone)]
pub struct BusinessCalls1hLimitVerdict {
    pub allowed: bool,
    pub summary: BusinessCalls1hSummary,
}

impl BusinessCalls1hLimitVerdict {
    pub fn new(summary: BusinessCalls1hSummary) -> Self {
        let limit = summary.limit.max(0);
        let total_count = summary.total_count.max(0);
        Self {
            allowed: limit > 0 && total_count < limit,
            summary,
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct UserLogMetricsSummary {
    pub daily_success: i64,
    pub daily_failure: i64,
    pub monthly_success: i64,
    pub monthly_failure: i64,
    pub last_activity: Option<i64>,
}

#[derive(Debug, Clone, Default)]
pub struct TokenLogMetricsSummary {
    pub daily_success: i64,
    pub daily_failure: i64,
    pub monthly_success: i64,
    pub monthly_failure: i64,
    pub last_activity: Option<i64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AdminUserUsageSeriesKind {
    Rate5m,
    Quota1h,
    Quota24h,
    QuotaMonth,
    BusinessCalls1h,
}

impl AdminUserUsageSeriesKind {
    pub fn parse(value: &str) -> Option<Self> {
        match value.trim() {
            "rate5m" => Some(Self::Rate5m),
            "quota1h" => Some(Self::Quota1h),
            "quota24h" => Some(Self::Quota24h),
            "quotaMonth" => Some(Self::QuotaMonth),
            "businessCalls1h" => Some(Self::BusinessCalls1h),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AdminUserUsageSeriesPoint {
    pub bucket_start: i64,
    pub display_bucket_start: Option<i64>,
    pub value: Option<i64>,
    pub limit_value: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AdminUserBusinessCalls1hBarsPoint {
    pub success: Option<i64>,
    pub failure: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AdminUserBusinessCalls1hPoint {
    pub bucket_start: i64,
    pub display_bucket_start: Option<i64>,
    pub bars: AdminUserBusinessCalls1hBarsPoint,
    pub pressure: Option<i64>,
    pub limit_value: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AdminUserUsageSeries {
    pub limit: i64,
    pub points: Vec<AdminUserUsageSeriesPoint>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AdminUserBusinessCalls1hSeries {
    pub limit: i64,
    pub points: Vec<AdminUserBusinessCalls1hPoint>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UserDashboardOverviewSeriesPoint {
    pub bucket_start: i64,
    pub display_bucket_start: Option<i64>,
    pub value: Option<i64>,
    pub limit_value: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UserDashboardProgressCard {
    pub used: i64,
    pub limit: i64,
    pub points: Vec<UserDashboardOverviewSeriesPoint>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UserDashboardOverviewProgress {
    pub request_rate: UserDashboardProgressCard,
    pub quota_hourly: UserDashboardProgressCard,
    pub quota_daily: UserDashboardProgressCard,
    pub quota_monthly: UserDashboardProgressCard,
}

#[derive(Debug, Clone)]
pub struct UserDashboardOverviewSnapshot {
    pub summary: UserDashboardSummary,
    pub progress: UserDashboardOverviewProgress,
}
