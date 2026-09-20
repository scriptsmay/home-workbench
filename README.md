# home-workbench

家庭用品工作台（「暖心小屋」）的 Web 端源码。

纯静态前端（`frontend/`，零构建、零依赖），数据保存在浏览器 `localStorage`；
可选开启云端同步——同步 API 由 `cloud/hwSyncApi` 云函数提供，前端只依赖一个
HTTP 端点（`API_BASE`），不接入任何厂商 SDK。

## 目录

| 路径 | 说明 |
|---|---|
| `frontend/` | **站点本体**：`index.html` + `app.js` + `style.css` + `favicon.svg`，全部相对引用，整目录即静态站点输出 |
| `cloud/hwSyncApi/` | CloudBase 云函数：登录 / pull / push HTTP API（密钥走函数环境变量，不入库） |
| `cloud/scripts/` | 运维脚本（账号发号等管理员工具） |
| `.cnb.yml` | CNB 流水线：推送 `main`（或手动 `api_trigger`）时调用 `deploy/sync.sh` |
| `deploy/sync.sh` | 部署脚本本体：准备 SSH → 只打包 `frontend/` tar over ssh 同步 → 字节数校验 |
| `deploy/caddy/site.caddy` | 托管该站点的 Caddy 站点块（服务器侧配置参考与幂等应用源） |
| `docs/` | 设计与 API 文档，仅存仓库，不发布 |

## 部署

同一份源码，两条静态托管通道 + 一个同步后端：

- **国内节点（主）**：`.cnb.yml` 在 `main` 分支推送时把 `frontend/` 同步到目标主机，
  由该机 Caddy `file_server` 托管。主机地址、登录用户、目标目录、SSH 私钥全部来自
  CNB **密钥仓库**，通过流水线 `imports` 注入 —— **本仓库不硬编码任何主机信息**。
- **海外镜像（备）**：GitHub 仓库 → Cloudflare Pages 项目 `home-workbench`
  （域名 `home-workbench.pages.dev` 与自定义域），**已绑定 Git 集成**：
  推送 `main` 即自动构建部署（Production branch `main`、无构建命令、
  Output directory = `frontend`）。排障或需要脱离 Git 手动发布时：
  `wrangler pages deploy frontend --project-name home-workbench`。
- **同步后端**：CloudBase 云函数 `hwSyncApi`（独立于静态托管，见「云端环境」）。

> 历史勘误：本版曾长期在文档里写作「GitHub 接入 Vercel，推送即部署」，与实际不符
> （实际镜像一直是 Cloudflare Pages Direct Upload），Vercel 从未参与线上发布。

## 本地预览

```bash
cd frontend && python3 -m http.server 8080
```

或直接双击 `frontend/index.html`（`file://` 下自动降级为纯本地模式，不发云端请求）。

## 数据说明

站点数据存于浏览器 `localStorage`，**与托管平台完全无关** —— 换平台不影响任何已录入数据。
设置页提供 JSON 备份 / 导入与 CSV 导出（CSV 带 UTF-8 BOM，Excel 与 WPS 打开中文不乱码）。
登录云端账号后，本地数据按字段级合并策略与云副本双向同步；云端仅为**可重建的同步副本**。

## 云端环境

- 同步 API 基础地址在前端以 `API_BASE` 常量配置（`frontend/app.js`）。
- 云函数部署与集合结构见 `docs/v0.4-api-design.md`；函数密钥（token 签名秘密）
  只存在云函数环境变量中，绝不出现在仓库或前端代码里。

## 浏览器兼容说明

- 依赖 `localStorage`（Safari 无痕模式下不可用，普通模式正常）
- 前端零 CDN、零第三方脚本依赖，离线可用（云同步除外）
