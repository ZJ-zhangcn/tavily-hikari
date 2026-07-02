# HA Test Harness

`tests/ha` 提供两类回归：

- legacy `direct` 主备回归：`legacy_pre`、`legacy_failover`、`legacy_recovery`
- dual-active `origin_group` 回归：`dual_active_serving`、`dual_active_cutover`

mock 服务全部使用 Rust 二进制：

- `mock_tavily`
- `mock_edgeone`
- `mock_edgeone_ingress`

`Dockerfile.app` 和 `Dockerfile.mock` 都直接复用 Rust builder stage 作为测试 runtime，
这样 shared-testbox 在不同 overlay 间反复 rebuild 时不会再额外解析第二个 distro base tag。

夹具与断言脚本继续保留 host-side Python / shell，不进入 Compose 服务依赖面。

## Compose Layout

- `docker-compose.yml`
  公共底座，定义 Rust mock 服务、`node-a`、`node-b` 和 bind-mounted runtime dirs。
- `docker-compose.legacy.yml`
  legacy `direct` 主备 overlay。
- `docker-compose.dual-active.yml`
  dual-active `origin_group` overlay。
- `docker-compose.memory.yml`
  256 MiB memory contract overlay。

运行时目录由 `HA_RUNTIME_DIR` 提供，至少包含：

- `${HA_RUNTIME_DIR}/node-a`
- `${HA_RUNTIME_DIR}/node-b`

每次测试都应该使用独立 runtime dir，避免跨 run 污染。

## Local Usage

准备 runtime dir：

```bash
export HA_RUNTIME_DIR="$PWD/.tmp/ha-runtime"
mkdir -p "$HA_RUNTIME_DIR/node-a" "$HA_RUNTIME_DIR/node-b"
```

legacy 回归：

```bash
docker compose \
  -f tests/ha/docker-compose.yml \
  -f tests/ha/docker-compose.legacy.yml \
  up -d --build

python3 tests/ha/scripts/run_ha_acceptance.py legacy_pre
python3 tests/ha/scripts/run_ha_acceptance.py legacy_failover
python3 tests/ha/scripts/run_ha_acceptance.py legacy_recovery
```

dual-active 回归：

```bash
docker compose \
  -f tests/ha/docker-compose.yml \
  -f tests/ha/docker-compose.dual-active.yml \
  up -d --build

python3 tests/ha/scripts/run_ha_acceptance.py dual_active_serving
python3 tests/ha/scripts/run_ha_acceptance.py dual_active_cutover
```

memory contract：

```bash
COMPOSE_PROJECT=ha-memory-local \
HA_RUNTIME_DIR="$PWD/.tmp/ha-memory-runtime" \
tests/ha/scripts/run_testbox_ha_memory_contract.sh
```

## Acceptance Matrix

- `legacy_pre`
  断言 `node-a=full_master`、`node-b=standby`、standby 核心业务 503、control/runtime 同步正常。
- `legacy_failover`
  断言 `planned cutover` 切换 EdgeOne direct origin，`node-a -> recovery`，`node-b -> full_master`。
- `legacy_recovery`
  断言 recovery import 拒绝 request/auth logs，只接受 ledger-only 幂等批次。
- `dual_active_serving`
  断言 node-a / node-b 都可服务 `/mcp`、`/api/tavily/*`、`/api/tavily/usage`；
  断言 MCP follow-up 与 research result 跨节点时继续复用原 upstream session / key。
- `dual_active_cutover`
  断言 dual-active `planned cutover` 只切 leader key，`finalize` 返回 `409`，切换后旧 master 仍可 serving 但不可 full-write。

## Harness-only Contracts

- `mock_edgeone_ingress` 支持 `x-mock-edgeone-target`
  仅用于测试时稳定命中 `node-a` 或 `node-b`，不属于产品接口。
- `mock_edgeone` 的 `/origin`
  返回当前 `sourceKind` 与 active target，兼容 legacy direct 与 dual-active origin-group 两条路径。
- `mock_tavily`
  - `/usage` 回显 key quota/usage
  - `POST /research` 与 `GET /research/:request_id` 回显绑定 key
  - `/mcp` initialize / follow-up 回显 upstream session id

## Shared Testbox

推荐入口：

```bash
scripts/run-ha-testbox-suite.sh
```

它会：

1. 按本地仓库路径哈希映射到 `/srv/codex/workspaces/$USER/<repo>__<hash>/runs/<run-id>`
2. `rsync` 当前仓库到远端 run dir
3. 在远端执行 `tests/ha/scripts/run_testbox_ha_suite.sh`
4. 回传 summary 与 artifacts 到本地 `.tmp/ha-testbox-<run-id>/`
5. 成功时默认清理远端 run；失败时保留远端目录便于复盘

主要产物：

- `ha-suite-summary.json`
- `artifacts/legacy*.json`
- `artifacts/dual_active*.json`
- `artifacts/memory_contract.json`
- `artifacts/*.log`
