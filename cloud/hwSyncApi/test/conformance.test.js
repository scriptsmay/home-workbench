'use strict';
/* 跨仓契约一致性检查（v0.5）
 *
 * 解决一个只能靠「真机 + 云环境」才发现、但这里可以静态证明的问题：
 *   两端客户端调用的 action / 端点，服务端是否真的实现？
 *   （历史上正是这类漂移：小程序查的集合名与 Web 端实际用的不一致，绑定链路整条坏掉。）
 *
 * 检查项：
 *   1. 小程序 callFunction 的 action ⊂ 服务端 dispatchMp 的 case 列表
 *   2. Web 端 apiPost 的路径 ⊂ 服务端 route() 定义的路由
 *   3. 小程序侧不存在 home_items 客户端直连写
 *   4. Web 端不存在已删除的占位函数引用
 *
 * 运行：node cloud/hwSyncApi/test/conformance.test.js
 */
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '../../..');                       // home-workbench
const MINI = path.resolve(__dirname, '../../../../home-workbench-miniapp'); // 同级仓

let pass = 0; let fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('ok   - ' + name); }
  catch (e) { fail++; console.log('FAIL - ' + name + '\n       ' + (e && e.message)); }
}
function readIf(p) { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return null; } }
function walk(dir, filter) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) out.push(...walk(p, filter));
    else if (filter(p)) out.push(p);
  }
  return out;
}

const serverSrc = readIf(path.join(REPO, 'cloud/hwSyncApi/index.js'));
const webSrc = readIf(path.join(REPO, 'frontend/app.js'));

/* ---- 服务端定义的 action 与路由 ---- */
const serverActions = new Set(
  [...(serverSrc || '').matchAll(/case '([a-zA-Z]+)':/g)].map((m) => m[1]),
);
const serverRoutes = new Set(
  [...(serverSrc || '').matchAll(/return '([a-z_]+)';\s*\n/g)].map((m) => m[1]),
);

/* ---- 客户端实际调用 ---- */
const miniFiles = walk(MINI, (p) => /\.js$/.test(p) && !/node_modules/.test(p));
const miniActions = new Set();
for (const f of miniFiles) {
  const s = fs.readFileSync(f, 'utf8');
  for (const m of s.matchAll(/call(?:Fn)?\(\s*'([a-zA-Z]+)'/g)) miniActions.add(m[1]);
}
const webEndpoints = new Set(
  [...(webSrc || '').matchAll(/apiPost\(\s*'([^']+)'/g)].map((m) => m[1]),
);

console.log('服务端 actions:', [...serverActions].sort().join(', '));
console.log('小程序调用 actions:', [...miniActions].sort().join(', '));
console.log('Web 端 apiPost 路径:', [...webEndpoints].sort().join(', '));
console.log('服务端 route 名:', [...serverRoutes].sort().join(', '));
console.log('');

t('小程序调用的每个 action 服务端都有实现', () => {
  const missing = [...miniActions].filter((a) => !serverActions.has(a));
  if (missing.length) throw new Error('服务端缺少 action: ' + missing.join(', '));
  if (!miniActions.size) throw new Error('未从小程序源码中解析到任何 action 调用');
});

t('Web 端调用的每个端点服务端都有路由', () => {
  const map = {
    '/auth/login': 'login',
    '/sync/pull': 'pull',
    '/sync/push': 'push',
    '/bind/code': 'bind_code',
    '/bind/identities': 'bind_identities',
    '/bind/revoke': 'bind_revoke',
    '/bind/merge/pending': 'bind_merge_pending',
    '/bind/merge/apply': 'bind_merge_apply',
  };
  const missing = [];
  for (const ep of webEndpoints) {
    const name = map[ep];
    if (!name || !serverRoutes.has(name)) missing.push(ep);
  }
  if (missing.length) throw new Error('服务端缺少路由: ' + missing.join(', '));
  if (!webEndpoints.size) throw new Error('未从 Web 源码中解析到任何 apiPost 调用');
});

t('小程序侧无 home_items 客户端直连写（注释除外）', () => {
  const hits = [];
  for (const f of miniFiles) {
    const lines = fs.readFileSync(f, 'utf8').split('\n');
    lines.forEach((l, i) => {
      if (/db\.collection\(\s*'home_items'\s*\)|collection\(\s*'home_items'\s*\)/.test(l) && !/^\s*(\/\/|\*)/.test(l)) {
        hits.push(path.relative(REPO, f) + ':' + (i + 1));
      }
    });
  }
  if (hits.length) throw new Error('仍存在直连写：' + hits.join(', '));
});

t('Web 端无遗留占位（bindOpenId / mergeAccounts）', () => {
  const bad = ['bindOpenId', 'mergeAccounts'].filter((n) => (webSrc || '').includes(n));
  if (bad.length) throw new Error('仍引用：' + bad.join(', '));
});

t('两端账号合并入口齐备（生成码/输入码/合并页）', () => {
  const needWeb = ['genBindCodeBtn', 'mergeResolveBtn', 'mergeUnionAll', 'data-revoke'];
  for (const n of needWeb) if (!(webSrc || '').includes(n)) throw new Error('Web 缺少 ' + n);
  const mergeSrc = readIf(path.join(MINI, 'pages/merge/merge.js')) || '';
  const bindSrc = readIf(path.join(MINI, 'pages/bind/bind.js')) || '';
  if (!/mpMergeStatus/.test(mergeSrc) || !/mpMergeApply/.test(mergeSrc)) throw new Error('合并页未接 mpMergeStatus/mpMergeApply');
  if (!/bindByCode|app\.bindByCode/.test(bindSrc)) throw new Error('绑定码页未接 bindByCode');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
