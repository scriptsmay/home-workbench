'use strict';
/* hwSyncApi v0.5 单测：合并语义（mergeFields 回归 + bindMerge 契约）
 * 运行：node cloud/hwSyncApi/test/bindMerge.test.js
 * 纯逻辑测试，不依赖 @cloudbase/node-sdk 与云环境。 */
const assert = require('assert');
const { _internal } = require('../index.js');
const { bindMerge, applyChoices, mergeFields, businessEmpty } = _internal;

let pass = 0;
let fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('ok   -', name); }
  catch (e) { fail++; console.error('FAIL -', name); console.error('       ' + (e && e.message)); }
}

/* ---------- mergeFields 回归（v0.4 行为不得改变） ---------- */

t('mergeFields: 非空优先（incoming null 不清空 base）', () => {
  const base = { shopName: '暖心小屋', items: [{ _id: 'a' }] };
  const incoming = { shopName: null, items: [{ _id: 'a' }] };
  const out = mergeFields(base, incoming);
  assert.strictEqual(out.shopName, '暖心小屋');
});

t('mergeFields: 时间戳新者胜（数组整键替换）', () => {
  const base = { items: [{ _id: 'a', name: '旧' }], updatedAt: '2026-01-01T00:00:00.000Z' };
  const incoming = { items: [{ _id: 'a', name: '新' }], updatedAt: '2026-02-01T00:00:00.000Z' };
  const out = mergeFields(base, incoming);
  assert.strictEqual(out.items[0].name, '新');
});

t('mergeFields: 客户端时钟前移被钳制（晚于服务器 now 的时间戳不给予胜出权）', () => {
  const base = { items: [{ _id: 'a', name: '云端真数据' }], updatedAt: new Date().toISOString() };
  const incoming = { items: [{ _id: 'a', name: '被伪造的新数据' }], updatedAt: '2030-01-01T00:00:00.000Z' };
  const out = mergeFields(base, incoming);
  assert.strictEqual(out.items[0].name, '云端真数据');
});

t('businessEmpty: 三表全空才算空（ui/时间戳不算业务数据）', () => {
  assert.strictEqual(businessEmpty({ items: [], wants: [], logs: [], ui: { x: 1 }, updatedAt: '2026-01-01' }), true);
  assert.strictEqual(businessEmpty({ items: [{ _id: 'a' }], wants: [], logs: [] }), false);
});

/* ---------- bindMerge：无损并集 ---------- */

const mkEntry = (id, name, extra) => Object.assign({ _id: id, name, updatedAt: '2026-09-20T00:00:00.000Z' }, extra || {});

t('bindMerge: 仅单侧存在的条目 → 无损并入，不产生冲突', () => {
  const left = { items: [mkEntry('w1', '抽纸'), mkEntry('w2', '洗衣液')], wants: [], logs: [] };
  const right = { items: [mkEntry('w3', '牙膏')], wants: [], logs: [] };
  const r = bindMerge(left, right, { leftTime: 1000, rightTime: 2000 });
  assert.strictEqual(r.conflicts.length, 0);
  assert.strictEqual(r.merged.items.length, 3);
  assert.deepStrictEqual(r.merged.items.map((x) => x._id), ['w1', 'w2', 'w3']);
  assert.strictEqual(r.summary.leftOnly, 2);
  assert.strictEqual(r.summary.rightOnly, 1);
});

t('bindMerge: 同 id 同内容 → 不算冲突', () => {
  const e = mkEntry('w1', '抽纸', { qty: 3 });
  const r = bindMerge({ items: [e], wants: [], logs: [] }, { items: [JSON.parse(JSON.stringify(e))], wants: [], logs: [] }, {});
  assert.strictEqual(r.conflicts.length, 0);
  assert.strictEqual(r.merged.items.length, 1);
});

t('bindMerge: 同 id 内容不同 → 真冲突，默认较新时间戳一侧', () => {
  const left = { items: [{ _id: 'w1', name: '抽纸', qty: 3, updatedAt: '2026-09-19T00:00:00.000Z' }], wants: [], logs: [] };
  const right = { items: [{ _id: 'w1', name: '抽纸', qty: 5, updatedAt: '2026-09-21T00:00:00.000Z' }], wants: [], logs: [] };
  const r = bindMerge(left, right, { leftTime: 1000, rightTime: 2000 });
  assert.strictEqual(r.conflicts.length, 1);
  const c = r.conflicts[0];
  assert.strictEqual(c.kind, 'entry');
  assert.strictEqual(c.collection, 'items');
  assert.strictEqual(c.entryId, 'w1');
  assert.strictEqual(c.defaultSide, 'right'); // right 更新
  assert.strictEqual(c.fieldDiff.some((d) => d.field === 'qty'), true);
});

