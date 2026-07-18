# Tavily Hikari（personal-proxy-affinity）

Tavily 多 Key 代理层 + 管理台 + MCP。  
Fork 自 [`IvanLi-CN/tavily-hikari`](https://github.com/IvanLi-CN/tavily-hikari)，**默认分支 = `personal-proxy-affinity`**。

| 项 | 值 |
|---|---|
| 仓库 | https://github.com/ZJ-zhangcn/tavily-hikari |
| 分支 | `personal-proxy-affinity` |
| 上游 | https://github.com/IvanLi-CN/tavily-hikari |
| 镜像 | `ghcr.io/zj-zhangcn/tavily-hikari:personal` |
| 同时打标 | `:<12位sha>` |
| 构建 | 推送本分支 → Actions `Personal Image` |
| 自用域名示例 | `https://travily-pool.942645.xyz`（以你实际反代为准） |

更细的产品笔记见仓库内 [`PERSONAL.md`](PERSONAL.md)。

## 与上游的主要区别

| 点 | 上游 | 本分支 |
|---|---|---|
| 镜像 | 上游 GHCR / Release | **`ghcr.io/zj-zhangcn/tavily-hikari:personal`**，VPS **只 pull 不 build** |
| Key↔Proxy 亲和 | 基础亲和 | **负载均衡打分**（扣减 primary/secondary 负载） |
| 锁定 | — | `forward_proxy_key_affinity.locked` |
| 管理 API | 常规设置 | 增加亲和查询 / 单 Key 更新 / **rebalance** |
| 管理 UI | 英文向 | **中文亲和面板**、拥堵反馈、一键 Rebalance unlocked |
| 校验并发 | — | 额度探测 `buffer_unordered(2)` |
| CI | 上游 main 质量门 | 额外 `personal-image.yml`（含 Pillow 以构建 web/PWA） |

### 亲和相关 API（管理端，需管理员凭证）

```http
GET  /api/settings/forward-proxy/key-affinity
PUT  /api/settings/forward-proxy/key-affinity/:key_id
     body: { "primaryProxyKey"?: "...", "secondaryProxyKey"?: "...", "locked"?: true }
POST /api/settings/forward-proxy/key-affinity
     body: { "onlyUnlocked": true }   # rebalance
```

## 部署方式

### 方式 A：生产 Compose + 本 fork 镜像（推荐）

```yaml
services:
  tavily-hikari:
    image: ghcr.io/zj-zhangcn/tavily-hikari:personal
    restart: unless-stopped
    environment:
      PROXY_BIND: 0.0.0.0
      PROXY_PORT: "8787"
      PROXY_DB_PATH: /srv/app/data/tavily_proxy.db
      WEB_STATIC_DIR: /srv/app/web
      # 生产请关闭开发管理暴露，并在反代做 Basic Auth / IP 限制
      # DEV_OPEN_ADMIN: "false"
    ports:
      - "127.0.0.1:8787:8787"   # 建议仅本机，前面挂 nginx
    volumes:
      - tavily-hikari-data:/srv/app/data

volumes:
  tavily-hikari-data:
```

```bash
docker compose pull tavily-hikari
docker compose up -d tavily-hikari
# 升级后建议 rebalance 一次（把 Bearer 换成你的管理密钥，勿提交到 git）
curl -X POST -H "Authorization: Bearer <ADMIN>"   -H 'Content-Type: application/json'   -d '{"onlyUnlocked":true}'   http://127.0.0.1:8787/api/settings/forward-proxy/key-affinity
```

### 方式 B：仓库自带 compose（默认仍指向上游镜像）

仓库根目录 `docker-compose.yml` 默认是：

```yaml
image: ghcr.io/ivanli-cn/tavily-hikari:latest
```

自用请改成上面的 `:personal`，否则跑的不是本 fork。

### 方式 C：本地开发

```bash
git clone -b personal-proxy-affinity https://github.com/ZJ-zhangcn/tavily-hikari.git
cd tavily-hikari
# 按上游：Rust + Bun 前端
# cargo / bun 依赖安装后分别起后端与 web
```

## 使用要点

1. **导入**官方 `tvly-...` Key（管理台 / 批量 API）  
2. 客户端使用平台下发的 **`th-...`**，不要直连裸 `tvly-`  
3. 公共路径（`/api/tavily/`、`/mcp`）与管理路径在反代上分离；管理路径务必鉴权  
4. 代理出口凭据不要写进 README / 不要贴到工单

## 常用路径

| 路径 | 说明 |
|---|---|
| `/admin/...` | 管理台 |
| `/console/...` | 用户控制台 |
| `/mcp` | MCP |
| `/api/tavily/...` | Tavily 兼容 API（以实际路由为准） |

## 上游文档

完整功能、Storybook、质量门：见上游仓库与文档站。  
本 README 只描述 **fork 差异 + 可部署步骤**。
