impl KeyStore {
    async fn request_stats_last_flushed_at(&self) -> Result<Option<i64>, ProxyError> {
        self.get_meta_i64(META_KEY_REQUEST_STATS_LAST_FLUSHED_AT_V1).await
    }

    async fn flush_request_stats_writes_if_public_metrics_stale(
        &self,
        day_start: i64,
        day_end: i64,
    ) -> Result<(), ProxyError> {
        let Some(oldest_pending_created_at) =
            self.request_stats_coalescer.pending_oldest_created_at().await
        else {
            return Ok(());
        };
        let newest_pending_created_at = self
            .request_stats_coalescer
            .pending_newest_created_at()
            .await
            .unwrap_or(oldest_pending_created_at);

        if newest_pending_created_at >= day_end {
            return Ok(());
        }

        let last_flushed_at = self.request_stats_last_flushed_at().await?.unwrap_or_default();
        let has_window_pending = newest_pending_created_at >= day_start;
        let needs_flush = if has_window_pending {
            last_flushed_at < newest_pending_created_at
        } else {
            !(last_flushed_at >= oldest_pending_created_at && last_flushed_at >= day_start)
        };
        if needs_flush {
            self.flush_request_stats_writes().await?;
        }
        Ok(())
    }
}
