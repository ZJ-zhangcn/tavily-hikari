use super::*;

#[tokio::test]
async fn account_usage_rollup_rebuild_writes_request_day_and_secondary_success_buckets() {
    let db_path = temp_db_path("account-usage-rollup-request-day-secondary-success");
    let db_str = db_path.to_string_lossy().to_string();

    let proxy = TavilyProxy::with_endpoint(Vec::<String>::new(), DEFAULT_UPSTREAM, &db_str)
        .await
        .expect("proxy created");
    let user = proxy
        .upsert_oauth_account(&OAuthAccountProfile {
            provider: "github".to_string(),
            provider_user_id: "request-day-secondary-success".to_string(),
            username: Some("request_day_secondary_success".to_string()),
            name: Some("Request Day Secondary Success".to_string()),
            avatar_template: None,
            active: true,
            trust_level: None,
            raw_payload_json: None,
        })
        .await
        .expect("upsert user");
    let token = proxy
        .ensure_user_token_binding(&user.user_id, Some("request-day-secondary-success"))
        .await
        .expect("bind token");

    proxy
        .record_token_attempt(
            &token.id,
            &Method::POST,
            "/api/tavily/search",
            Some("q=valuable"),
            Some(StatusCode::OK.as_u16() as i64),
            Some(200),
            true,
            OUTCOME_SUCCESS,
            None,
        )
        .await
        .expect("record valuable success");
    proxy
        .record_token_attempt(
            &token.id,
            &Method::GET,
            "/api/tavily/usage",
            None,
            Some(StatusCode::OK.as_u16() as i64),
            Some(200),
            false,
            OUTCOME_SUCCESS,
            None,
        )
        .await
        .expect("record secondary success");

    let created_at: i64 = sqlx::query_scalar(
        r#"
        SELECT created_at
        FROM auth_token_logs
        WHERE token_id = ?
        ORDER BY id DESC
        LIMIT 1
        "#,
    )
    .bind(&token.id)
    .fetch_one(&proxy.key_store.pool)
    .await
    .expect("load latest created_at");
    let day_bucket_start = local_day_bucket_start_utc_ts(created_at);

    proxy
        .key_store
        .rebuild_account_usage_rollup_buckets_v1()
        .await
        .expect("rebuild account usage rollups");

    let request_day_values = proxy
        .key_store
        .fetch_account_usage_rollup_values(
            &user.user_id,
            AccountUsageRollupMetricKind::RequestCount,
            AccountUsageRollupBucketKind::Day,
            day_bucket_start,
            day_bucket_start + SECS_PER_DAY,
        )
        .await
        .expect("load request day rollups");
    let primary_day_values = proxy
        .key_store
        .fetch_account_usage_rollup_values(
            &user.user_id,
            AccountUsageRollupMetricKind::PrimarySuccess,
            AccountUsageRollupBucketKind::Day,
            day_bucket_start,
            day_bucket_start + SECS_PER_DAY,
        )
        .await
        .expect("load primary day rollups");
    let secondary_day_values = proxy
        .key_store
        .fetch_account_usage_rollup_values(
            &user.user_id,
            AccountUsageRollupMetricKind::SecondarySuccess,
            AccountUsageRollupBucketKind::Day,
            day_bucket_start,
            day_bucket_start + SECS_PER_DAY,
        )
        .await
        .expect("load secondary day rollups");

    assert_eq!(request_day_values.get(&day_bucket_start), Some(&2));
    assert_eq!(primary_day_values.get(&day_bucket_start), Some(&1));
    assert_eq!(secondary_day_values.get(&day_bucket_start), Some(&1));

    let _ = std::fs::remove_file(db_path);
}