t('bindMerge: 标量分歧 → 真冲突（shopName 七里囤 vs 暖心小屋）', () => {
  const left = { shopName: '暖心小屋', tagline: '细水长流', items: [], wants: [], logs: [] };
  const right = { shopName: '七里囤', tagline: '细水长流', items: [], wants: [], logs: [] };
  const r = bindMerge(left, right, { leftTime: 1000, rightTime: 2000 });
  const c = r.conflicts.find((x) => x.field === 'shopName');
  assert.ok(c, '应有 shopName 冲突');
  assert.strictEqual(c.kind, 'scalar');
  assert.strictEqual(c.left.value, '暖心小屋');
  assert.strictEqual(c.right.value, '七里囤');
  assert.strictEqual(c.defaultSide, 'right');
  assert.strictEqual(r.conflicts.some((x) => x.field === 'tagline'), false, '一致字段不算冲突');
});

t('bindMerge: 配置数组 → 并集且去重（左序在前）', () => {
  const left = { members: ['全家', '我'], cats: ['食品'], places: ['厨房'], items: [], wants: [], logs: [] };
  const right = { members: ['我', '孩子'], cats: ['食品', '日用'], places: [], items: [], wants: [], logs: [] };
  const r = bindMerge(left, right, {});
  assert.deepStrictEqual(r.merged.members, ['全家', '我', '孩子']);
  assert.deepStrictEqual(r.merged.cats, ['食品', '日用']);
  assert.deepStrictEqual(r.merged.places, ['厨房']);
});

t('bindMerge: schemaVersion 取较大值', () => {
  const r = bindMerge({ schemaVersion: 1, items: [], wants: [], logs: [] }, { schemaVersion: 2, items: [], wants: [], logs: [] }, {});
  assert.strictEqual(r.merged.schemaVersion, 2);
});

t('bindMerge: 三张集合相互独立（wants/logs 冲突各自成项）', () => {
  const left = { items: [], wants: [{ _id: 'b1', name: '牙膏', note: 'a', updatedAt: '2026-09-19' }], logs: [], };
  const right = { items: [], wants: [{ _id: 'b1', name: '牙膏', note: 'b', updatedAt: '2026-09-20' }], logs: [], };
  const r = bindMerge(left, right, {});
  assert.strictEqual(r.conflicts.length, 1);
  assert.strictEqual(r.conflicts[0].collection, 'wants');
});

t('bindMerge: 空 x 非空 → 全量保留非空侧（无冲突）', () => {
  const left = { items: [], wants: [], logs: [] };
  const right = { items: [mkEntry('w1', '抽纸')], wants: [], logs: [] };
  const r = bindMerge(left, right, {});
  assert.strictEqual(r.conflicts.length, 0);
  assert.strictEqual(r.merged.items.length, 1);
});

/* ---------- applyChoices：用户裁决覆盖默认 ---------- */

t('applyChoices: 用户选择覆盖默认侧（条目）', () => {
  const left = { items: [{ _id: 'w1', name: '抽纸', qty: 3, updatedAt: '2026-09-19' }], wants: [], logs: [] };
  const right = { items: [{ _id: 'w1', name: '抽纸', qty: 5, updatedAt: '2026-09-21' }], wants: [], logs: [] };
  const r = bindMerge(left, right, { leftTime: 1000, rightTime: 2000 });
  assert.strictEqual(r.merged.items[0].qty, 5); // 默认较新（right）
  applyChoices(r.merged, r.conflicts, [{ conflictId: r.conflicts[0].conflictId, side: 'left' }]);
  assert.strictEqual(r.merged.items[0].qty, 3); // 用户改选 left
});

t('applyChoices: 用户选择覆盖默认侧（标量）', () => {
  const left = { shopName: '暖心小屋', items: [], wants: [], logs: [] };
  const right = { shopName: '七里囤', items: [], wants: [], logs: [] };
  const r = bindMerge(left, right, { leftTime: 1000, rightTime: 2000 });
  const cid = r.conflicts.find((x) => x.field === 'shopName').conflictId;
  applyChoices(r.merged, r.conflicts, [{ conflictId: cid, side: 'left' }]);
  assert.strictEqual(r.merged.shopName, '暖心小屋');
});

t('applyChoices: 无效 side / 未知 conflictId 被忽略（不崩溃、不越权改数据）', () => {
  const left = { shopName: '暖心小屋', items: [], wants: [], logs: [] };
  const right = { shopName: '七里囤', items: [], wants: [], logs: [] };
  const r = bindMerge(left, right, { leftTime: 1000, rightTime: 2000 });
  const before = JSON.stringify(r.merged);
  applyChoices(r.merged, r.conflicts, [
    { conflictId: 'nope', side: 'left' },
    { conflictId: r.conflicts[0].conflictId, side: 'middle' },
    null,
  ]);
  assert.strictEqual(JSON.stringify(r.merged), before);
});

/* ---------- 服务端内部字段不进入合并 ---------- */

t('bindMerge: prevData/mergedInto/ui 等服务端字段不影响业务合并', () => {
  const left = { items: [mkEntry('w1', '抽纸')], wants: [], logs: [], ui: { tab: 'today' }, prevData: { items: [mkEntry('ghost')] }, mergedInto: 'x' };
  const right = { items: [], wants: [], logs: [], ui: { tab: 'stock' } };
  const r = bindMerge(left, right, {});
  assert.ok(r.merged.ui === undefined || r.merged.ui === null || typeof r.merged.ui === 'object');
  // prevData 不应把 ghost 条目并进来
  assert.strictEqual(r.merged.items.some((e) => e._id === 'ghost'), false);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
