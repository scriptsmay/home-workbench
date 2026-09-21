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
| `.cnb.yml` | 作者自用的部署流水线：推送 `main`（或手动 `api_trigger`）时调用 `deploy/sync.sh` |
| `deploy/sync.sh` | 部署脚本本体：只打包 `frontend/`，tar over ssh 同步后做字节数校验；主机信息均由 CI 密钥注入，仓库内不含任何主机信息 |
| `docs/` | 设计与 API 文档，仅存仓库，不发布 |

## 部署

`frontend/` 是纯静态目录（站内全部相对引用），托管到任意静态站点平台即可：
把站点根目录指向 `frontend/`（无构建命令），本地预览与线上行为一致。

仓库附带的 `.cnb.yml` 与 `deploy/sync.sh` 是作者自用的部署配置（CI 密钥注入 +
tar over ssh 同步到自建主机），可作参考；目标主机、域名与托管平台的选择不属于
本仓库的文档范围，生产环境的部署细节由部署者自行维护。

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

## v0.5 账号合并（Web ↔ 微信小程序）

- **入口**：站点「我的」→「微信小程序」卡片（生成 6 位绑定码 / 已关联身份列表 / 解绑）。
- **冲突解决**：绑定发现真冲突时弹出「合并数据」表单；**只列真冲突**，并集默认全选，可「全部保留并集（按较新）」一键兜底。
- **本地预览**：cd frontend && python -m http.server 8080（ile:// 下云功能自动关闭，纯本地可用）。
- **改动位置**：
  - 文案与错误码映射：rontend/app.js 的 BIND_ERR_TEXT、wechatCardHtml()、enderMergeBody()
  - 接口地址：rontend/app.js 顶部 API_BASE
  - 颜色 / 圆角 / 阴影：只改 rontend/style.css 的 :root 语义 token（新界面零新增色值）
  - 契约与端点：docs/v0.5-api-design.md
- **服务端**：cloud/hwSyncApi/index.js（HTTP + callFunction 双入口）；测试 
ode cloud/hwSyncApi/test/*.test.js（共 59 项）。
- **发布顺序**：建集合 → 部署云函数 → 跑 cloud/scripts/migrate-home-items-ids.js → 前端上线 → 小程序发版（须晚于服务端）。
