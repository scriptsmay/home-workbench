'use strict';
/* hwSyncApi v0.5 端到端集成测试（内存数据库）
 *
 * 目的：在没有 CloudBase 凭据的环境里，真实驱动 exports.main 跑完账号合并全链路：
 *   登录 → 生成绑定码 → 小程序凭口令/绑定码绑定 → 冲突预检 → 裁决合并
 *   → 留痕可倒查 → 无冲突自动并集 → 空推送护栏 → 解绑 → 迁移并集
 *
 * 做法：用 Module._load 钩子把 '@cloudbase/node-sdk' 替换为内存实现，
 * 其余（路由、鉴权、合并语义、护栏、留痕）全部走真实生产代码。
 *
 * 运行：node cloud/hwSyncApi/test/integration.test.js
 */

const assert = require('assert');
const Module = require('module');

/* ---------------- 内存 CloudBase 模拟 ---------------- */
const store = { cols: {} };
const ctx = { openid: null, appid: 'wxtest' };
const CMD = {
  lte: (v) => ({ __op: 'lte', v }),
  gte: (v) => ({ __op: 'gte', v }),
  lt: (v) => ({ __op: 'lt', v }),
  gt: (v) => ({ __op: 'gt', v }),
  eq: (v) => ({ __op: 'eq', v }),
};
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
function matches(doc, cond) {
  for (const k of Object.keys(cond)) {
    const c = cond[k];
    const v = doc[k];
    if (c && typeof c === 'object' && c.__op) {
      if (c.__op === 'lte' && !(v <= c.v)) return false;
      if (c.__op === 'gte' && !(v >= c.v)) return false;
      if (c.__op === 'lt' && !(v < c.v)) return false;
      if (c.__op === 'gt' && !(v > c.v)) return false;
      if (c.__op === 'eq' && !(v === c.v)) return false;
    } else if (v !== c) return false;
  }
  return true;
}
function colArr(name) { if (!store.cols[name]) store.cols[name] = []; return store.cols[name]; }
function query(name, cond, order, lim) {
  return {
    limit(n) { return query(name, cond, order, n); },
    orderBy(f, dir) { return query(name, cond, { f, dir }, lim); },
    async get() {
      let list = colArr(name).slice();
      if (cond) list = list.filter((d) => matches(d, cond));
      if (order && order.f) {
        list.sort((a, b) => {
          const av = a[order.f]; const bv = b[order.f];
          const r = av > bv ? 1 : av < bv ? -1 : 0;
          return order.dir === 'desc' ? -r : r;
        });
      }
      if (lim) list = list.slice(0, lim);
      return { data: list.map(clone) };
    },
    async remove() {
      const keep = [];
      let removed = 0;
      for (const d of colArr(name)) { if (cond && matches(d, cond)) removed++; else keep.push(d); }
      store.cols[name] = keep;
      return { deleted: removed };
    },
  };
}
function docApi(name, id) {
  return {
    async get() {
      const d = colArr(name).filter((x) => x._id === id)[0];
      return { data: d ? [clone(d)] : [] };
    },
    async set(obj) {
      const arr = colArr(name);
      const i = arr.findIndex((x) => x._id === id);
      const nd = Object.assign({}, clone(obj), { _id: id });
      if (i >= 0) arr[i] = nd; else arr.push(nd);
      return { updated: 1 };
    },
    async update(patch) {
      const arr = colArr(name);
      const i = arr.findIndex((x) => x._id === id);
      if (i >= 0) arr[i] = Object.assign({}, arr[i], clone(patch));
      return { updated: i >= 0 ? 1 : 0 };
    },
    async remove() {
      store.cols[name] = colArr(name).filter((x) => x._id !== id);
      return { deleted: 1 };
    },
  };
}
function collection(name) {
  return {
    async add(d) {
      const _id = d && d._id ? d._id : 'id_' + Math.random().toString(36).slice(2, 10);
      colArr(name).push(Object.assign({}, clone(d), { _id }));
      return { _id };
    },
    doc: (id) => docApi(name, id),
    where: (cond) => query(name, cond, null, null),
    limit: (n) => query(name, null, null, n),
    orderBy: (f, dir) => query(name, null, { f, dir }, null),
    get: () => query(name, null, null, null).get(),
    remove: () => query(name, null, null, null).remove(),
  };
}
const DB = { collection, command: CMD };
const fakeSdk = {
  SYMBOL_CURRENT_ENV: 'SYM',
  init() { return { database: () => DB }; },
  getWXContext() { return { OPENID: ctx.openid, APPID: ctx.appid }; },
};
const origLoad = Module._load;
Module._load = function (request) {
  if (request === '@cloudbase/node-sdk') return fakeSdk;
  return origLoad.apply(this, arguments);
};