#[tokio::test]
async fn account_usage_rollup_rebuild_backfills_request_day_buckets_beyond_rate5m_window() {
    let db_path = temp_db_path("account-usage-rollup-request-day-beyond-rate5m-window");
    let db_str = db_path.to_string_lossy().to_string();

    let proxy = TavilyProxy::with_endpoint(Vec::<String>::new(), DEFAULT_UPSTREAM, &db_str)
        .await
        .expect("proxy created");
    let user = proxy
        .upsert_oauth_account(&OAuthAccountProfile {
            provider: "github".to_string(),
            provider_user_id: "request-day-beyond-rate5m-window".to_string(),
            username: Some("request_day_beyond_rate5m_window".to_string()),
            name: Some("Request Day Beyond Rate5m Window".to_string()),
            avatar_template: None,
            active: true,
            trust_level: None,
            raw_payload_json: None,
        })
        .await
        .expect("upsert user");
    let token = proxy
        .ensure_user_token_binding(&user.user_id, Some("request-day-beyond-rate5m-window"))
        .await
        .expect("bind token");

    proxy
        .record_token_attempt(
            &token.id,
            &Method::POST,
            "/api/tavily/search",
            Some("q=older-day"),
            Some(StatusCode::OK.as_u16() as i64),
            Some(200),
            true,
            OUTCOME_SUCCESS,
            None,
        )
        .await
        .expect("record older valuable success");

    let older_created_at = Utc::now().timestamp().saturating_sub(60 * SECS_PER_DAY);
    sqlx::query("UPDATE auth_token_logs SET created_at = ? WHERE token_id = ?")
        .bind(older_created_at)
        .bind(&token.id)
        .execute(&proxy.key_store.pool)
        .await
        .expect("backdate auth token log beyond rate5m window");
    let day_bucket_start = local_day_bucket_start_utc_ts(older_created_at);

    proxy
        .key_store
        .rebuild_account_usage_rollup_buckets_v1()
        .await
        .expect("rebuild account usage rollups");

    let day_values = proxy
        .key_store
        .fetch_account_usage_rollup_values(
            &user.user_id,
            AccountUsageRollupMetricKind::RequestCount,
            AccountUsageRollupBucketKind::Day,
            day_bucket_start,
            day_bucket_start + SECS_PER_DAY,
        )
        .await
        .expect("load rebuilt request day bucket");
    assert_eq!(day_values.get(&day_bucket_start), Some(&1));

    let five_minute_values = proxy
        .key_store
        .fetch_account_usage_rollup_values(
            &user.user_id,
            AccountUsageRollupMetricKind::RequestCount,
            AccountUsageRollupBucketKind::FiveMinute,
            older_created_at - older_created_at.rem_euclid(SECS_PER_FIVE_MINUTES),
            older_created_at - older_created_at.rem_euclid(SECS_PER_FIVE_MINUTES)
                + SECS_PER_FIVE_MINUTES,
        )
        .await
        .expect("load rate5m bucket beyond retention");
    assert!(five_minute_values.is_empty());

    let _ = std::fs::remove_file(db_path);
}

#[tokio::test]
async fn startup_rebuilds_request_day_rollups_when_v1_done_exists_but_day_coverage_is_missing() {
    let db_path = temp_db_path("startup-rebuilds-request-day-rollups-missing-coverage");
    let db_str = db_path.to_string_lossy().to_string();

    let proxy = TavilyProxy::with_endpoint(Vec::<String>::new(), DEFAULT_UPSTREAM, &db_str)
        .await
        .expect("proxy created");
    let user = proxy
        .upsert_oauth_account(&OAuthAccountProfile {
            provider: "github".to_string(),
            provider_user_id: "startup-day-rollup-rebuild".to_string(),
            username: Some("startup_day_rollup_rebuild".to_string()),
            name: Some("Startup Day Rollup Rebuild".to_string()),
            avatar_template: None,
            active: true,
            trust_level: None,
            raw_payload_json: None,
        })
        .await
        .expect("upsert user");
    let token = proxy
        .ensure_user_token_binding(&user.user_id, Some("startup-day-rollup-rebuild"))
        .await
        .expect("bind token");

    proxy
        .record_token_attempt(
            &token.id,
            &Method::POST,
            "/api/tavily/search",
            Some("q=startup-rebuild"),
            Some(StatusCode::OK.as_u16() as i64),
            Some(200),
            true,
            OUTCOME_SUCCESS,
            None,
        )
        .await
        .expect("record startup rebuild request");

    let historical_created_at = Utc::now().timestamp().saturating_sub(60 * SECS_PER_DAY);
    sqlx::query("UPDATE auth_token_logs SET created_at = ? WHERE token_id = ?")
        .bind(historical_created_at)
        .bind(&token.id)
        .execute(&proxy.key_store.pool)
        .await
        .expect("backdate auth token log into active90d window");
    let historical_day_bucket_start = local_day_bucket_start_utc_ts(historical_created_at);

    proxy
        .key_store
        .rebuild_account_usage_rollup_buckets_v1()
        .await
        .expect("initial rebuild");

    sqlx::query(
        r#"
        DELETE FROM account_usage_rollup_buckets
        WHERE metric_kind = ?
          AND bucket_kind = ?
        "#,
    )
    .bind(AccountUsageRollupMetricKind::RequestCount.as_str())
    .bind(AccountUsageRollupBucketKind::Day.as_str())
    .execute(&proxy.key_store.pool)
    .await
    .expect("clear request day rollups to simulate pre-upgrade state");
    proxy
        .key_store
        .set_meta_i64(
            META_KEY_ACCOUNT_USAGE_ROLLUP_V1_DONE,
            Utc::now().timestamp(),
        )
        .await
        .expect("preserve v1 done marker");
    sqlx::query("DELETE FROM meta WHERE key = ?")
        .bind(META_KEY_ACCOUNT_USAGE_ROLLUP_REQUEST_DAY_COVERAGE_START)
        .execute(&proxy.key_store.pool)
        .await
        .expect("clear request day coverage marker");

    drop(proxy);

    let reopened = TavilyProxy::with_endpoint(Vec::<String>::new(), DEFAULT_UPSTREAM, &db_str)
        .await
        .expect("proxy reopened");
    let day_values = reopened
        .key_store
        .fetch_account_usage_rollup_values(
            &user.user_id,
            AccountUsageRollupMetricKind::RequestCount,
            AccountUsageRollupBucketKind::Day,
            historical_day_bucket_start,
            historical_day_bucket_start + SECS_PER_DAY,
        )
        .await
        .expect("load rebuilt request day bucket after startup");
    assert_eq!(day_values.get(&historical_day_bucket_start), Some(&1));

    let _ = std::fs::remove_file(db_path);
}

