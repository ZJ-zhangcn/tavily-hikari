use std::{
    net::SocketAddr,
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
};

use axum::{
    Router,
    body::Body,
    extract::State,
    http::{HeaderMap, Request, StatusCode},
    response::IntoResponse,
    routing::any,
};
use clap::Parser;
use reqwest::Client;
use serde::Deserialize;

#[derive(Parser, Debug)]
struct Cli {
    /// Address to bind the ingress server.
    #[arg(long, default_value = "127.0.0.1:59002")]
    bind: SocketAddr,

    /// Mock EdgeOne base URL.
    #[arg(
        long,
        env = "EDGEONE_MOCK_URL",
        default_value = "http://127.0.0.1:59001"
    )]
    edgeone_mock_url: String,
}

#[derive(Clone)]
struct AppState {
    client: Client,
    edgeone_mock_url: String,
    rr_counter: Arc<AtomicUsize>,
}

#[derive(Deserialize)]
struct EdgeOneOriginState {
    #[serde(rename = "sourceKind")]
    source_kind: String,
    origin: String,
    #[serde(rename = "directOrigin")]
    direct_origin: String,
    #[serde(rename = "originGroupMembers", default)]
    origin_group_members: Vec<String>,
}

fn split_origin(origin: &str) -> Option<(String, u16)> {
    let (host, port) = origin.rsplit_once(':')?;
    Some((host.to_string(), port.parse().ok()?))
}

fn header_string(headers: &HeaderMap, name: &str) -> Option<String> {
    headers
        .get(name)
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

async fn pick_target(state: &AppState, headers: &HeaderMap) -> Result<String, String> {
    if let Some(forced) = header_string(headers, "x-mock-edgeone-target") {
        return Ok(forced);
    }
    let response = state
        .client
        .get(format!(
            "{}/origin",
            state.edgeone_mock_url.trim_end_matches('/')
        ))
        .send()
        .await
        .map_err(|err| format!("edgeone origin lookup failed: {err}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "edgeone origin lookup returned {}",
            response.status()
        ));
    }
    let payload = response
        .json::<EdgeOneOriginState>()
        .await
        .map_err(|err| format!("invalid edgeone origin payload: {err}"))?;
    if payload.source_kind == "origin_group" {
        if payload.origin_group_members.is_empty() {
            return Err("origin_group has no members".to_string());
        }
        let idx = state.rr_counter.fetch_add(1, Ordering::Relaxed);
        return Ok(payload.origin_group_members[idx % payload.origin_group_members.len()].clone());
    }
    if !payload.direct_origin.is_empty() {
        return Ok(payload.direct_origin);
    }
    Ok(payload.origin)
}

async fn proxy(State(state): State<AppState>, mut request: Request<Body>) -> impl IntoResponse {
    let target = match pick_target(&state, request.headers()).await {
        Ok(target) => target,
        Err(err) => {
            return (StatusCode::BAD_GATEWAY, err).into_response();
        }
    };
    let Some((host, port)) = split_origin(&target) else {
        return (
            StatusCode::BAD_GATEWAY,
            format!("invalid target origin: {target}"),
        )
            .into_response();
    };

    let uri = request.uri().clone();
    let path_and_query = uri
        .path_and_query()
        .map(|value| value.as_str())
        .unwrap_or("/");
    let upstream_url = format!("http://{host}:{port}{path_and_query}");

    let method = request.method().clone();
    let headers = request.headers().clone();
    let incoming = std::mem::replace(request.body_mut(), Body::empty());
    let body_bytes = match axum::body::to_bytes(incoming, usize::MAX).await {
        Ok(bytes) => bytes,
        Err(err) => {
            return (
                StatusCode::BAD_REQUEST,
                format!("failed to read request body: {err}"),
            )
                .into_response();
        }
    };

    let mut builder = state.client.request(method, upstream_url);
    for (name, value) in &headers {
        if name.as_str().eq_ignore_ascii_case("host")
            || name.as_str().eq_ignore_ascii_case("x-mock-edgeone-target")
        {
            continue;
        }
        builder = builder.header(name, value);
    }
    let response = match builder.body(body_bytes).send().await {
        Ok(response) => response,
        Err(err) => {
            return (
                StatusCode::BAD_GATEWAY,
                format!("proxy request failed: {err}"),
            )
                .into_response();
        }
    };

    let status = response.status();
    let response_headers = response.headers().clone();
    let response_body = match response.bytes().await {
        Ok(body) => body,
        Err(err) => {
            return (
                StatusCode::BAD_GATEWAY,
                format!("failed to read upstream response: {err}"),
            )
                .into_response();
        }
    };

    let mut outbound = axum::response::Response::builder().status(status);
    for (name, value) in &response_headers {
        if name.as_str().eq_ignore_ascii_case("connection")
            || name.as_str().eq_ignore_ascii_case("transfer-encoding")
            || name.as_str().eq_ignore_ascii_case("content-length")
        {
            continue;
        }
        outbound = outbound.header(name, value);
    }
    outbound
        .body(Body::from(response_body))
        .unwrap_or_else(|_| {
            axum::response::Response::builder()
                .status(StatusCode::INTERNAL_SERVER_ERROR)
                .body(Body::from("failed to build response"))
                .expect("response builder")
        })
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let cli = Cli::parse();
    let state = AppState {
        client: Client::new(),
        edgeone_mock_url: cli.edgeone_mock_url,
        rr_counter: Arc::new(AtomicUsize::new(0)),
    };
    let app = Router::new()
        .route("/*path", any(proxy))
        .route("/", any(proxy))
        .with_state(state);

    println!("Mock EdgeOne ingress listening on http://{}", cli.bind);
    axum::serve(tokio::net::TcpListener::bind(cli.bind).await?, app).await?;
    Ok(())
}