process.env.HW_TOKEN_SECRET = process.env.HW_TOKEN_SECRET || 'integration-secret';
const { main, _internal: I } = require('../index.js');

/* ---------------- 测试脚手架 ---------------- */
let pass = 0; let fail = 0;
const results = [];
async function t(name, fn) {
  try { await fn(); pass++; results.push('ok   - ' + name); }
  catch (e) { fail++; results.push('FAIL - ' + name + '\n       ' + (e && e.message)); }
}
function reset() {
  store.cols = {};
  ctx.openid = null;
}
function seedUser(uid, username, password, nickname) {
  colArr('home_users').push({
    _id: uid, uid, username, nickname: nickname || username,
    pwdHash: I.hashPassword(password), tokenVersion: 0, failedCount: 0, lockedUntil: null,
    createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
  });
}
function seedItems(uid, data, updatedAt) {
  colArr('home_items').push({ _id: uid, uid, data, updatedAt });
}
const parse = (res) => (res && res.body != null ? JSON.parse(res.body) : res);
function http(path, body, token) {
  return main({
    httpMethod: 'POST', path,
    headers: token
      ? { origin: 'https://home.virola-eko.com', authorization: 'Bearer ' + token }
      : { origin: 'https://home.virola-eko.com' },
    body: JSON.stringify(body || {}),
  }).then(parse);
}
const mp = (action, extra) => main(Object.assign({ action }, extra || {}));
const itemsDoc = (uid) => colArr('home_items').filter((d) => d._id === uid)[0];

