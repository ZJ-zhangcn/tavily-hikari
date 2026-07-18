# Tavily Hikari（personal-proxy-affinity）

Tavily 多 Key 代理 / MCP 层。本 fork 自用分支。

| 项 | 值 |
|---|---|
| 仓库 | https://github.com/ZJ-zhangcn/tavily-hikari |
| 分支 | `personal-proxy-affinity` |
| 上游 | https://github.com/IvanLi-CN/tavily-hikari |
| 镜像 | `ghcr.io/zj-zhangcn/tavily-hikari:personal` |

## 本分支增强

- Key ↔ Proxy 亲和均衡
- 锁定 / 再平衡 API
- 中文亲和面板与拥堵反馈

## 部署

```bash
image: ghcr.io/zj-zhangcn/tavily-hikari:personal
# 管理面默认不要对公网裸奔；网关侧做 Basic Auth / 反代
```

推送到本分支会构建 `:personal` 与 `:<sha>` 标签。

## 常用路径

- 管理台：`/admin/...`
- 用户台：`/console/...`
- MCP / API：按上游约定的 `/mcp`、Tavily 兼容路径

## 运维动作

- 导入官方 `tvly-` Key 后，客户端用平台下发的 `th-...`
- 亲和异常时走管理端 rebalance（勿在文档里贴代理账号）

更全上游说明见上游仓库。
