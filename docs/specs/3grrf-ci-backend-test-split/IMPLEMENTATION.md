# GitHub Actions 后端测试拆分与并行提速 实现状态（#3grrf）

> 当前有效规范仍以 `./SPEC.md` 为准；这里记录实现覆盖、交付进度与 rollout 相关事实，避免这些细节散落到 PR / Git 历史里。

## Current Status

- Implementation: 部分完成（PR1 done, PR2 core in progress）
- Lifecycle: active
- Catalog note: CI backend split / artifact reuse / stable aggregate gate

## Coverage / rollout summary

- PR1 目标：
  - backend semantic shards
  - single-build `web/dist` artifact reuse
  - stable `Backend Tests` aggregate gate
  - `Compose Smoke` / `Build (Release)` critical-path unblock
- PR2 目标：
  - shard manifest + coverage verifier
  - lib / bin test job-matrix parallelization without reducing test count

## Implemented Now

- `.github/workflows/ci.yml`
  - 新增 `Backend Shard Plan` job，在 CI 内先执行 shard coverage verifier，再导出 lib / bin / integration 三类 matrix。
  - `backend-lib-tests`、`backend-bin-tests`、`backend-integration-tests` 已切到 manifest 驱动的 matrix shards。
  - 稳定 owner-facing `Backend Tests` aggregate gate 继续保留。
- `scripts/ci_backend_test_manifest.json`
  - 固化当前 lib / main-bin / support-bin / integration test 的 shard 归属。
  - coverage verifier 已证明当前 union 覆盖 `354 lib + 324 main-bin + 24 support-bin + 20 integration` tests，无 overlap、无 unmatched。
- `scripts/ci_backend_tests.py`
  - `verify`：基于 `cargo test -- --list` 做 shard 覆盖等价校验并导出 matrix。
  - `run-shard`：不再依赖 `cargo test FILTER` / `--skip FILTER` 的子串匹配，而是先生成 test executable，再按精确测试名列表用 `--exact` 直跑对应 test binary，避免重复命中或漏跑。

## Remaining Gaps

- 待补充完整关键路径对比数据，并在真实 GitHub PR run 上确认 wall time 收益。
- 待决定是否继续细分当前较重的 lib/main-bin shards，或在后续 PR 中引入更细的 test namespace 整理。
- 待补充两阶段关键路径对比数据与最终 PR references。

## Related Changes

- None

## References

- `./SPEC.md`
- `./HISTORY.md`