#[tokio::test]
async fn account_usage_rollup_active90d_counts_exact_server_local_day_window() {
    let (backend_time, manual_clock) = crate::BackendTime::manual_from_ts(1_700_000_000);
    let db_path = temp_db_path("account-usage-rollup-active90d-local-day-window");
    let db_str = db_path.to_string_lossy().to_string();
    let proxy = TavilyProxy::with_options_and_time(
        Vec::<String>::new(),
        DEFAULT_UPSTREAM,
        &db_str,
        TavilyProxyOptions::from_database_path(&db_str),
        backend_time,
    )
    .await
    .expect("proxy created");

    let included_user = proxy
        .upsert_oauth_account(&OAuthAccountProfile {
            provider: "github".to_string(),
            provider_user_id: "active90d-included".to_string(),
            username: Some("active90d_included".to_string()),
            name: Some("Active90d Included".to_string()),
            avatar_template: None,
            active: true,
            trust_level: None,
            raw_payload_json: None,
        })
        .await
        .expect("upsert included user");
    let excluded_user = proxy
        .upsert_oauth_account(&OAuthAccountProfile {
            provider: "github".to_string(),
            provider_user_id: "active90d-excluded".to_string(),
            username: Some("active90d_excluded".to_string()),
            name: Some("Active90d Excluded".to_string()),
            avatar_template: None,
            active: true,
            trust_level: None,
            raw_payload_json: None,
        })
        .await
        .expect("upsert excluded user");
    let included_token = proxy
        .ensure_user_token_binding(&included_user.user_id, Some("active90d-included"))
        .await
        .expect("bind included token");
    let excluded_token = proxy
        .ensure_user_token_binding(&excluded_user.user_id, Some("active90d-excluded"))
        .await
        .expect("bind excluded token");

    let request_kind = TokenRequestKind::new("api:search", "API | search", None);
    let current_local_day_start = local_day_bucket_start_utc_ts(manual_clock.now_ts());
    let included_bucket_start = shift_local_day_start_utc_ts(
        current_local_day_start,
        -(ADMIN_ACTIVE_USERS_WINDOW_DAYS as i32 - 1),
    );
    let excluded_bucket_start = shift_local_day_start_utc_ts(included_bucket_start, -1);

    manual_clock.set_now_ts(included_bucket_start + 60);
    proxy
        .record_token_attempt_with_kind_request_log_metadata(
            &included_token.id,
            &Method::POST,
            "/api/tavily/search",
            Some("q=in-window"),
            Some(200),
            Some(200),
            true,
            OUTCOME_SUCCESS,
            None,
            &request_kind,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
        )
        .await
        .expect("record included request");

    manual_clock.set_now_ts(excluded_bucket_start + 60);
    proxy
        .record_token_attempt_with_kind_request_log_metadata(
            &excluded_token.id,
            &Method::POST,
            "/api/tavily/search",
            Some("q=out-of-window"),
            Some(200),
            Some(200),
            true,
            OUTCOME_SUCCESS,
            None,
            &request_kind,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
        )
        .await
        .expect("record excluded request");

    manual_clock.set_now_ts(current_local_day_start + 15 * SECS_PER_HOUR);
    let active_users = proxy
        .key_store
        .count_active_users_since_bucket(included_bucket_start)
        .await
        .expect("count active users");
    assert_eq!(active_users, 1);

    let included_values = proxy
        .key_store
        .fetch_account_usage_rollup_values(
            &included_user.user_id,
            AccountUsageRollupMetricKind::RequestCount,
            AccountUsageRollupBucketKind::Day,
            included_bucket_start,
            next_local_day_start_utc_ts(included_bucket_start),
        )
        .await
        .expect("load included day bucket");
    assert_eq!(included_values.get(&included_bucket_start), Some(&1));

    let excluded_values = proxy
        .key_store
        .fetch_account_usage_rollup_values(
            &excluded_user.user_id,
            AccountUsageRollupMetricKind::RequestCount,
            AccountUsageRollupBucketKind::Day,
            excluded_bucket_start,
            next_local_day_start_utc_ts(excluded_bucket_start),
        )
        .await
        .expect("load excluded day bucket");
    assert_eq!(excluded_values.get(&excluded_bucket_start), Some(&1));

    let _ = std::fs::remove_file(db_path);
}

