# home-workbench

家庭用品工作台（「暖心小屋」）的静态站点源码。

单文件、零依赖、零后端的纯静态站：`index.html` 内含全部结构、样式与逻辑，
数据保存在浏览器 `localStorage`，不需要任何服务端。

## 目录

| 路径 | 说明 |
|---|---|
| `index.html` | 站点本体。单文件，含内联 favicon，双击即可运行 |
| `favicon.svg` | favicon 源文件（同时以 data URI 内联在 `index.html` 的 `<head>`） |
| `.cnb.yml` | CNB 流水线：推送 `main`（或手动 `api_trigger`）时调用 `deploy/sync.sh` |
| `deploy/sync.sh` | 部署脚本本体：准备 SSH → tar over ssh 同步 → 字节数校验 |
| `deploy/caddy/site.caddy` | 托管该站点的 Caddy 站点块（服务器侧配置参考与幂等应用源） |

## 部署

两条独立通道，同一份源码：

- **国内节点（主）**：`.cnb.yml` 在 `main` 分支推送时把静态文件同步到目标主机，
  由该机 Caddy 直接 `file_server` 托管。主机地址、登录用户、目标目录、SSH 私钥
  全部来自 CNB **密钥仓库**，通过流水线 `imports` 注入 —— **本仓库不硬编码任何主机信息**。
- **海外镜像（备）**：GitHub 仓库接入 Vercel，推送即自动构建部署。

## 本地预览

直接双击 `index.html`；或起一个本地静态服务：

```bash
python3 -m http.server 8080
```

## 数据说明

站点数据存于浏览器 `localStorage`，**与托管平台完全无关** —— 换平台不影响任何已录入数据。
设置页提供 JSON 备份 / 导入与 CSV 导出（CSV 带 UTF-8 BOM，Excel 与 WPS 打开中文不乱码）。

## 浏览器兼容说明

- 依赖 `localStorage`（Safari 无痕模式下不可用，普通模式正常）
- 单文件无外部请求、无 CDN 依赖，离线可用
