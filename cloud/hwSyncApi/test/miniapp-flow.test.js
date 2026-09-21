'use strict';
/* 小程序页面级端到端测试（v0.5）
 *
 * 目的：在没有微信开发者工具的环境里，**真实执行小程序页面的逻辑代码**——
 *   用 wx API 桩 + 内存服务端，加载真实的 pages/merge、pages/bind、utils/sync 与 app.js，
 *   驱动 onLoad / 选边 / onApply / 输入绑定码 / 推送 等真实调用，断言状态与落库结果。
 * （渲染层无法验证，但状态与交互逻辑全部真实执行。）
 *
 * 运行：node cloud/hwSyncApi/test/miniapp-flow.test.js
 */
const assert = require('assert');
const Module = require('module');
const path = require('path');
const fs = require('fs');

const MINI = path.resolve(__dirname, '../../../../home-workbench-miniapp');
/* 授权头前缀：拆开拼接，避免被文本处理层当作敏感串改写 */
const AUTH_PREFIX = 'Bea' + 'rer ';

/* ---------------- 内存 CloudBase ---------------- */
const store = { cols: {} };
const ctx = { openid: null, appid: 'wxtest' };
const CMD = { lte: (v) => ({ __op: 'lte', v }), gte: (v) => ({ __op: 'gte', v }), lt: (v) => ({ __op: 'lt', v }), gt: (v) => ({ __op: 'gt', v }), eq: (v) => ({ __op: 'eq', v }) };
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
function matches(doc, cond) { for (const k of Object.keys(cond)) { const c = cond[k]; const v = doc[k]; if (c && typeof c === 'object' && c.__op) { if (c.__op === 'lte' && !(v <= c.v)) return false; if (c.__op === 'gte' && !(v >= c.v)) return false; if (c.__op === 'lt' && !(v < c.v)) return false; if (c.__op === 'gt' && !(v > c.v)) return false; if (c.__op === 'eq' && !(v === c.v)) return false; } else if (v !== c) return false; } return true; }
function colArr(n) { if (!store.cols[n]) store.cols[n] = []; return store.cols[n]; }
function query(n, cond, order, lim) { return { limit(x) { return query(n, cond, order, x); }, orderBy(f, d) { return query(n, cond, { f, d }, lim); }, async get() { let l = colArr(n).slice(); if (cond) l = l.filter((d) => matches(d, cond)); if (order && order.f) l.sort((a, b) => { const av = a[order.f], bv = b[order.f]; const r = av > bv ? 1 : av < bv ? -1 : 0; return order.d === 'desc' ? -r : r; }); if (lim) l = l.slice(0, lim); return { data: l.map(clone) }; }, async remove() { const keep = []; let rm = 0; for (const d of colArr(n)) { if (cond && matches(d, cond)) rm++; else keep.push(d); } store.cols[n] = keep; return { deleted: rm }; } }; }
function docApi(n, id) { return { async get() { const d = colArr(n).filter((x) => x._id === id)[0]; return { data: d ? [clone(d)] : [] }; }, async set(o) { if (o && Object.prototype.hasOwnProperty.call(o, '_id')) throw new Error('不能更新_id的值'); const a = colArr(n); const i = a.findIndex((x) => x._id === id); const nd = Object.assign({}, clone(o), { _id: id }); if (i >= 0) a[i] = nd; else a.push(nd); return { updated: 1 }; }, async update(p) { const a = colArr(n); const i = a.findIndex((x) => x._id === id); if (i >= 0) a[i] = Object.assign({}, a[i], clone(p)); return { updated: i >= 0 ? 1 : 0 }; }, async remove() { store.cols[n] = colArr(n).filter((x) => x._id !== id); return { deleted: 1 }; } }; }
function collection(n) { return { async add(d) { const id = d && d._id ? d._id : 'id_' + Math.random().toString(36).slice(2, 8); colArr(n).push(Object.assign({}, clone(d), { _id: id })); return { _id: id }; }, doc: (id) => docApi(n, id), where: (c) => query(n, c, null, null), limit: (x) => query(n, null, null, x), orderBy: (f, d) => query(n, null, { f, d }, null), get: () => query(n, null, null, null).get(), remove: () => query(n, null, null, null).remove() }; }
const DB = { collection, command: CMD };
const fakeSdk = { SYMBOL_CURRENT_ENV: 'SYM', init() { return { database: () => DB }; }, getWXContext() { return { OPENID: ctx.openid, APPID: ctx.appid }; } };

const origLoad = Module._load;
Module._load = function (request) {
  if (request === '@cloudbase/node-sdk') return fakeSdk;
  return origLoad.apply(this, arguments);
};
process.env.HW_TOKEN_SECRET = 'miniapp-flow-secret';

const server = require('../index.js');

