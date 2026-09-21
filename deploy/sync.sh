#!/usr/bin/env bash
#
# 把静态站点同步到国内节点主机（由该机 Caddy 直接 file_server 托管）。
# 由 .cnb.yml 在 CNB 构建环境中调用：bash deploy/sync.sh
#
# 为什么单独写成脚本文件而不是内联在 YAML 里：
#   CNB 构建环境会吃掉 script 块中的续行反斜杠（"\" + 换行变成两个独立命令），
#   `tar czf - \` 这种写法会被截断成单独一行，报 "Cowardly refusing to create an empty archive"。
#   放进真实 .sh 文件由 bash 直接读取，续行语义才可靠。
#
# 依赖环境变量（全部由流水线 imports 从 CNB 密钥仓库注入）：
#   DEPLOY_HOST          目标主机地址
#   DEPLOY_USER          登录用户
#   DEPLOY_PATH          静态文件目标目录
#   DEPLOY_SSH_KEY_B64   SSH 私钥的 base64 编码（单行）

set -euo pipefail

: "${DEPLOY_HOST:?缺少 DEPLOY_HOST，请检查流水线 imports 是否生效}"
: "${DEPLOY_USER:?缺少 DEPLOY_USER}"
: "${DEPLOY_PATH:?缺少 DEPLOY_PATH}"
: "${DEPLOY_SSH_KEY_B64:?缺少 DEPLOY_SSH_KEY_B64}"

KEY="$HOME/.ssh/id_deploy"
SSH_OPTS="-i $KEY -o StrictHostKeyChecking=yes -o ConnectTimeout=20"

echo "== 1/3 准备 SSH =="
if ! command -v ssh >/dev/null 2>&1; then
  echo "构建环境缺少 ssh 客户端，尝试安装..."
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update -qq && apt-get install -y -qq openssh-client
  elif command -v apk >/dev/null 2>&1; then
    apk add --no-cache openssh-client
  else
    echo "无法自动安装 openssh-client，请更换构建镜像" >&2
    exit 1
  fi
fi

mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"
printf '%s' "$DEPLOY_SSH_KEY_B64" | base64 -d > "$KEY"
chmod 600 "$KEY"
ssh-keyscan -H "$DEPLOY_HOST" >> "$HOME/.ssh/known_hosts" 2>/dev/null || true
echo "目标：$DEPLOY_USER@$DEPLOY_HOST:$DEPLOY_PATH"

echo "== 2/3 同步文件 =="
# tar over ssh：不依赖 rsync（构建镜像不一定带），tar 与 ssh 是基线工具。
# 只打包 frontend/：cloud/（云函数源码）、docs/ 等仓库内部资产不进公网静态目录。
# 注意 tar 增量覆盖不会删除远端旧文件——目录扁平化改造后，webroot 里遗留的
# 旧版 cloud/ docs/ 副本需到主机上一次性人工清理。
# COPYFILE_DISABLE 与 --exclude=._* 是给「macOS 本地空跑」用的：
# macOS 的 tar 会产出 AppleDouble 冗余文件（._xxx）与 xattr 头，Linux 构建机上无此问题，
# 一并屏蔽可让本地预览与 CI 行为完全一致，也避免把冗余文件推到服务器。
#
# --exclude=_headers：该文件是给 Cloudflare Pages 读的缓存策略声明（Pages 原生支持），
# 与本站无关——本机的缓存策略由 Caddyfile 的 header 指令负责。不排除的话它会被当成
# 普通静态文件发布出去（webroot 里多一个无意义的 /_headers 可被访问）。
export COPYFILE_DISABLE=1
tar czf - \
  --exclude=._* \
  --exclude=_headers \
  -C frontend . \
  | ssh $SSH_OPTS "$DEPLOY_USER@$DEPLOY_HOST" \
      "mkdir -p '$DEPLOY_PATH' && tar xzf - -C '$DEPLOY_PATH'"

echo "== 3/3 校验 =="
LOCAL_SIZE=$(wc -c < frontend/index.html | tr -d ' ')
REMOTE_SIZE=$(ssh $SSH_OPTS "$DEPLOY_USER@$DEPLOY_HOST" \
  "wc -c < '$DEPLOY_PATH/index.html'" | tr -d ' ')
echo "本地 index.html：$LOCAL_SIZE 字节"
echo "远端 index.html：$REMOTE_SIZE 字节"

if [ "$LOCAL_SIZE" != "$REMOTE_SIZE" ]; then
  echo "字节数不一致，部署校验失败" >&2
  exit 1
fi

ssh $SSH_OPTS "$DEPLOY_USER@$DEPLOY_HOST" "ls -la '$DEPLOY_PATH'"
echo "部署完成，远端文件与本地一致"
