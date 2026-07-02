# Rust Mock Services With Host-side Compose Harness On Shared Testbox

当集成测试需要 Docker Compose、多节点服务和共享测试机时，推荐采用下面的模式：

## Pattern

- mock 服务使用项目内 Rust 二进制实现。
- Compose 只承载被测服务与 mock 服务，不承载测试 runner 容器。
- SQLite 夹具、断言脚本、summary 聚合在 host-side 执行。
- 每次共享测试机运行使用独立 `RUN_ID`、独立 `COMPOSE_PROJECT`、独立 runtime dir。

## Why

- Rust mock 与产品真实协议更接近，减少“测试协议”和“产品协议”漂移。
- host-side 夹具可以直接写 bind-mounted SQLite 文件，不再需要 `docker cp` 或专用 runner 容器。
- shared-testbox 上的 Compose 资源、运行目录和日志能按 run 精确回收，不会污染其他项目。
- LXC 环境下 capability 兼容层可以统一由 suite 脚本生成，不需要每个 Compose 文件重复写一遍。

## Recommended Structure

- `tests/<topic>/Dockerfile.mock`
  统一构建所有测试 mock 二进制。
- `tests/<topic>/docker-compose.yml`
  公共底座。
- `tests/<topic>/docker-compose.<mode>.yml`
  行为 overlay，例如 legacy / dual-active / memory。
- `tests/<topic>/scripts/run_<topic>_acceptance.py`
  host-side 断言入口。
- `tests/<topic>/scripts/run_testbox_<topic>_suite.sh`
  远端单 run 编排器。
- `scripts/run-<topic>-testbox-suite.sh`
  本地包装器，负责路径映射、`rsync`、远端执行和结果回传。

## Operational Rules

- 所有远端文件只能落在 `/srv/codex/**`。
- Compose 必须显式带 `-p <unique-project>`。
- 默认不暴露端口；host-side 断言优先通过 Docker network IP 访问容器。
- 禁止全局 Docker 清理；只允许清理当前 run 创建的资源。
- 失败默认保留远端 run dir 与 summary，成功默认清理。

## Practical Notes

- bind-mounted runtime dirs 需要在 suite 启动前显式 `mkdir -p` 并清空旧 DB。
- 如果共享测试机或 CI 对外部 registry 偶发 EOF，测试专用 Dockerfile 应尽量只依赖一个外部
  base image；对 harness-only 镜像，优先直接复用 Rust builder stage 作为 runtime，避免每个
  Compose overlay rebuild 时再次解析第二个 distro base tag。
- 若 acceptance 依赖 control-plane 同步，不要假设 `full_master` 刚创建的 token/配置会立刻在 standby 可见；需要显式等待。
- dual-active ingress 若要稳定命中特定节点，应该使用 harness-only 头或独立测试路由，而不是修改产品入口行为。
- memory contract 更适合单独运行，不要和功能回归混在同一 Compose 生命周期里。