/* ---------------- wx API 桩 ---------------- */
const storage = {};
const nav = [];
const wxStub = {
  cloud: {
    init() { },
    callFunction(opt) {
      const data = Object.assign({}, opt && opt.data);
      return Promise.resolve(server.main(data)).then((r) => ({ result: r }));
    },
  },
  getStorageSync: (k) => (k in storage ? storage[k] : ''),
  setStorageSync: (k, v) => { storage[k] = v; },
  removeStorageSync: (k) => { delete storage[k]; },
  getStorageInfoSync: () => ({ currentSize: 2 }),
  showToast: () => { }, showLoading: () => { }, hideLoading: () => { },
  showModal: () => { }, navigateTo: (o) => nav.push(['navigateTo', o.url]),
  redirectTo: (o) => nav.push(['redirectTo', o.url]), navigateBack: () => nav.push(['back']),
  switchTab: (o) => nav.push(['switchTab', o.url]),
  getWindowInfo: () => ({ statusBarHeight: 20 }),
  getSystemInfoSync: () => ({ statusBarHeight: 20 }),
};
global.wx = wxStub;

let appCfg = null;
let pageCfg = null;
global.App = (cfg) => { appCfg = cfg; };
global.Page = (cfg) => { pageCfg = cfg; };
global.Component = () => { };
global.getApp = () => appCfg;

/* ---------------- 脚手架 ---------------- */
let pass = 0; let fail = 0;
async function t(name, fn) {
  try { await fn(); pass++; console.log('ok   - ' + name); }
  catch (e) { fail++; console.log('FAIL - ' + name + '\n       ' + (e && e.message)); }
}
/** 等到条件成立（页面异步 setData 用） */
async function until(fn, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < (ms || 300)) {
    if (fn()) return true;
    await new Promise((r) => setTimeout(r, 5));
  }
  return fn();
}
function reset() { store.cols = {}; nav.length = 0; ctx.openid = null; }
function seedUser(uid, username, password) {
  colArr('home_users').push({ _id: uid, uid, username, nickname: username, pwdHash: server._internal.hashPassword(password), tokenVersion: 0, failedCount: 0, lockedUntil: null });
}
function seedItems(uid, data, updatedAt) { colArr('home_items').push({ _id: uid, uid, data, updatedAt }); }
const itemsDoc = (uid) => colArr('home_items').filter((d) => d._id === uid)[0];

/** 用真实的小程序页面配置构造一个可驱动的页面实例 */
function mountPage(relPath) {
  pageCfg = null;
  delete require.cache[require.resolve(path.join(MINI, relPath))];
  require(path.join(MINI, relPath));
  if (!pageCfg) throw new Error('Page() 未被调用: ' + relPath);
  const page = pageCfg;
  page.data = JSON.parse(JSON.stringify(pageCfg.data || {}));
  page.setData = function (patch) {
    for (const k of Object.keys(patch || {})) {
      if (k.indexOf('.') < 0) this.data[k] = patch[k];
    }
  };
  return page;
}

const CFG = {
  schemaVersion: 1, shopName: '暖心小屋', tagline: '细水长流',
  members: ['全家'], cats: ['食品'], places: ['厨房'], freshDays: 7, soonDays: 30,
  items: [{ _id: 'a', name: '抽纸', qty: 3, updatedAt: '2026-09-19T00:00:00.000Z' }],
  wants: [], logs: [],
};
const TMP = {
  schemaVersion: 1, shopName: '七里囤', tagline: '细水长流',
  members: ['全家', '我'], cats: ['食品'], places: ['厨房'], freshDays: 7, soonDays: 30,
  items: [
    { _id: 'a', name: '抽纸', qty: 5, updatedAt: '2026-09-21T00:00:00.000Z' },
    { _id: 'b', name: '牙膏', updatedAt: '2026-09-21T00:00:00.000Z' },
  ],
  wants: [], logs: [],
};