/* ---------------- 场景 ---------------- */
(async function run() {
  /* 1. Web 登录 + 生成绑定码 */
  await t('HTTP: 登录成功并签发 token', async () => {
    reset();
    seedUser('u1', 'fan', 'pw123', '饭饭');
    const r = await http('/api/auth/login', { username: 'fan', password: 'pw123' });
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    assert.ok(r.token && r.uid === 'u1');
    ctx._token = r.token;
  });

  await t('HTTP: 口令错误 → invalid_credentials', async () => {
    const r = await http('/api/auth/login', { username: 'fan', password: 'bad' });
    assert.strictEqual(r.error.code, 'invalid_credentials');
  });

  await t('HTTP: 生成 6 位绑定码', async () => {
    const r = await http('/api/bind/code', {}, ctx._token);
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    assert.ok(/^\d{6}$/.test(r.code), 'code=' + r.code);
    ctx._code = r.code;
  });

  await t('HTTP: 未带 token 访问绑定接口 → unauthorized', async () => {
    const r = await http('/api/bind/identities', {}, '');
    assert.strictEqual(r.error.code, 'unauthorized');
  });

  await t('HTTP: 未知路由 → not_found', async () => {
    const r = await http('/api/nope', {}, ctx._token);
    assert.strictEqual(r.error.code, 'not_found');
  });

  /* 2. 小程序凭口令绑定（无临时数据） */
  await t('MP: 未绑定时 mpLogin 返回临时身份', async () => {
    ctx.openid = 'oA';
    const r = await mp('mpLogin');
    assert.strictEqual(r.bound, false);
    assert.strictEqual(r.tempUid, 'wx_oA');
  });

  await t('MP: 凭口令登录 → 建立映射、无需合并', async () => {
    ctx.openid = 'oA';
    const r = await mp('mpLoginPassword', { username: 'fan', password: 'pw123' });
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    assert.strictEqual(r.uid, 'u1');
    assert.strictEqual(r.mergeRequired, false);
    const iden = colArr('hw_identities')[0];
    assert.strictEqual(iden.identity, 'wx:oA');
    assert.strictEqual(iden.uid, 'u1');
    assert.strictEqual(iden.mergePending, false);
  });

  await t('HTTP: 已关联身份列表返回 1 条', async () => {
    const r = await http('/api/bind/identities', {}, ctx._token);
    assert.strictEqual(r.identities.length, 1);
    assert.strictEqual(r.identities[0].identity, 'wx:oA');
    ctx._identityId = r.identities[0].identityId;
  });

  await t('MP: 错误口令 → invalid_credentials；且锁定计数递增', async () => {
    ctx.openid = 'oA';
    const r = await mp('mpLoginPassword', { username: 'fan', password: 'nope' });
    assert.strictEqual(r.error.code, 'invalid_credentials');
    assert.strictEqual(colArr('home_users')[0].failedCount, 1);
  });

  /* 3. 冲突合并（核心） */
  await t('MP: 两侧都有数据且有冲突 → 返回冲突 diff 与票据', async () => {
    reset();
    seedUser('u1', 'fan', 'pw123', '饭饭');
    const login = await http('/api/auth/login', { username: 'fan', password: 'pw123' });
    ctx._token = login.token;
    seedItems('u1', {
      schemaVersion: 1, shopName: '暖心小屋', tagline: '细水长流',
      members: ['全家'], cats: ['食品'], places: ['厨房'], freshDays: 7, soonDays: 30,
      items: [{ _id: 'a', name: '抽纸', qty: 3, updatedAt: '2026-09-19T00:00:00.000Z' }],
      wants: [], logs: [],
    }, '2026-09-19T00:00:00.000Z');
    seedItems('wx_oB', {
      schemaVersion: 1, shopName: '七里囤', tagline: '细水长流',
      members: ['全家', '我'], cats: ['食品'], places: ['厨房'], freshDays: 7, soonDays: 30,
      items: [
        { _id: 'a', name: '抽纸', qty: 5, updatedAt: '2026-09-21T00:00:00.000Z' },
        { _id: 'b', name: '牙膏', updatedAt: '2026-09-21T00:00:00.000Z' },
      ],
      wants: [], logs: [],
    }, '2026-09-21T00:00:00.000Z');

    ctx.openid = 'oB';
    const r = await mp('mpLoginPassword', { username: 'fan', password: 'pw123' });
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    assert.strictEqual(r.mergeRequired, true);
    assert.ok(r.ticket && r.ticket.indexOf('mt.') === 0);
    const kinds = r.conflicts.map((c) => c.kind + ':' + (c.field || c.entryId));
    assert.ok(kinds.indexOf('entry:a') >= 0, '应有条目 a 冲突: ' + kinds.join(','));
    assert.ok(kinds.indexOf('scalar:shopName') >= 0, '应有 shopName 冲突: ' + kinds.join(','));
    assert.strictEqual(r.conflicts.filter((c) => c.entryId === 'b').length, 0, '单侧条目 b 不应是冲突');
    ctx._ticket = r.ticket;
    ctx._conflicts = r.conflicts;
  });

  await t('MP: mpMergeStatus 可恢复同一冲突与票据', async () => {
    ctx.openid = 'oB';
    const r = await mp('mpMergeStatus');
    assert.strictEqual(r.mergeRequired, true);
    assert.strictEqual(r.conflicts.length, ctx._conflicts.length);
    ctx._ticket2 = r.ticket;
  });

  await t('MP: 票据被篡改 → merge_ticket_invalid', async () => {
    ctx.openid = 'oB';
    const bad = ctx._ticket2.split('.');
    const forged = bad[0] + '.' + Buffer.from('{"k":"merge","identityId":"x","uid":"u1","tempUid":"wx_oB","exp":9999999999999}').toString('base64url') + '.' + bad[2];
    const r = await mp('mpMergeApply', { ticket: forged, choices: [] });
    assert.strictEqual(r.error.code, 'merge_ticket_invalid');
  });

  await t('MP: 按用户选择裁决 → 生成合并数据集', async () => {
    ctx.openid = 'oB';
    const entry = ctx._conflicts.filter((c) => c.kind === 'entry')[0];
    const scalar = ctx._conflicts.filter((c) => c.kind === 'scalar')[0];
    const choices = [
      { conflictId: entry.conflictId, side: 'left' },   // 条目 a 取网页侧 qty=3
      { conflictId: scalar.conflictId, side: 'right' }, // shopName 取小程序侧 七里囤
    ];
    const r = await mp('mpMergeApply', { ticket: ctx._ticket, choices });
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    assert.strictEqual(r.data.shopName, '七里囤');
    const a = r.data.items.filter((x) => x._id === 'a')[0];
    const b = r.data.items.filter((x) => x._id === 'b')[0];
    assert.strictEqual(a.qty, 3, '条目 a 应取网页侧');
    assert.ok(b, '单侧条目 b 应被无损并入');
    assert.deepStrictEqual(r.data.members, ['全家', '我'], '配置数组取并集');
  });

  await t('MP: 合并后 canonical 文档落库、临时文档标记 mergedInto', async () => {
    const canon = itemsDoc('u1');
    assert.strictEqual(canon.data.shopName, '七里囤');
    assert.strictEqual(canon.data.items.length, 2);
    const temp = itemsDoc('wx_oB');
    assert.strictEqual(temp.mergedInto, 'u1');
    assert.ok(canon.prevData, '应有覆盖前深备份');
  });

  await t('留痕可倒查：home_push_log 出现 bind_merge_manual（含双方指纹与选择）', async () => {
    const logs = colArr('home_push_log').filter((x) => x.kind === 'bind_merge_manual');
    assert.ok(logs.length >= 1, '应有 bind_merge_manual 记录');
    const l = logs[0];
    assert.ok(l.leftFp && l.rightFp && l.resultFp, '应含双方与结果指纹');
    assert.ok(Array.isArray(l.choices) && l.choices.length === 2, '应记录用户选择');
    assert.strictEqual(l.uid, 'u1');
    assert.strictEqual(l.tempUid, 'wx_oB');
  });

  await t('MP: 合并后 mergePending 清零，mpLogin 免登录返回 canonical uid', async () => {
    ctx.openid = 'oB';
    const r = await mp('mpLogin');
    assert.strictEqual(r.bound, true);
    assert.strictEqual(r.uid, 'u1');
  });

  /* 4. 无冲突 → 服务端自动并集 */
  await t('MP: 有临时数据但无冲突 → 服务端自动并集（不必进合并页）', async () => {
    reset();
    seedUser('u1', 'fan', 'pw123', '饭饭');
    ctx._token = (await http('/api/auth/login', { username: 'fan', password: 'pw123' })).token;
    seedItems('u1', { schemaVersion: 1, shopName: '暖心小屋', items: [{ _id: 'a', name: '抽纸' }], wants: [], logs: [], members: ['全家'], cats: [], places: [] }, '2026-09-19T00:00:00.000Z');
    seedItems('wx_oC', { schemaVersion: 1, shopName: '暖心小屋', items: [{ _id: 'b', name: '牙膏' }], wants: [], logs: [], members: ['全家'], cats: [], places: [] }, '2026-09-20T00:00:00.000Z');
    ctx.openid = 'oC';
    const r = await mp('mpLoginPassword', { username: 'fan', password: 'pw123' });
    assert.strictEqual(r.mergeRequired, false);
    assert.strictEqual(r.merged, true);
    const canon = itemsDoc('u1');
    assert.strictEqual(canon.data.items.length, 2, '并集应含 a 与 b');
    const iden = colArr('hw_identities')[0];
    assert.strictEqual(iden.mergePending, false, 'mergePending 应清零');
    assert.ok(colArr('home_push_log').some((x) => x.kind === 'bind_merge'), '应留 bind_merge 记录');
  });

  /* 5. 空推送护栏 */
  await t('MP: 空数据推送被拦（strippedEmptyPush），云端不被清空', async () => {
    ctx.openid = 'oC';
    const r = await mp('push', { data: { schemaVersion: 1, items: [], wants: [], logs: [] }, updatedAt: new Date().toISOString() });
    assert.strictEqual(r.strippedEmptyPush, true);
    assert.strictEqual(itemsDoc('u1').data.items.length, 2, '云端数据未被清空');
  });

  await t('MP: 正常推送落入 canonical 文档（顶层 updatedAt 即可推进）', async () => {
    ctx.openid = 'oC';
    const data = { schemaVersion: 1, shopName: '七里囤', items: [{ _id: 'a', name: '抽纸' }, { _id: 'b', name: '牙膏' }, { _id: 'c', name: '洗衣液' }], wants: [], logs: [], members: ['全家'], cats: [], places: [] };
    const r = await mp('push', { data, updatedAt: new Date().toISOString() });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.data.items.length, 3, '顶层 updatedAt 补位后应完整接收 incoming 数组');
    assert.strictEqual(itemsDoc('u1').data.items.length, 3);
  });

  await t('MP: data.updatedAt 缺省时不会静默丢弃（回归护栏）', async () => {
    ctx.openid = 'oC';
    await new Promise((r) => setTimeout(r, 8)); // 确保本次推送时间戳严格晚于上一次
    const data = { schemaVersion: 1, shopName: '暖心小屋', items: [{ _id: 'a', name: '抽纸' }], wants: [], logs: [], members: [], cats: [], places: [] };
    const r = await mp('push', { data, updatedAt: new Date().toISOString() });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(itemsDoc('u1').data.items.length, 1, '应替换为 incoming 的 1 条');
  });

  /* 6. 解绑 */
  await t('HTTP: 解绑后小程序回到临时身份，账号数据保留', async () => {
    const list = await http('/api/bind/identities', {}, ctx._token);
    assert.strictEqual(list.identities.length, 1);
    const rv = await http('/api/bind/revoke', { identityId: list.identities[0].identityId }, ctx._token);
    assert.strictEqual(rv.ok, true);
    assert.strictEqual(colArr('hw_identities').length, 0);
    ctx.openid = 'oC';
    const r = await mp('mpLogin');
    assert.strictEqual(r.bound, false, '解绑后回到临时身份');
    assert.ok(itemsDoc('u1'), '账号侧数据仍在');
  });

  /* 7. 迁移并集 */
  await t('迁移：unionState 对同名 id 去重、单侧保留、配置数组并集', async () => {
    const mig = require('../../scripts/migrate-home-items-ids.js');
    const left = { items: [{ _id: 'a', name: '抽纸' }], wants: [], logs: [], members: ['全家'], cats: [], places: [], schemaVersion: 1 };
    const right = { items: [{ _id: 'a', name: '抽纸' }, { _id: 'b', name: '牙膏' }], wants: [], logs: [], members: ['我'], cats: [], places: [], schemaVersion: 1 };
    const m = mig.unionState(left, right);
    assert.deepStrictEqual(m.items.map((x) => x._id), ['a', 'b']);
    assert.deepStrictEqual(m.members, ['全家', '我']);
  });

  results.forEach((r) => console.log(r));
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
