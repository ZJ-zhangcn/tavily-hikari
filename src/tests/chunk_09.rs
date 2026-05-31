async fn hold_sqlite_write_lock_for_test(
    pool: &SqlitePool,
) -> tokio::task::JoinHandle<()> {
    let mut immediate_conn = begin_immediate_sqlite_connection(pool)
        .await
        .expect("begin immediate transaction");
    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_millis(5_200)).await;
        sqlx::query("ROLLBACK")
            .execute(&mut *immediate_conn)
            .await
            .expect("rollback immediate transaction");
    })
}

#[tokio::test]
async fn quota_subject_lock_retries_transient_sqlite_write_lock() {
    let db_path = temp_db_path("quota-subject-lock-retries-sqlite-lock");
    let db_str = db_path.to_string_lossy().to_string();
    let proxy = TavilyProxy::with_endpoint(Vec::<String>::new(), DEFAULT_UPSTREAM, &db_str)
        .await
        .expect("proxy created");
    let release = hold_sqlite_write_lock_for_test(&proxy.key_store.pool).await;

    let lease = proxy
        .key_store
        .acquire_quota_subject_lock(
            "test:quota-subject-lock-retry",
            Duration::from_secs(20),
            Duration::from_secs(30),
        )
        .await
        .expect("acquire lock after transient sqlite write lock");
    assert_eq!(lease.subject, "test:quota-subject-lock-retry");
    proxy
        .key_store
        .release_quota_subject_lock(&lease)
        .await
        .expect("release lock");
    release.await.expect("release task");

    let _ = std::fs::remove_file(&db_path);
    let _ = std::fs::remove_file(db_path.with_extension("db-shm"));
    let _ = std::fs::remove_file(db_path.with_extension("db-wal"));
}

#[tokio::test]
async fn scheduled_job_start_retries_transient_sqlite_write_lock() {
    let db_path = temp_db_path("scheduled-job-start-retries-sqlite-lock");
    let db_str = db_path.to_string_lossy().to_string();
    let proxy = TavilyProxy::with_endpoint(Vec::<String>::new(), DEFAULT_UPSTREAM, &db_str)
        .await
        .expect("proxy created");
    let release = hold_sqlite_write_lock_for_test(&proxy.key_store.pool).await;

    let job_id = proxy
        .scheduled_job_start("sqlite_lock_retry_test", None, 1)
        .await
        .expect("scheduled job starts after transient sqlite write lock");
    assert!(job_id > 0);
    release.await.expect("release task");

    let _ = std::fs::remove_file(&db_path);
    let _ = std::fs::remove_file(db_path.with_extension("db-shm"));
    let _ = std::fs::remove_file(db_path.with_extension("db-wal"));
}

#[tokio::test]
async fn startup_skips_linuxdo_tag_backfill_after_marker() {
    let _guard = env_lock().lock_owned().await;
    let db_path = temp_db_path("linuxdo-system-tags-backfill-marker");
    let db_str = db_path.to_string_lossy().to_string();

    let proxy = TavilyProxy::with_endpoint(Vec::<String>::new(), DEFAULT_UPSTREAM, &db_str)
        .await
        .expect("proxy created");
    let user = proxy
        .upsert_oauth_account(&OAuthAccountProfile {
            provider: "linuxdo".to_string(),
            provider_user_id: "linuxdo-backfill-marker-user".to_string(),
            username: Some("linuxdo_backfill_marker_user".to_string()),
            name: Some("LinuxDo Backfill Marker User".to_string()),
            avatar_template: None,
            active: true,
            trust_level: Some(2),
            raw_payload_json: None,
        })
        .await
        .expect("upsert linuxdo user");
    let binding_updated_at_before: i64 = sqlx::query_scalar(
        r#"SELECT b.updated_at
           FROM user_tag_bindings b
           JOIN user_tags t ON t.id = b.tag_id
           WHERE b.user_id = ? AND t.system_key = 'linuxdo_l2'
           LIMIT 1"#,
    )
    .bind(&user.user_id)
    .fetch_one(&proxy.key_store.pool)
    .await
    .expect("read binding timestamp before restart");
    let snapshot_count_before: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM account_quota_limit_snapshots WHERE user_id = ?",
    )
    .bind(&user.user_id)
    .fetch_one(&proxy.key_store.pool)
    .await
    .expect("read snapshot count before restart");
    drop(proxy);

    let proxy_after = TavilyProxy::with_endpoint(Vec::<String>::new(), DEFAULT_UPSTREAM, &db_str)
        .await
        .expect("proxy reopened");
    let binding_updated_at_after: i64 = sqlx::query_scalar(
        r#"SELECT b.updated_at
           FROM user_tag_bindings b
           JOIN user_tags t ON t.id = b.tag_id
           WHERE b.user_id = ? AND t.system_key = 'linuxdo_l2'
           LIMIT 1"#,
    )
    .bind(&user.user_id)
    .fetch_one(&proxy_after.key_store.pool)
    .await
    .expect("read binding timestamp after restart");
    let snapshot_count_after: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM account_quota_limit_snapshots WHERE user_id = ?",
    )
    .bind(&user.user_id)
    .fetch_one(&proxy_after.key_store.pool)
    .await
    .expect("read snapshot count after restart");
    assert_eq!(binding_updated_at_after, binding_updated_at_before);
    assert_eq!(snapshot_count_after, snapshot_count_before);

    let _ = std::fs::remove_file(db_path);
}