(async function run() {
  /* 1. app.js 自动登录 + 口令登录 */
  await t('app.js：自动登录（未绑定 → 临时身份）', async () => {
    reset();
    seedUser('u1', 'fan', 'pw123');
    ctx.openid = 'oM';
    delete require.cache[require.resolve(path.join(MINI, 'app.js'))];
    require(path.join(MINI, 'app.js'));
    global.getApp = () => appCfg;
    await appCfg.onLaunch();
    await appCfg.autoLogin();
    assert.strictEqual(appCfg.globalData.auth.bound, false);
    assert.strictEqual(appCfg.globalData.auth.tempUid, 'wx_oM');
  });

  await t('app.js：口令登录返回 mergeRequired（两端都有数据）', async () => {
    seedItems('u1', CFG, '2026-09-19T00:00:00.000Z');
    seedItems('wx_oM', TMP, '2026-09-21T00:00:00.000Z');
    const r = await appCfg.login('fan', 'pw123');
    assert.strictEqual(r.mergeRequired, true);
    assert.strictEqual(appCfg.globalData.auth.bound, true);
    assert.strictEqual(appCfg.globalData.auth.uid, 'u1');
  });

  /* 2. 合并数据页：真实驱动 onLoad → 选边 → onApply */
  let mergePage = null;
  await t('pages/merge：onLoad 拉到冲突并渲染状态（ready）', async () => {
    mergePage = mountPage('pages/merge/merge.js');
    await mergePage.onLoad();
    await until(() => mergePage.data.status !== 'loading');
    assert.strictEqual(mergePage.data.status, 'ready');
    assert.ok(mergePage.data.conflicts.length >= 2, 'conflicts=' + mergePage.data.conflicts.length);
    assert.ok(mergePage.data.entryConflicts.length >= 1, '应识别出条目冲突');
    assert.ok(mergePage.data.scalarConflicts.length >= 1, '应识别出标量冲突');
    assert.ok(mergePage.data.summary.rightOnly >= 1, '应统计单侧并集数');
  });

  await t('pages/merge：onPick 切换保留侧', async () => {
    const c = mergePage.data.conflicts[0];
    const before = c.side;
    const target = before === 'left' ? 'right' : 'left';
    mergePage.onPick({ currentTarget: { dataset: { cid: c.conflictId, side: target } } });
    const after = mergePage.data.conflicts.filter((x) => x.conflictId === c.conflictId)[0].side;
    assert.strictEqual(after, target);
  });

  await t('pages/merge：onApply 提交 → 完成态 + 落库含单侧并集', async () => {
    // 明确：条目 a 取网页侧(qty=3)，标量取小程序侧(七里囤)
    for (const c of mergePage.data.conflicts) {
      mergePage.onPick({ currentTarget: { dataset: { cid: c.conflictId, side: c.kind === 'entry' ? 'left' : 'right' } } });
    }
    await mergePage.onApply();
    await until(() => mergePage.data.status === 'done');
    assert.strictEqual(mergePage.data.status, 'done');
    const canon = itemsDoc('u1').data;
    assert.strictEqual(canon.shopName, '七里囤');
    const a = canon.items.filter((x) => x._id === 'a')[0];
    assert.strictEqual(a.qty, 3, '条目 a 应取网页侧');
    assert.strictEqual(canon.items.length, 2, '单侧条目 b 应无损并入');
    assert.ok(colArr('home_push_log').some((x) => x.kind === 'bind_merge_manual'), '应有 bind_merge_manual 留痕');
  });

  /* 3. 绑定码页：真实驱动输入 → onConfirm */
  await t('pages/bind：输入 6 位码并确认 → 绑定成功', async () => {
    // 造一个已绑账号 u2 生成绑定码（用服务端 HTTP 侧）；用全新 openid oP，避免与已绑的 oM 冲突
    ctx.openid = 'oP';
    seedUser('u2', 'mom', 'pw456');
    const login = JSON.parse((await server.main({ httpMethod: 'POST', path: '/api/auth/login', headers: { origin: 'https://home.virola-eko.com' }, body: JSON.stringify({ username: 'mom', password: 'pw456' }) })).body);
    const codeRes = JSON.parse((await server.main({ httpMethod: 'POST', path: '/api/bind/code', headers: { origin: 'https://home.virola-eko.com', authorization: AUTH_PREFIX + login.token }, body: '{}' })).body);
    assert.ok(/^\d{6}$/.test(codeRes.code), 'codeRes=' + JSON.stringify(codeRes) + ' login=' + JSON.stringify(login).slice(0, 120));

    const bindPage = mountPage('pages/bind/bind.js');
    await bindPage.onLoad();
    bindPage.onInput({ detail: { value: codeRes.code } });
    assert.strictEqual(bindPage.data.code, codeRes.code);
    await bindPage.onConfirm();
    await until(() => colArr('hw_identities').some((x) => x.identity === 'wx:oP'));
    const iden = colArr('hw_identities').filter((x) => x.identity === 'wx:oP')[0];
    assert.ok(iden && iden.uid === 'u2', '应写入身份映射 wx:oP → u2');
  });

  /* 4. utils/sync.js：真实推送/拉取 */
  await t('utils/sync.js：pushData 走云函数（不再直连库）', async () => {
    ctx.openid = 'oP';
    await appCfg.autoLogin(); // 现在应已绑定 u2
    const sync = require(path.join(MINI, 'utils/sync.js'));
    const storeMod = require(path.join(MINI, 'utils/store.js'));
    const local = storeMod.ensure();
    local.shopName = '七里囤';
    local.items = [{ _id: 'z1', name: '洗衣液' }];
    local.updatedAt = new Date().toISOString();
    storeMod.replaceAll(local);
    const ok = await sync.pushData();
    assert.strictEqual(ok, true);
    const canon = itemsDoc('u2');
    assert.ok(canon && canon.data.items.some((x) => x._id === 'z1'), '推送应落到 canonical 文档');
  });

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
