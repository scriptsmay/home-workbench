'use strict';
/*
 * migrate-home-items-ids.js — home_items 文档主键归一迁移（v0.5，幂等）
 *
 * 背景：v0.4 之前小程序端以 `db.collection('home_items').add({...})` 直连写入，
 * _id 由云数据库随机生成，且按 `where({uid})` 读写；而 Web 端（云函数）固定
 * `_id == uid` 读写。两端文档主键形态不一致，导致同一用户的数据事实上互不相通。
 *
 * 本脚本把「随机 _id 的小程序文档」归一为 `_id == uid`：
 *   1. 扫描 home_items 中 `_id != uid` 的文档；
 *   2. 同一 uid 有多条时，先按条目级并集合并（语义对齐云函数 bindMerge 的无损部分）；
 *   3. 写入/更新 `_id == uid` 的文档（保留 prevData 备份）；
 *   4. 旧文档标记 `migratedFrom` / `migratedAt` / `migratedTo`，不再参与读写（不物理删除，保回滚）。
 *
 * 幂等：已带 `migratedFrom` 标记的文档直接跳过；目标文档已存在时按并集合并而非覆盖。
 *
 * 用法（需具备 CloudBase 访问凭据的环境）：
 *   node migrate-home-items-ids.js --dry-run     # 只打印将执行的变更
 *   node migrate-home-items-ids.js               # 实际执行
 *
 * 纯函数 `unionState` / `entryIdOf` / `stable` 已导出，可在无云环境下被单测覆盖。
 */

const DRY_RUN = process.argv.includes('--dry-run');
const COLLECTIONS = ['items', 'wants', 'logs'];
const UNION_ARRAYS = ['members', 'cats', 'places'];

function entryIdOf(e) {
  if (!e || typeof e !== 'object') return null;
  if (e._id != null) return String(e._id);
  if (e.id != null) return String(e.id);
  return null;
}
function stable(v) {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  }
  return JSON.stringify(v === undefined ? null : v);
}

/** 条目级并集（与云函数 bindMerge 的无损部分同语义；此脚本只做并集，不做冲突裁决） */
function unionState(left, right) {
  const L = left && typeof left === 'object' ? left : {};
  const R = right && typeof right === 'object' ? right : {};
  const merged = {};
  for (const col of COLLECTIONS) {
    const map = new Map();
    for (const e of (Array.isArray(L[col]) ? L[col] : [])) {
      const id = entryIdOf(e);
      if (id != null) map.set(id, e);
    }
    for (const e of (Array.isArray(R[col]) ? R[col] : [])) {
      const id = entryIdOf(e);
      if (id != null && !map.has(id)) map.set(id, e);
    }
    merged[col] = Array.from(map.values());
  }
  for (const key of UNION_ARRAYS) {
    const seen = new Set();
    const out = [];
    for (const v of (Array.isArray(L[key]) ? L[key] : []).concat(Array.isArray(R[key]) ? R[key] : [])) {
      const s = stable(v);
      if (!seen.has(s)) { seen.add(s); out.push(v); }
    }
    merged[key] = out;
  }
  const lsv = Number(L.schemaVersion) || 0;
  const rsv = Number(R.schemaVersion) || 0;
  merged.schemaVersion = Math.max(lsv, rsv) || 1;
  merged.shopName = L.shopName != null ? L.shopName : (R.shopName != null ? R.shopName : null);
  merged.tagline = L.tagline != null ? L.tagline : (R.tagline != null ? R.tagline : null);
  merged.freshDays = L.freshDays != null ? L.freshDays : (R.freshDays != null ? R.freshDays : 7);
  merged.soonDays = L.soonDays != null ? L.soonDays : (R.soonDays != null ? R.soonDays : 30);
  return merged;
}

async function main() {
  const cloudbase = require('@cloudbase/node-sdk');
  const ENV = process.env.TCB_ENV || cloudbase.SYMBOL_CURRENT_ENV;
  const db = cloudbase.init({ env: ENV }).database();

  console.log('[migrate] env =', ENV, '| dry-run =', DRY_RUN);
  const col = db.collection('home_items');
  const res = await col.limit(1000).get();
  const docs = (res && res.data) || [];
  console.log('[migrate] 扫描到 home_items 文档', docs.length, '篇');

  const byUid = new Map();
  for (const d of docs) {
    const uid = d.uid;
    if (!uid) { console.log('  [skip] 无 uid 字段，跳过 _id=' + d._id); continue; }
    if (!byUid.has(uid)) byUid.set(uid, []);
    byUid.get(uid).push(d);
  }

  let touched = 0;
  for (const entry of byUid) {
    const uid = entry[0];
    const group = entry[1];
    const target = group.filter((d) => d._id === uid)[0];
    const legacy = group.filter((d) => d._id !== uid && !d.migratedFrom);
    if (!legacy.length) continue;

    let data = (target && target.data) || null;
    const mergedFromIds = [];
    for (const d of legacy) {
      if (!d.data || typeof d.data !== 'object') continue;
      data = data ? unionState(data, d.data) : JSON.parse(JSON.stringify(d.data));
      mergedFromIds.push(d._id);
    }
    if (!data) continue;
    const updatedAt = new Date().toISOString();
    console.log('[migrate] uid=' + uid + ' 归一 ' + legacy.length + ' 篇旧文档（' + mergedFromIds.join(', ') + '）→ _id=' + uid + (DRY_RUN ? '（dry-run，不落库）' : ''));

    if (!DRY_RUN) {
      const doc = {
        uid: uid,
        data: data,
        updatedAt: updatedAt,
        prevData: (target && target.data) || null,
        prevUpdatedAt: (target && target.updatedAt) || null,
      };
      if (target) await col.doc(uid).set(doc);
      else await col.add(Object.assign({ _id: uid }, doc));
      for (const d of legacy) {
        await col.doc(d._id).set(Object.assign({}, d, {
          migratedFrom: d._id,
          migratedAt: updatedAt,
          migratedTo: uid,
        }));
      }
    }
    touched += legacy.length;
  }
  console.log('[migrate] 完成：共归一 ' + touched + ' 篇文档' + (DRY_RUN ? '（dry-run，未落库）' : ''));
}

module.exports = { unionState, entryIdOf, stable };

if (require.main === module) {
  main().catch((e) => {
    console.error('[migrate] 失败：', e && (e.stack || e.message));
    process.exit(1);
  });
}
