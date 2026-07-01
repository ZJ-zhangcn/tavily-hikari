import argparse
import concurrent.futures
import json
import os
import time
import urllib.error
import urllib.request

INGRESS = os.environ.get("INGRESS_URL", "http://edgeone-ingress:8080")
EDGEONE = os.environ.get("EDGEONE_MOCK_URL", "http://edgeone-mock:9000")
UPSTREAM = os.environ.get("UPSTREAM_MOCK_URL", "http://upstream-mock:9001")
NODE_A = os.environ.get("NODE_A_URL", "http://node-a:8787")
NODE_B = os.environ.get("NODE_B_URL", "http://node-b:8787")
STATE_FILE = os.environ.get("HA_ACCEPTANCE_STATE_FILE", "/tmp/ha_acceptance_state.json")


def request(method, url, body=None, token=None, headers=None, timeout=10):
    data = None
    req_headers = dict(headers or {})
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        req_headers["content-type"] = "application/json"
    if token:
        req_headers["authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=data, method=method, headers=req_headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            raw = response.read().decode("utf-8")
            try:
                parsed = json.loads(raw) if raw else None
            except json.JSONDecodeError:
                parsed = raw
            return response.status, parsed, dict(response.headers)
    except urllib.error.HTTPError as err:
        raw = err.read().decode("utf-8")
        try:
            parsed = json.loads(raw) if raw else None
        except json.JSONDecodeError:
            parsed = raw
        return err.code, parsed, dict(err.headers)


def wait_json(url, predicate, label, timeout=90):
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        try:
            status, body, _headers = request("GET", url)
            last = (status, body)
            if status == 200 and predicate(body):
                return body
        except Exception as exc:  # noqa: BLE001
            last = repr(exc)
        time.sleep(1)
    raise AssertionError(f"timed out waiting for {label}; last={last}")


def assert_status(label, actual, expected):
    if actual != expected:
        raise AssertionError(f"{label}: expected HTTP {expected}, got {actual}")


def create_token(base):
    status, body, _headers = request("POST", f"{base}/api/tokens", {"note": "ha acceptance"})
    assert_status("create token", status, 201)
    return body["token"]


def create_api_key(base, note):
    status, body, _headers = request("POST", f"{base}/api/keys", {"api_key": note})
    assert_status("create api key", status, 201)
    return body["id"]


def register_upstream_key(secret):
    status, body, _headers = request(
        "POST",
        f"{UPSTREAM}/admin/keys",
        {"secret": secret},
    )
    assert_status("register upstream key", status, 201)
    return body


def get_api_key_secret(base, key_id):
    status, body, _headers = request("GET", f"{base}/api/keys/{key_id}/secret")
    assert_status("get api key secret", status, 200)
    return body["api_key"]


def write_state(**values):
    current = {}
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE, "r", encoding="utf-8") as handle:
            current = json.load(handle)
    current.update(values)
    with open(STATE_FILE, "w", encoding="utf-8") as handle:
        json.dump(current, handle)


def read_state(key):
    with open(STATE_FILE, "r", encoding="utf-8") as handle:
        return json.load(handle)[key]


def edgeone_state():
    status, body, _headers = request("GET", f"{EDGEONE}/origin")
    assert_status("edgeone state", status, 200)
    return body


def upstream_state():
    status, body, _headers = request("GET", f"{UPSTREAM}/admin/state")
    assert_status("upstream state", status, 200)
    return body


def wait_node_role(base, role, timeout=90):
    return wait_json(
        f"{base}/api/admin/ha/status",
        lambda body: body["role"] == role,
        f"{base} role={role}",
        timeout=timeout,
    )


def promote_dual_active_leader(base):
    status, body, _headers = request("POST", f"{base}/api/admin/ha/promote", {})
    assert_status("dual-active bootstrap promote", status, 200)
    assert body["role"] == "full_master", body
    return body


