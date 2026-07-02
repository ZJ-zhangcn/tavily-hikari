use std::{net::SocketAddr, sync::Arc};

use axum::{
    Json, Router,
    extract::{Query, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    routing::{get, post},
};
use clap::Parser;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use tokio::sync::RwLock;

#[derive(Parser, Debug)]
struct Cli {
    /// Address to bind the mock EdgeOne server.
    #[arg(long, default_value = "127.0.0.1:59001")]
    bind: SocketAddr,

    /// Initial direct origin target, e.g. `node-a:8787`.
    #[arg(
        long,
        env = "EDGEONE_INITIAL_DIRECT_ORIGIN",
        default_value = "node-a:8787"
    )]
    initial_direct_origin: String,

    /// Initial origin-group id.
    #[arg(
        long,
        env = "EDGEONE_INITIAL_ORIGIN_GROUP_ID",
        default_value = "og-core"
    )]
    initial_origin_group_id: String,

    /// Initial source kind: `direct` or `origin_group`.
    #[arg(long, env = "EDGEONE_INITIAL_SOURCE_KIND", default_value = "direct")]
    initial_source_kind: String,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum SourceKind {
    Direct,
    OriginGroup,
}

impl SourceKind {
    fn parse(value: &str) -> Self {
        match value.trim().to_ascii_lowercase().as_str() {
            "origin_group" => Self::OriginGroup,
            _ => Self::Direct,
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::Direct => "direct",
            Self::OriginGroup => "origin_group",
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct StateSnapshot {
    current_source_kind: SourceKind,
    direct_origin: String,
    origin_group_id: String,
    #[serde(default)]
    origin_group_members: Vec<String>,
    origin_protocol: String,
    http_origin_port: u16,
    https_origin_port: u16,
    describe_request_count: u64,
    modify_request_count: u64,
}

struct AppState {
    inner: RwLock<StateSnapshot>,
}

#[derive(Deserialize)]
struct SetRouteQuery {
    #[serde(default)]
    origin: Option<String>,
    #[serde(default)]
    origin_group_id: Option<String>,
    #[serde(default)]
    kind: Option<String>,
}

#[derive(Deserialize)]
struct AdminRouteRequest {
    #[serde(default)]
    source_kind: Option<String>,
    #[serde(default)]
    direct_origin: Option<String>,
    #[serde(default)]
    origin_group_id: Option<String>,
    #[serde(default)]
    origin_group_members: Option<Vec<String>>,
    #[serde(default)]
    origin_protocol: Option<String>,
    #[serde(default)]
    http_origin_port: Option<u16>,
    #[serde(default)]
    https_origin_port: Option<u16>,
}

fn split_origin(origin: &str, fallback_port: u16) -> (String, u16) {
    if let Some((host, port)) = origin.rsplit_once(':')
        && let Ok(port) = port.parse::<u16>()
    {
        return (host.to_string(), port);
    }
    (origin.to_string(), fallback_port)
}

async fn read_origin(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let guard = state.inner.read().await;
    let origin = match guard.current_source_kind {
        SourceKind::Direct => guard.direct_origin.clone(),
        SourceKind::OriginGroup => guard.origin_group_id.clone(),
    };
    Json(json!({
        "sourceKind": guard.current_source_kind.as_str(),
        "origin": origin,
        "directOrigin": guard.direct_origin,
        "originGroupId": guard.origin_group_id,
        "originGroupMembers": guard.origin_group_members,
        "originProtocol": guard.origin_protocol,
        "httpOriginPort": guard.http_origin_port,
        "httpsOriginPort": guard.https_origin_port
    }))
}

async fn set_origin_query(
    State(state): State<Arc<AppState>>,
    Query(query): Query<SetRouteQuery>,
) -> impl IntoResponse {
    let mut guard = state.inner.write().await;
    if let Some(kind) = query.kind.as_deref() {
        guard.current_source_kind = SourceKind::parse(kind);
    }
    if let Some(origin) = query.origin {
        guard.direct_origin = origin;
        if guard.current_source_kind == SourceKind::Direct {
            let (_, port) = split_origin(&guard.direct_origin, guard.https_origin_port);
            guard.http_origin_port = port;
            guard.https_origin_port = port;
        }
    }
    if let Some(group) = query.origin_group_id {
        guard.origin_group_id = group;
    }
    Json(json!({
        "status": "ok",
        "state": &*guard
    }))
}

async fn admin_state(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let guard = state.inner.read().await;
    Json(json!({
        "state": &*guard
    }))
}

async fn admin_route(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<AdminRouteRequest>,
) -> impl IntoResponse {
    let mut guard = state.inner.write().await;
    if let Some(kind) = payload.source_kind.as_deref() {
        guard.current_source_kind = SourceKind::parse(kind);
    }
    if let Some(origin) = payload.direct_origin {
        guard.direct_origin = origin;
    }
    if let Some(group) = payload.origin_group_id {
        guard.origin_group_id = group;
    }
    if let Some(members) = payload.origin_group_members {
        guard.origin_group_members = members;
    }
    if let Some(protocol) = payload.origin_protocol {
        guard.origin_protocol = protocol;
    }
    if let Some(port) = payload.http_origin_port {
        guard.http_origin_port = port;
    }
    if let Some(port) = payload.https_origin_port {
        guard.https_origin_port = port;
    }
    if guard.current_source_kind == SourceKind::Direct {
        let (_, port) = split_origin(&guard.direct_origin, guard.https_origin_port);
        guard.http_origin_port = port;
        guard.https_origin_port = port;
    }
    Json(json!({
        "status": "ok",
        "state": &*guard
    }))
}

async fn handle_edgeone_action(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(payload): Json<Value>,
) -> impl IntoResponse {
    let action = headers
        .get("x-tc-action")
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default()
        .trim()
        .to_string();

    match action.as_str() {
        "DescribeAccelerationDomains" => {
            let mut guard = state.inner.write().await;
            guard.describe_request_count = guard.describe_request_count.saturating_add(1);
            let response = match guard.current_source_kind {
                SourceKind::Direct => {
                    let (host, _) = split_origin(&guard.direct_origin, guard.https_origin_port);
                    json!({
                        "Response": {
                            "AccelerationDomains": [{
                                "DomainName": "mock.example.test",
                                "OriginProtocol": guard.origin_protocol,
                                "HttpOriginPort": guard.http_origin_port,
                                "HttpsOriginPort": guard.https_origin_port,
                                "OriginDetail": {
                                    "Origin": host,
                                    "OriginProtocol": guard.origin_protocol,
                                    "HttpOriginPort": guard.http_origin_port,
                                    "HttpsOriginPort": guard.https_origin_port,
                                    "OriginInfo": {
                                        "OriginType": "IP_DOMAIN",
                                        "Origin": host,
                                        "BackupOrigin": ""
                                    }
                                }
                            }],
                            "RequestId": "describe-mock"
                        }
                    })
                }
                SourceKind::OriginGroup => json!({
                    "Response": {
                        "AccelerationDomains": [{
                            "DomainName": "mock.example.test",
                            "OriginProtocol": "HTTPS",
                            "OriginDetail": {
                                "Origin": guard.origin_group_id,
                                "OriginProtocol": "HTTPS",
                                "OriginInfo": {
                                    "OriginType": "ORIGIN_GROUP",
                                    "Origin": guard.origin_group_id,
                                    "BackupOrigin": ""
                                }
                            }
                        }],
                        "RequestId": "describe-mock"
                    }
                }),
            };
            (StatusCode::OK, Json(response)).into_response()
        }
        "ModifyAccelerationDomain" => {
            let mut guard = state.inner.write().await;
            guard.modify_request_count = guard.modify_request_count.saturating_add(1);
            let info = payload
                .get("OriginInfo")
                .cloned()
                .unwrap_or_else(|| json!({}));
            let origin_type = info
                .get("OriginType")
                .and_then(Value::as_str)
                .unwrap_or("IP_DOMAIN")
                .trim()
                .to_ascii_uppercase();
            if origin_type == "ORIGIN_GROUP" {
                guard.current_source_kind = SourceKind::OriginGroup;
                guard.origin_group_id = info
                    .get("Origin")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string();
                guard.origin_protocol = payload
                    .get("OriginProtocol")
                    .and_then(Value::as_str)
                    .unwrap_or("HTTPS")
                    .to_string();
            } else {
                let origin = info
                    .get("Origin")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string();
                let https_port = payload
                    .get("HttpsOriginPort")
                    .and_then(Value::as_u64)
                    .and_then(|value| u16::try_from(value).ok());
                let http_port = payload
                    .get("HttpOriginPort")
                    .and_then(Value::as_u64)
                    .and_then(|value| u16::try_from(value).ok());
                let fallback_port = https_port.or(http_port).unwrap_or(443);
                guard.current_source_kind = SourceKind::Direct;
                let (host, _) = split_origin(&origin, fallback_port);
                guard.direct_origin = format!("{host}:{fallback_port}");
                guard.origin_protocol = payload
                    .get("OriginProtocol")
                    .and_then(Value::as_str)
                    .unwrap_or("HTTPS")
                    .to_string();
                guard.http_origin_port = http_port.unwrap_or(fallback_port);
                guard.https_origin_port = https_port.unwrap_or(fallback_port);
            }
            (
                StatusCode::OK,
                Json(json!({
                    "Response": {
                        "RequestId": "modify-mock",
                        "CurrentSourceKind": guard.current_source_kind.as_str(),
                        "CurrentOrigin": match guard.current_source_kind {
                            SourceKind::Direct => guard.direct_origin.clone(),
                            SourceKind::OriginGroup => guard.origin_group_id.clone(),
                        }
                    }
                })),
            )
                .into_response()
        }
        other => (
            StatusCode::BAD_REQUEST,
            Json(json!({
                "Response": {
                    "Error": {
                        "Message": format!("unknown action {other}")
                    }
                }
            })),
        )
            .into_response(),
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let cli = Cli::parse();
    let initial_source_kind = SourceKind::parse(&cli.initial_source_kind);
    let (_, initial_port) = split_origin(&cli.initial_direct_origin, 8787);
    let state = Arc::new(AppState {
        inner: RwLock::new(StateSnapshot {
            current_source_kind: initial_source_kind,
            direct_origin: cli.initial_direct_origin.clone(),
            origin_group_id: cli.initial_origin_group_id.clone(),
            origin_group_members: vec!["node-a:8787".to_string(), "node-b:8787".to_string()],
            origin_protocol: "HTTPS".to_string(),
            http_origin_port: initial_port,
            https_origin_port: initial_port,
            describe_request_count: 0,
            modify_request_count: 0,
        }),
    });

    let app = Router::new()
        .route("/origin", get(read_origin))
        .route("/set-origin", get(set_origin_query))
        .route("/admin/state", get(admin_state))
        .route("/admin/route", post(admin_route))
        .route("/", post(handle_edgeone_action))
        .with_state(state);

    println!("Mock EdgeOne listening on http://{}", cli.bind);
    axum::serve(tokio::net::TcpListener::bind(cli.bind).await?, app).await?;
    Ok(())
}