#[tokio::test]
async fn account_usage_rollup_rebuild_preserves_existing_request_day_buckets_beyond_token_log_retention()
 {
    let db_path = temp_db_path("account-usage-rollup-preserve-request-day-beyond-token-retention");
    let db_str = db_path.to_string_lossy().to_string();
    let proxy = TavilyProxy::with_endpoint(Vec::<String>::new(), DEFAULT_UPSTREAM, &db_str)
        .await
        .expect("proxy created");

    let user = proxy
        .upsert_oauth_account(&OAuthAccountProfile {
            provider: "github".to_string(),
            provider_user_id: "preserve-day-rollup-user".to_string(),
            username: Some("preserve_day_rollup".to_string()),
            name: Some("Preserve Day Rollup".to_string()),
            avatar_template: None,
            active: true,
            trust_level: None,
            raw_payload_json: None,
        })
        .await
        .expect("upsert user");
    let token = proxy
        .ensure_user_token_binding(&user.user_id, Some("preserve-day-rollup"))
        .await
        .expect("bind token");

    let historical_created_at = Utc::now().timestamp().saturating_sub(60 * SECS_PER_DAY);
    let historical_day_bucket_start = local_day_bucket_start_utc_ts(historical_created_at);
    sqlx::query(
        r#"
        INSERT INTO account_usage_rollup_buckets (user_id, metric_kind, bucket_kind, bucket_start, value, updated_at)
        VALUES (?, ?, ?, ?, 1, ?)
        ON CONFLICT(user_id, metric_kind, bucket_kind, bucket_start)
        DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
        "#,
    )
    .bind(&user.user_id)
    .bind(AccountUsageRollupMetricKind::RequestCount.as_str())
    .bind(AccountUsageRollupBucketKind::Day.as_str())
    .bind(historical_day_bucket_start)
    .bind(Utc::now().timestamp())
    .execute(&proxy.key_store.pool)
    .await
    .expect("seed historical request day bucket");
    sqlx::query(
        r#"
        INSERT INTO auth_token_logs (
            token_id,
            method,
            path,
            query,
            http_status,
            mcp_status,
            request_kind_key,
            request_kind_label,
            result_status,
            key_effect_code,
            binding_effect_code,
            selection_effect_code,
            counts_business_quota,
            billing_state,
            request_user_id,
            created_at
        ) VALUES (?, 'POST', '/api/tavily/search', NULL, 200, 200, 'api:search', 'API | search', 'success', 'none', 'none', 'none', 1, 'none', ?, ?)
        "#,
    )
    .bind(&token.id)
    .bind(&user.user_id)
    .bind(historical_created_at)
    .execute(&proxy.key_store.pool)
    .await
    .expect("insert historical auth token log");
    proxy
        .key_store
        .set_meta_i64(META_KEY_AUTH_TOKEN_LOG_RETENTION_DAYS_V1, 14)
        .await
        .expect("set shorter auth token retention");
    let previous_coverage_start = proxy
        .key_store
        .get_meta_i64(META_KEY_ACCOUNT_USAGE_ROLLUP_REQUEST_DAY_COVERAGE_START)
        .await
        .expect("load previous request day coverage start")
        .expect("previous request day coverage start");

    proxy
        .key_store
        .rebuild_account_usage_rollup_buckets_v1()
        .await
        .expect("rebuild account usage rollups");

    let day_values = proxy
        .key_store
        .fetch_account_usage_rollup_values(
            &user.user_id,
            AccountUsageRollupMetricKind::RequestCount,
            AccountUsageRollupBucketKind::Day,
            historical_day_bucket_start,
            historical_day_bucket_start + SECS_PER_DAY,
        )
        .await
        .expect("load preserved request day bucket");
    assert_eq!(day_values.get(&historical_day_bucket_start), Some(&1));

    let coverage_start = proxy
        .key_store
        .get_meta_i64(META_KEY_ACCOUNT_USAGE_ROLLUP_REQUEST_DAY_COVERAGE_START)
        .await
        .expect("load request day coverage start")
        .expect("request day coverage start");
    assert_eq!(coverage_start, previous_coverage_start);

    let _ = std::fs::remove_file(db_path);
}
