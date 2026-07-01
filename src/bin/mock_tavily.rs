use std::{
    collections::HashMap,
    net::SocketAddr,
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
};

use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::{HeaderMap, HeaderName, HeaderValue, Response, StatusCode, header::AUTHORIZATION},
    response::IntoResponse,
    routing::{get, patch, post},
};
use clap::Parser;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};
use tokio::sync::RwLock;

#[derive(Parser, Debug)]
struct Cli {
    /// Address to bind the mock Tavily server.
    #[arg(long, default_value = "127.0.0.1:58088")]
    bind: SocketAddr,

    /// Comma-separated upstream keys to pre-seed in the mock state.
    #[arg(long, env = "MOCK_TAVILY_PRESEEDED_KEYS", value_delimiter = ',')]
    preseeded_keys: Vec<String>,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
struct KeyRecord {
    limit: i64,
    remaining: i64,
    usage: i64,
    #[serde(default)]
    research_usage: i64,
}

impl KeyRecord {
    fn new(limit: i64, remaining: i64) -> Self {
        let clamped_limit = limit.max(0);
        let clamped_remaining = remaining.max(0).min(clamped_limit);
        Self {
            limit: clamped_limit,
            remaining: clamped_remaining,
            usage: clamped_limit.saturating_sub(clamped_remaining),
            research_usage: 0,
        }
    }
}

#[derive(Clone, Serialize, Deserialize, Debug, Default)]
struct ForcedResponse {
    #[serde(default)]
    http_status: Option<u16>,
    #[serde(default)]
    structured_status: Option<i64>,
    #[serde(default)]
    body: Option<Value>,
    #[serde(default)]
    once: bool,
    #[serde(default)]
    delay_ms: Option<u64>,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
struct ResearchRecord {
    request_id: String,
    key_secret: String,
    created_key_secret: String,
    created_at: i64,
    updated_at: i64,
    #[serde(default)]
    query: Option<String>,
    #[serde(default)]
    topic: Option<String>,
    #[serde(default)]
    payload: Value,
    fetch_count: i64,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
struct McpSessionRecord {
    upstream_session_id: String,
    key_secret: String,
    created_at: i64,
    updated_at: i64,
    request_count: i64,
    #[serde(default)]
    last_protocol_version: Option<String>,
    #[serde(default)]
    last_method: Option<String>,
}

#[derive(Default, Clone, Serialize)]
struct SnapshotState {
    keys: HashMap<String, KeyRecord>,
    forced: Option<ForcedResponse>,
    research_requests: HashMap<String, ResearchRecord>,
    mcp_sessions: HashMap<String, McpSessionRecord>,
}

#[derive(Default)]
struct AppState {
    inner: RwLock<SnapshotState>,
    session_counter: AtomicU64,
    research_counter: AtomicU64,
}

#[derive(Deserialize)]
struct AddKeyRequest {
    secret: String,
    #[serde(default = "default_limit")]
    limit: i64,
    #[serde(default)]
    remaining: Option<i64>,
}

#[derive(Deserialize)]
struct UpdateKeyRequest {
    #[serde(default)]
    limit: Option<i64>,
    #[serde(default)]
    remaining: Option<i64>,
}

#[derive(Deserialize)]
struct ForceRequest {
    #[serde(default)]
    http_status: Option<u16>,
    #[serde(default)]
    structured_status: Option<i64>,
    #[serde(default)]
    body: Option<Value>,
    #[serde(default)]
    once: bool,
    #[serde(default)]
    delay_ms: Option<u64>,
}

#[derive(Deserialize)]
struct McpQuery {
    #[serde(rename = "tavilyApiKey")]
    key: Option<String>,
    status: Option<i64>,
}

#[derive(Clone, Copy)]
enum HttpEndpoint {
    Search,
    Extract,
    Crawl,
    Map,
}

impl HttpEndpoint {
    fn request_id(self) -> &'static str {
        match self {
            Self::Search => "mock-search-req",
            Self::Extract => "mock-extract-req",
            Self::Crawl => "mock-crawl-req",
            Self::Map => "mock-map-req",
        }
    }
}

fn default_limit() -> i64 {
    1_000
}

fn now_ts() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or(0)
}

fn json_response(status: StatusCode, value: Value) -> Response<axum::body::Body> {
    (status, Json(value)).into_response()
}

fn json_response_with_headers(
    status: StatusCode,
    headers: &[(&str, String)],
    value: Value,
) -> Response<axum::body::Body> {
    let mut response = json_response(status, value);
    for (name, value) in headers {
        if let (Ok(name), Ok(value)) = (
            HeaderName::from_bytes(name.as_bytes()),
            HeaderValue::from_str(value),
        ) {
            response.headers_mut().insert(name, value);
        }
    }
    response
}

fn find_bearer_secret(headers: &HeaderMap) -> Option<String> {
    headers
        .get(AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .and_then(|value| {
            value
                .strip_prefix("Bearer ")
                .or_else(|| value.strip_prefix("bearer "))
        })
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn mcp_session_header(headers: &HeaderMap) -> Option<String> {
    headers
        .get("mcp-session-id")
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn protocol_version_header(headers: &HeaderMap) -> Option<String> {
    headers
        .get("mcp-protocol-version")
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn extract_mcp_method(body: Option<&Value>) -> Option<String> {
    body.and_then(|request| request.get("method"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn build_mcp_structured_response(request_body: Option<&Value>, structured_content: Value) -> Value {
    let mut response = Map::new();
    if let Some(request_body) = request_body {
        if let Some(jsonrpc) = request_body.get("jsonrpc") {
            response.insert("jsonrpc".into(), jsonrpc.clone());
        }
        if let Some(id) = request_body.get("id") {
            response.insert("id".into(), id.clone());
        }
    }
    response.insert(
        "result".into(),
        json!({
            "content": [{ "type": "text", "text": "mock mcp ok" }],
            "structuredContent": structured_content
        }),
    );
    Value::Object(response)
}

fn quota_response(
    request_body: Option<&Value>,
    reason: &str,
    status: i64,
) -> Response<axum::body::Body> {
    json_response(
        StatusCode::OK,
        build_mcp_structured_response(
            request_body,
            json!({
                "status": status,
                "error": reason
            }),
        ),
    )
}

fn extract_http_api_key(body: &Value, headers: &HeaderMap) -> Option<String> {
    body.get("api_key")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .or_else(|| find_bearer_secret(headers))
}

fn forced_http_body(endpoint: HttpEndpoint, body: &Value, structured_status: i64) -> Value {
    match endpoint {
        HttpEndpoint::Search => json!({
            "query": body.get("query").and_then(Value::as_str).unwrap_or(""),
            "results": [],
            "answer": null,
            "images": [],
            "response_time": 0.01,
            "status": structured_status,
            "request_id": "forced-search",
            "usage": { "credits": 1 }
        }),
        HttpEndpoint::Extract => json!({
            "results": [],
            "failed_results": [],
            "response_time": 0.01,
            "status": structured_status,
            "request_id": "forced-extract",
            "usage": { "credits": 1 }
        }),
        HttpEndpoint::Crawl => json!({
            "base_url": body.get("url").and_then(Value::as_str).unwrap_or(""),
            "results": [],
            "response_time": 0.01,
            "status": structured_status,
            "request_id": "forced-crawl",
            "usage": { "credits": 1 }
        }),
        HttpEndpoint::Map => json!({
            "base_url": body.get("url").and_then(Value::as_str).unwrap_or(""),
            "results": [],
            "response_time": 0.01,
            "status": structured_status,
            "request_id": "forced-map",
            "usage": { "credits": 1 }
        }),
    }
}

fn build_http_success_body(
    endpoint: HttpEndpoint,
    body: &Value,
    key_secret: &str,
    remaining: i64,
    usage: i64,
) -> Value {
    match endpoint {
        HttpEndpoint::Search => {
            let query = body.get("query").and_then(Value::as_str).unwrap_or("");
            let results = vec![json!({
                "url": "https://example.com/search",
                "title": "Example Search Result",
                "content": "Example content",
                "raw_content": "Example raw content",
                "score": 0.99,
                "published_date": null,
                "favicon": null
            })];
            json!({
                "query": query,
                "results": results,
                "answer": null,
                "images": [],
                "response_time": 0.01,
                "status": 200,
                "request_id": endpoint.request_id(),
                "remaining_requests": remaining,
                "usage": { "credits": 1 },
                "mock_bound_key": key_secret,
                "mock_usage": usage
            })
        }
        HttpEndpoint::Extract => {
            let urls = body
                .get("urls")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_else(|| vec![Value::String("https://example.com".to_string())]);
            let results: Vec<Value> = urls
                .into_iter()
                .map(|url| {
                    let url_str = url.as_str().unwrap_or("https://example.com");
                    json!({
                        "url": url_str,
                        "raw_content": "mock extracted content",
                        "images": [],
                        "favicon": null
                    })
                })
                .collect();
            json!({
                "results": results,
                "failed_results": [],
                "response_time": 0.02,
                "status": 200,
                "request_id": endpoint.request_id(),
                "remaining_requests": remaining,
                "usage": { "credits": 1 },
                "mock_bound_key": key_secret,
                "mock_usage": usage
            })
        }
        HttpEndpoint::Crawl => {
            let url = body
                .get("url")
                .and_then(Value::as_str)
                .unwrap_or("https://example.com");
            json!({
                "base_url": url,
                "results": [{
                    "url": url,
                    "raw_content": "mock crawled content",
                    "images": [],
                    "favicon": null
                }],
                "response_time": 0.03,
                "status": 200,
                "request_id": endpoint.request_id(),
                "remaining_requests": remaining,
                "usage": { "credits": 1 },
                "mock_bound_key": key_secret,
                "mock_usage": usage
            })
        }
        HttpEndpoint::Map => {
            let url = body
                .get("url")
                .and_then(Value::as_str)
                .unwrap_or("https://example.com");
            json!({
                "base_url": url,
                "results": [{
                    "url": url,
                    "links": []
                }],
                "response_time": 0.01,
                "status": 200,
                "request_id": endpoint.request_id(),
                "remaining_requests": remaining,
                "usage": { "credits": 1 },
                "mock_bound_key": key_secret,
                "mock_usage": usage
            })
        }
    }
}

async fn pop_forced_response(state: &AppState) -> Option<ForcedResponse> {
    let mut guard = state.inner.write().await;
    let forced = guard.forced.clone();
    if guard.forced.as_ref().is_some_and(|force| force.once) {
        guard.forced = None;
    }
    forced
}

async fn maybe_apply_forced_http(
    state: &AppState,
    endpoint: HttpEndpoint,
    body: &Value,
) -> Option<Response<axum::body::Body>> {
    let forced = pop_forced_response(state).await?;
    if let Some(delay) = forced.delay_ms {
        tokio::time::sleep(std::time::Duration::from_millis(delay)).await;
    }
    if let Some(status) = forced.http_status {
        let body = forced
            .body
            .unwrap_or_else(|| json!({ "error": format!("forced status {status}") }));
        return Some(json_response(
            StatusCode::from_u16(status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR),
            body,
        ));
    }
    if let Some(custom) = forced.body {
        return Some(json_response(StatusCode::OK, custom));
    }
    let structured_status = forced.structured_status.unwrap_or(200);
    Some(json_response(
        StatusCode::OK,
        forced_http_body(endpoint, body, structured_status),
    ))
}

async fn maybe_apply_forced_mcp(
    state: &AppState,
    request_body: Option<&Value>,
) -> Option<Response<axum::body::Body>> {
    let forced = pop_forced_response(state).await?;
    if let Some(delay) = forced.delay_ms {
        tokio::time::sleep(std::time::Duration::from_millis(delay)).await;
    }
    if let Some(status) = forced.http_status {
        let body = forced
            .body
            .unwrap_or_else(|| json!({ "error": format!("forced status {status}") }));
        return Some(json_response(
            StatusCode::from_u16(status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR),
            body,
        ));
    }
    if let Some(custom) = forced.body {
        return Some(json_response(StatusCode::OK, custom));
    }
    let structured_status = forced.structured_status.unwrap_or(200);
    Some(json_response(
        StatusCode::OK,
        build_mcp_structured_response(
            request_body,
            json!({
                "status": structured_status,
                "forced": true,
                "usage": { "credits": 1 }
            }),
        ),
    ))
}

async fn add_key(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<AddKeyRequest>,
) -> Response<axum::body::Body> {
    let remaining = payload.remaining.unwrap_or(payload.limit);
    let mut guard = state.inner.write().await;
    let record = KeyRecord::new(payload.limit, remaining);
    guard.keys.insert(payload.secret.clone(), record.clone());
    json_response(
        StatusCode::CREATED,
        json!({
            "secret": payload.secret,
            "limit": record.limit,
            "remaining": record.remaining,
            "usage": record.usage,
            "research_usage": record.research_usage
        }),
    )
}

async fn update_key(
    State(state): State<Arc<AppState>>,
    Path(secret): Path<String>,
    Json(payload): Json<UpdateKeyRequest>,
) -> Response<axum::body::Body> {
    let mut guard = state.inner.write().await;
    let Some(entry) = guard.keys.get_mut(&secret) else {
        return json_response(StatusCode::NOT_FOUND, json!({ "error": "unknown key" }));
    };
    if let Some(limit) = payload.limit {
        entry.limit = limit.max(0);
    }
    if let Some(remaining) = payload.remaining {
        entry.remaining = remaining.max(0).min(entry.limit);
    }
    entry.usage = entry.limit.saturating_sub(entry.remaining);
    json_response(
        StatusCode::OK,
        json!({
            "secret": secret,
            "limit": entry.limit,
            "remaining": entry.remaining,
            "usage": entry.usage,
            "research_usage": entry.research_usage
        }),
    )
}

async fn delete_key(
    State(state): State<Arc<AppState>>,
    Path(secret): Path<String>,
) -> Response<axum::body::Body> {
    let mut guard = state.inner.write().await;
    if guard.keys.remove(&secret).is_some() {
        json_response(StatusCode::NO_CONTENT, json!({}))
    } else {
        json_response(StatusCode::NOT_FOUND, json!({ "error": "unknown key" }))
    }
}

async fn list_keys(State(state): State<Arc<AppState>>) -> Response<axum::body::Body> {
    let guard = state.inner.read().await;
    let mut keys: Vec<Value> = guard
        .keys
        .iter()
        .map(|(secret, record)| {
            json!({
                "secret": secret,
                "limit": record.limit,
                "remaining": record.remaining,
                "usage": record.usage,
                "research_usage": record.research_usage
            })
        })
        .collect();
    keys.sort_by(|left, right| {
        left.get("secret")
            .and_then(Value::as_str)
            .cmp(&right.get("secret").and_then(Value::as_str))
    });
    json_response(
        StatusCode::OK,
        json!({
            "keys": keys,
            "forced": guard.forced
        }),
    )
}

async fn set_forced_response(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<ForceRequest>,
) -> Response<axum::body::Body> {
    if payload.http_status.is_none()
        && payload.structured_status.is_none()
        && payload.body.is_none()
    {
        return json_response(
            StatusCode::BAD_REQUEST,
            json!({ "error": "One of http_status, structured_status, or body is required" }),
        );
    }
    let mut guard = state.inner.write().await;
    guard.forced = Some(ForcedResponse {
        http_status: payload.http_status,
        structured_status: payload.structured_status,
        body: payload.body,
        once: payload.once,
        delay_ms: payload.delay_ms,
    });
    json_response(StatusCode::OK, json!({ "forced": guard.forced }))
}

async fn clear_forced_response(State(state): State<Arc<AppState>>) -> Response<axum::body::Body> {
    let mut guard = state.inner.write().await;
    guard.forced = None;
    json_response(StatusCode::NO_CONTENT, json!({}))
}

async fn read_state(State(state): State<Arc<AppState>>) -> Response<axum::body::Body> {
    let guard = state.inner.read().await;
    json_response(
        StatusCode::OK,
        json!({
            "keys": guard.keys,
            "forced": guard.forced,
            "researchRequests": guard.research_requests,
            "mcpSessions": guard.mcp_sessions
        }),
    )
}

async fn handle_usage(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Response<axum::body::Body> {
    let Some(secret) = find_bearer_secret(&headers) else {
        return json_response(
            StatusCode::UNAUTHORIZED,
            json!({ "error": "missing bearer key" }),
        );
    };
    let guard = state.inner.read().await;
    let Some(record) = guard.keys.get(&secret) else {
        return json_response(StatusCode::UNAUTHORIZED, json!({ "error": "invalid key" }));
    };
    json_response(
        StatusCode::OK,
        json!({
            "key": {
                "limit": record.limit,
                "usage": record.usage,
                "research_usage": record.research_usage
            },
            "account": {
                "plan_limit": record.limit,
                "plan_usage": record.usage
            }
        }),
    )
}

async fn handle_http_json(
    State(state): State<Arc<AppState>>,
    endpoint: HttpEndpoint,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Response<axum::body::Body> {
    if let Some(response) = maybe_apply_forced_http(&state, endpoint, &body).await {
        return response;
    }

    let Some(key) = extract_http_api_key(&body, &headers) else {
        return json_response(
            StatusCode::UNAUTHORIZED,
            json!({ "error": "missing api_key" }),
        );
    };

    let mut guard = state.inner.write().await;
    let Some(entry) = guard.keys.get_mut(&key) else {
        return json_response(StatusCode::UNAUTHORIZED, json!({ "error": "invalid key" }));
    };
    if entry.remaining <= 0 {
        return json_response(
            StatusCode::OK,
            json!({
                "status": 432,
                "error": "quota_exhausted",
                "usage": { "credits": 1 }
            }),
        );
    }
    entry.remaining -= 1;
    entry.usage = entry.usage.saturating_add(1);
    let response = build_http_success_body(endpoint, &body, &key, entry.remaining, entry.usage);
    json_response(StatusCode::OK, response)
}

async fn handle_http_search(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Response<axum::body::Body> {
    handle_http_json(State(state), HttpEndpoint::Search, headers, Json(body)).await
}

async fn handle_http_extract(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Response<axum::body::Body> {
    handle_http_json(State(state), HttpEndpoint::Extract, headers, Json(body)).await
}

async fn handle_http_crawl(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Response<axum::body::Body> {
    handle_http_json(State(state), HttpEndpoint::Crawl, headers, Json(body)).await
}

async fn handle_http_map(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Response<axum::body::Body> {
    handle_http_json(State(state), HttpEndpoint::Map, headers, Json(body)).await
}

async fn handle_research_create(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Response<axum::body::Body> {
    let Some(key) = extract_http_api_key(&body, &headers) else {
        return json_response(
            StatusCode::UNAUTHORIZED,
            json!({ "error": "missing api_key" }),
        );
    };
    let mut guard = state.inner.write().await;
    let Some(entry) = guard.keys.get_mut(&key) else {
        return json_response(StatusCode::UNAUTHORIZED, json!({ "error": "invalid key" }));
    };
    if entry.remaining <= 0 {
        return json_response(
            StatusCode::OK,
            json!({
                "status": 432,
                "error": "quota_exhausted"
            }),
        );
    }
    entry.remaining -= 1;
    entry.usage = entry.usage.saturating_add(1);
    entry.research_usage = entry.research_usage.saturating_add(1);

    let request_id = format!(
        "mock-research-{}",
        state.research_counter.fetch_add(1, Ordering::Relaxed) + 1
    );
    let now = now_ts();
    let record = ResearchRecord {
        request_id: request_id.clone(),
        key_secret: key.clone(),
        created_key_secret: key.clone(),
        created_at: now,
        updated_at: now,
        query: body
            .get("query")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned),
        topic: body
            .get("topic")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned),
        payload: body.clone(),
        fetch_count: 0,
    };
    guard
        .research_requests
        .insert(request_id.clone(), record.clone());
    json_response(
        StatusCode::OK,
        json!({
            "request_id": request_id,
            "status": "queued",
            "mock_bound_key": key,
            "mock_created_key": record.created_key_secret,
            "query": record.query,
            "topic": record.topic
        }),
    )
}

async fn handle_research_get(
    State(state): State<Arc<AppState>>,
    Path(request_id): Path<String>,
    headers: HeaderMap,
) -> Response<axum::body::Body> {
    let Some(key) = find_bearer_secret(&headers) else {
        return json_response(
            StatusCode::UNAUTHORIZED,
            json!({ "error": "missing bearer key" }),
        );
    };
    let mut guard = state.inner.write().await;
    if !guard.keys.contains_key(&key) {
        return json_response(StatusCode::UNAUTHORIZED, json!({ "error": "invalid key" }));
    }
    let Some(record) = guard.research_requests.get_mut(&request_id) else {
        return json_response(
            StatusCode::NOT_FOUND,
            json!({ "error": "research_not_found" }),
        );
    };
    record.key_secret = key.clone();
    record.updated_at = now_ts();
    record.fetch_count = record.fetch_count.saturating_add(1);
    json_response(
        StatusCode::OK,
        json!({
            "request_id": record.request_id,
            "status": "success",
            "answer": format!("mock research result for {}", record.query.as_deref().unwrap_or("unknown")),
            "results": [{
                "title": "Mock Research Result",
                "url": "https://example.test/research",
                "content": "mock research content"
            }],
            "usage": { "credits": 0 },
            "mock_bound_key": record.key_secret,
            "mock_created_key": record.created_key_secret,
            "mock_fetch_key": key,
            "mock_fetch_count": record.fetch_count,
            "mock_payload": record.payload
        }),
    )
}

async fn handle_mcp(
    State(state): State<Arc<AppState>>,
    Query(query): Query<McpQuery>,
    headers: HeaderMap,
    body: Option<Json<Value>>,
) -> Response<axum::body::Body> {
    let request_body = body.as_ref().map(|Json(value)| value);
    if let Some(response) = maybe_apply_forced_mcp(&state, request_body).await {
        return response;
    }

    let key = query
        .key
        .or_else(|| {
            headers
                .get("tavily-api-key")
                .and_then(|value| value.to_str().ok())
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(ToOwned::to_owned)
        })
        .or_else(|| find_bearer_secret(&headers));
    let Some(key) = key else {
        return json_response(
            StatusCode::UNAUTHORIZED,
            json!({ "error": "missing tavilyApiKey" }),
        );
    };

    let mut guard = state.inner.write().await;
    let Some(entry) = guard.keys.get_mut(&key) else {
        return json_response(StatusCode::UNAUTHORIZED, json!({ "error": "invalid key" }));
    };
    if entry.remaining <= 0 {
        return quota_response(request_body, "quota_exhausted", 432);
    }
    entry.remaining -= 1;
    entry.usage = entry.usage.saturating_add(1);

    let protocol_version = protocol_version_header(&headers);
    let method = extract_mcp_method(request_body);
    let upstream_session_id = if let Some(existing) = mcp_session_header(&headers) {
        let Some(record) = guard.mcp_sessions.get_mut(&existing) else {
            return json_response(
                StatusCode::NOT_FOUND,
                json!({ "error": "upstream_session_missing" }),
            );
        };
        if record.key_secret != key {
            return json_response(
                StatusCode::FORBIDDEN,
                json!({ "error": "session_key_mismatch" }),
            );
        }
        record.updated_at = now_ts();
        record.request_count = record.request_count.saturating_add(1);
        record.last_protocol_version = protocol_version.clone();
        record.last_method = method.clone();
        existing
    } else {
        let session_id = format!(
            "upstream-mock-session-{}",
            state.session_counter.fetch_add(1, Ordering::Relaxed) + 1
        );
        let now = now_ts();
        guard.mcp_sessions.insert(
            session_id.clone(),
            McpSessionRecord {
                upstream_session_id: session_id.clone(),
                key_secret: key.clone(),
                created_at: now,
                updated_at: now,
                request_count: 1,
                last_protocol_version: protocol_version.clone(),
                last_method: method.clone(),
            },
        );
        session_id
    };

    let session = guard
        .mcp_sessions
        .get(&upstream_session_id)
        .cloned()
        .expect("mcp session record must exist");
    let structured_status = query.status.unwrap_or(200);
    let payload = json!({
        "status": structured_status,
        "usage": { "credits": 1 },
        "mock_bound_key": key,
        "mock_upstream_session_id": session.upstream_session_id,
        "mock_request_count": session.request_count,
        "mock_method": session.last_method,
        "mock_protocol_version": session.last_protocol_version,
        "echo": request_body.cloned().unwrap_or_else(|| json!({}))
    });
    json_response_with_headers(
        StatusCode::OK,
        &[
            ("mcp-session-id", session.upstream_session_id),
            (
                "mcp-protocol-version",
                session
                    .last_protocol_version
                    .unwrap_or_else(|| "2025-03-26".to_string()),
            ),
        ],
        build_mcp_structured_response(request_body, payload),
    )
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let cli = Cli::parse();
    let state = Arc::new(AppState::default());
    if !cli.preseeded_keys.is_empty() {
        let mut guard = state.inner.write().await;
        for key in cli.preseeded_keys {
            let trimmed = key.trim();
            if trimmed.is_empty() {
                continue;
            }
            guard
                .keys
                .entry(trimmed.to_string())
                .or_insert_with(|| KeyRecord::new(default_limit(), default_limit()));
        }
    }
    let app = Router::new()
        .route("/mcp", post(handle_mcp).get(handle_mcp))
        .route("/mcp/*path", post(handle_mcp).get(handle_mcp))
        .route("/search", post(handle_http_search))
        .route("/extract", post(handle_http_extract))
        .route("/crawl", post(handle_http_crawl))
        .route("/map", post(handle_http_map))
        .route("/research", post(handle_research_create))
        .route("/research/:request_id", get(handle_research_get))
        .route("/usage", get(handle_usage))
        .route("/admin/keys", post(add_key).get(list_keys))
        .route("/admin/keys/:secret", patch(update_key).delete(delete_key))
        .route(
            "/admin/force-response",
            post(set_forced_response).delete(clear_forced_response),
        )
        .route("/admin/state", get(read_state))
        .with_state(state);

    println!("Mock Tavily upstream listening on http://{}", cli.bind);
    axum::serve(tokio::net::TcpListener::bind(cli.bind).await?, app).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::build_mcp_structured_response;
    use serde_json::json;

    #[test]
    fn build_mcp_structured_response_echoes_jsonrpc_and_id() {
        let request = json!({
            "jsonrpc": "2.0",
            "id": "release-smoke-search",
            "method": "tools/call"
        });

        let response = build_mcp_structured_response(
            Some(&request),
            json!({
                "status": 200,
                "forced": true
            }),
        );

        assert_eq!(response["jsonrpc"], json!("2.0"));
        assert_eq!(response["id"], json!("release-smoke-search"));
        assert_eq!(
            response["result"]["structuredContent"]["status"],
            json!(200)
        );
        assert_eq!(
            response["result"]["structuredContent"]["forced"],
            json!(true)
        );
    }

    #[test]
    fn build_mcp_structured_response_omits_jsonrpc_and_id_when_missing() {
        let response = build_mcp_structured_response(
            None,
            json!({
                "status": 432,
                "error": "quota_exhausted"
            }),
        );

        assert!(response.get("jsonrpc").is_none());
        assert!(response.get("id").is_none());
        assert_eq!(
            response["result"]["structuredContent"]["error"],
            json!("quota_exhausted")
        );
    }
}