def request_core_bundle(base, token, headers=None, suffix="bundle"):
    status, search, _ = request(
        "POST",
        f"{base}/api/tavily/search",
        {"query": f"ha {suffix}"},
        token,
        headers=headers,
    )
    assert_status(f"{base} search", status, 200)

    status, extract, _ = request(
        "POST",
        f"{base}/api/tavily/extract",
        {"urls": ["https://example.test/extract"]},
        token,
        headers=headers,
    )
    assert_status(f"{base} extract", status, 200)

    status, crawl, _ = request(
        "POST",
        f"{base}/api/tavily/crawl",
        {"url": "https://example.test/crawl", "limit": 5},
        token,
        headers=headers,
    )
    assert_status(f"{base} crawl", status, 200)

    status, map_body, _ = request(
        "POST",
        f"{base}/api/tavily/map",
        {"url": "https://example.test/map", "limit": 5},
        token,
        headers=headers,
    )
    assert_status(f"{base} map", status, 200)

    status, usage, _ = request("GET", f"{base}/api/tavily/usage", token=token, headers=headers)
    assert_status(f"{base} usage", status, 200)

    status, research, _ = request(
        "POST",
        f"{base}/api/tavily/research",
        {"query": f"ha research {suffix}", "topic": "general", "model": "mini"},
        token,
        headers=headers,
    )
    assert_status(f"{base} research create", status, 200)

    status, research_result, _ = request(
        "GET",
        f"{base}/api/tavily/research/{research['request_id']}",
        token=token,
        headers=headers,
    )
    assert_status(f"{base} research result", status, 200)

    status, mcp_init_body, mcp_init_headers = request(
        "POST",
        f"{base}/mcp?tavilyApiKey={token}",
        {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}},
        headers=headers,
    )
    assert_status(f"{base} mcp initialize", status, 200)
    proxy_session_id = mcp_init_headers.get("mcp-session-id")
    if not proxy_session_id:
        raise AssertionError(f"{base} mcp initialize missing proxy session id")

    status, mcp_follow_body, mcp_follow_headers = request(
        "POST",
        f"{base}/mcp?tavilyApiKey={token}",
        {"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}},
        headers={"mcp-session-id": proxy_session_id, **(headers or {})},
    )
    assert_status(f"{base} mcp follow-up", status, 200)

    return {
        "search": search,
        "extract": extract,
        "crawl": crawl,
        "map": map_body,
        "usage": usage,
        "research_create": research,
        "research_result": research_result,
        "mcp_initialize": mcp_init_body,
        "mcp_initialize_headers": mcp_init_headers,
        "mcp_follow_up": mcp_follow_body,
        "mcp_follow_up_headers": mcp_follow_headers,
    }


def wait_token_usable_on_node(base, token, timeout=30):
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        status, body, _headers = request(
            "POST",
            f"{base}/api/tavily/search",
            {"query": "token sync probe"},
            token=token,
        )
        last = (status, body)
        if status == 200:
            return
        time.sleep(1)
    raise AssertionError(f"timed out waiting for token usability on {base}; last={last}")


def stage_legacy_pre():
    wait_json(f"{NODE_A}/health", lambda _: True, "node-a health")
    wait_json(f"{NODE_B}/health", lambda _: True, "node-b health")
    node_a = wait_node_role(NODE_A, "full_master")
    node_b = wait_node_role(NODE_B, "standby")
    edgeone = edgeone_state()
    assert edgeone["sourceKind"] == "direct", edgeone
    assert edgeone["origin"] == "node-a:8787", edgeone
    assert node_a["edgeoneOrigin"] == "node-a:8787", node_a
    assert node_b["edgeoneOrigin"] == "node-a:8787", node_b

    token = create_token(INGRESS)
    request_core_bundle(INGRESS, token, suffix="legacy-ingress")

    status, body, _ = request("POST", f"{NODE_B}/api/tavily/search", {"query": "blocked"})
    assert_status("legacy standby tavily gate", status, 503)
    assert body["role"] == "standby", body
    status, _body, _ = request(
        "POST",
        f"{NODE_B}/mcp?tavilyApiKey={token}",
        {"jsonrpc": "2.0", "id": 1, "method": "tools/list"},
    )
    assert_status("legacy standby mcp gate", status, 503)
    status, _body, _ = request("POST", f"{NODE_B}/api/tokens", {"note": "blocked"})
    assert_status("legacy standby token gate", status, 503)

    sentinel_secret = f"tvly-ha-sentinel-{int(time.time())}"
    sentinel_id = create_api_key(NODE_A, sentinel_secret)
    register_upstream_key(sentinel_secret)

    def has_sentinel(_body):
        try:
            return get_api_key_secret(NODE_B, sentinel_id) == sentinel_secret
        except AssertionError:
            return False

    wait_json(f"{NODE_B}/api/admin/ha/status", has_sentinel, "legacy standby state sync", timeout=30)
    write_state(token=token, sentinel_secret=sentinel_secret, sentinel_id=sentinel_id)
    print(json.dumps({"stage": "legacy_pre", "token": token, "sentinelId": sentinel_id}))


def stage_legacy_failover():
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        cutover = executor.submit(
            request,
            "POST",
            f"{NODE_A}/api/admin/ha/planned-cutover",
            {"targetNodeId": "node-b"},
        )
        active_rejected = executor.submit(request, "POST", f"{NODE_A}/api/admin/ha/promote", {})
        b_status, b_body, _ = cutover.result(timeout=20)
        a_status, _a_body, _ = active_rejected.result(timeout=20)
    assert_status("legacy planned cutover to node-b", b_status, 200)
    assert b_body["status"] == "success", b_body
    assert_status("legacy active node-a non-force promote rejected", a_status, 409)

    edgeone = wait_json(
        f"{EDGEONE}/origin",
        lambda body: body["origin"] == "node-b:8787",
        "edgeone switched to node-b",
        timeout=30,
    )
    assert edgeone["sourceKind"] == "direct", edgeone

    node_a = wait_node_role(NODE_A, "recovery", timeout=60)
    assert node_a["allowsBasicBusiness"] is False, node_a
    node_b = wait_node_role(NODE_B, "full_master", timeout=60)
    assert node_b["allowsFullWrites"] is True, node_b

    token = read_state("token")
    wait_token_usable_on_node(NODE_B, token)
    request_core_bundle(INGRESS, token, suffix="legacy-after-cutover")
    status, _body, _ = request("POST", f"{NODE_B}/api/tokens", {"note": "after failover"})
    assert_status("legacy new full master token write restored", status, 201)
    print(json.dumps({"stage": "legacy_failover", "edgeone": edgeone}))


def stage_legacy_recovery():
    node_a = wait_node_role(NODE_A, "recovery", timeout=60)
    assert node_a["recoveryStatus"], node_a
    before_status, before_settings, _ = request("GET", f"{NODE_B}/api/settings")
    assert_status("legacy read settings before recovery", before_status, 200)
    forbidden_payload = {
        "batchId": "old-node-a-batch-1",
        "sourceNodeId": "node-a",
        "message": "node-a forbidden log recovery batch",
        "requestLogs": [
            {
                "authTokenId": "old-node-a-token",
                "method": "POST",
                "path": "/api/tavily/search",
                "statusCode": 200,
                "tavilyStatusCode": 200,
                "resultStatus": "success",
                "requestKindKey": "tavily_search",
                "requestKindLabel": "Tavily Search",
                "businessCredits": 1,
                "requestBody": "{\"query\":\"old\"}",
                "responseBody": "{\"ok\":true}",
                "forwardedHeaders": "[]",
                "droppedHeaders": "[]",
                "visibility": "visible",
                "createdAt": int(time.time()) - 30,
            }
        ],
        "authTokenLogs": [
            {
                "tokenId": "old-node-a-token",
                "method": "POST",
                "path": "/api/tavily/search",
                "httpStatus": 200,
                "mcpStatus": 200,
                "requestKindKey": "tavily_search",
                "requestKindLabel": "Tavily Search",
                "resultStatus": "success",
                "countsBusinessQuota": 1,
                "businessCredits": 1,
                "billingState": "charged",
                "createdAt": int(time.time()) - 30,
            }
        ],
    }
    status, body, _ = request("POST", f"{NODE_B}/api/admin/ha/recovery/import", forbidden_payload)
    assert_status("legacy recovery log import rejected", status, 400)
    assert "request_logs" in str(body) and "auth_token_logs" in str(body), body

    payload = {
        "batchId": "old-node-a-batch-1",
        "sourceNodeId": "node-a",
        "message": "node-a ledger recovery batch",
    }
    status, body, _ = request("POST", f"{NODE_B}/api/admin/ha/recovery/import", payload)
    assert_status("legacy recovery import first", status, 200)
    assert body["imported"] is True, body
    assert body["eventCount"] == 0, body
    assert body["status"]["role"] == "full_master", body
    status, body, _ = request("POST", f"{NODE_B}/api/admin/ha/recovery/import", payload)
    assert_status("legacy recovery import duplicate", status, 200)
    assert body["imported"] is False, body
    after_status, after_settings, _ = request("GET", f"{NODE_B}/api/settings")
    assert_status("legacy read settings after recovery", after_status, 200)
    assert before_settings == after_settings
    print(json.dumps({"stage": "legacy_recovery", "nodeA": node_a["role"]}))


def stage_dual_active_serving():
    wait_json(f"{NODE_A}/health", lambda _: True, "node-a health")
    wait_json(f"{NODE_B}/health", lambda _: True, "node-b health")
    promote_dual_active_leader(NODE_A)
    node_a = wait_node_role(NODE_A, "full_master")
    node_b = wait_json(
        f"{NODE_B}/api/admin/ha/status",
        lambda body: body["role"] == "standby"
        and body["allowsBasicBusiness"] is True
        and body.get("fullMasterNodeId") == "node-a",
        "node-b dual-active serving",
        timeout=30,
    )
    assert node_a["allowsFullWrites"] is True, node_a
    assert node_b["allowsFullWrites"] is False, node_b
    assert node_a["allowsBasicBusiness"] is True, node_a
    assert node_b["allowsBasicBusiness"] is True, node_b

    edgeone = edgeone_state()
    assert edgeone["sourceKind"] == "origin_group", edgeone
    assert edgeone["origin"] == "og-core", edgeone

    token = create_token(NODE_A)
    bundle_a = request_core_bundle(NODE_A, token, suffix="dual-node-a")
    wait_token_usable_on_node(NODE_B, token)
    bundle_b = request_core_bundle(
        INGRESS,
        token,
        headers={"x-mock-edgeone-target": "node-b:8787"},
        suffix="dual-ingress-node-b",
    )
    direct_bundle_b = request_core_bundle(NODE_B, token, suffix="dual-node-b")

    status, _body, _ = request("POST", f"{NODE_B}/api/tokens", {"note": "dual-blocked"})
    assert_status("dual standby full-write gate", status, 503)
    status, _body, _ = request("POST", f"{NODE_A}/api/tokens", {"note": "dual-master-allowed"})
    assert_status("dual full master token write", status, 201)

    mcp_session_id = bundle_a["mcp_initialize_headers"]["mcp-session-id"]
    status, body, headers = request(
        "POST",
        f"{NODE_B}/mcp?tavilyApiKey={token}",
        {"jsonrpc": "2.0", "id": 3, "method": "tools/list", "params": {}},
        headers={"mcp-session-id": mcp_session_id},
    )
    assert_status("dual cross-node mcp follow-up", status, 200)
    upstream = body["result"]["structuredContent"]["mock_upstream_session_id"]

    def node_b_has_session(session_id):
        status, snapshot, _headers = request(
            "GET",
            f"{NODE_B}/api/internal/ha/mcp-sessions/{session_id}",
            headers={"x-ha-internal-token": "ha-internal-token"},
        )
        return status == 200 and snapshot["upstreamSessionId"] == upstream

    wait_json(
        f"{NODE_B}/api/admin/ha/status",
        lambda _body: node_b_has_session(mcp_session_id),
        "node-b peer lookup session backfill",
        timeout=10,
    )

    research_request_id = bundle_a["research_create"]["request_id"]
    status, research_result, _headers = request(
        "GET",
        f"{NODE_B}/api/tavily/research/{research_request_id}",
        token=token,
    )
    assert_status("dual cross-node research result", status, 200)
    assert (
        research_result["mock_bound_key"] == bundle_a["research_result"]["mock_bound_key"]
    ), research_result

    write_state(
        token=token,
        mcp_session_id=mcp_session_id,
        research_request_id=research_request_id,
        upstream_session_id=upstream,
    )
    print(
        json.dumps(
            {
                "stage": "dual_active_serving",
                "edgeone": edgeone,
                "nodeA": {"role": node_a["role"], "bundle": bundle_a},
                "nodeB": {"role": node_b["role"], "bundle": direct_bundle_b},
                "ingressNodeB": bundle_b,
                "mcpSessionId": mcp_session_id,
                "upstreamSessionId": upstream,
                "researchRequestId": research_request_id,
            }
        )
    )


def stage_dual_active_cutover():
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        cutover = executor.submit(
            request,
            "POST",
            f"{NODE_A}/api/admin/ha/planned-cutover",
            {"targetNodeId": "node-b"},
        )
        finalize = executor.submit(request, "POST", f"{NODE_A}/api/admin/ha/finalize")
        cutover_status, cutover_body, _ = cutover.result(timeout=20)
        finalize_status, finalize_body, _ = finalize.result(timeout=20)

    assert_status("dual planned cutover", cutover_status, 200)
    assert cutover_body["status"] == "success", cutover_body
    assert_status("dual finalize rejected", finalize_status, 409)
    assert "disabled in dual-active mode" in str(finalize_body), finalize_body

    node_b = wait_node_role(NODE_B, "full_master", timeout=30)
    node_a = wait_node_role(NODE_A, "standby", timeout=30)
    assert node_b["allowsFullWrites"] is True, node_b
    assert node_a["allowsFullWrites"] is False, node_a
    assert node_a["allowsBasicBusiness"] is True, node_a

    edgeone = edgeone_state()
    assert edgeone["sourceKind"] == "origin_group", edgeone
    assert edgeone["origin"] == "og-core", edgeone

    token = read_state("token")
    wait_token_usable_on_node(NODE_A, token)
    wait_token_usable_on_node(NODE_B, token)
    request_core_bundle(NODE_A, token, suffix="dual-after-cutover-node-a")
    request_core_bundle(NODE_B, token, suffix="dual-after-cutover-node-b")
    status, _body, _ = request("POST", f"{NODE_B}/api/tokens", {"note": "dual-new-master"})
    assert_status("dual new full master token write", status, 201)
    status, _body, _ = request("POST", f"{NODE_A}/api/tokens", {"note": "dual-old-master-blocked"})
    assert_status("dual old master write blocked", status, 503)
    print(
        json.dumps(
            {
                "stage": "dual_active_cutover",
                "nodeA": node_a["role"],
                "nodeB": node_b["role"],
                "edgeone": edgeone,
            }
        )
    )


parser = argparse.ArgumentParser()
parser.add_argument(
    "stage",
    choices=[
        "legacy_pre",
        "legacy_failover",
        "legacy_recovery",
        "dual_active_serving",
        "dual_active_cutover",
    ],
)
args = parser.parse_args()
globals()[f"stage_{args.stage}"]()
