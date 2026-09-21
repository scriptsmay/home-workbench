'use strict';
/*
 * hwSyncApi — Web 端登录与云同步 HTTP API（CloudBase 云函数，Event 型，Nodejs18.15）
 *
 * 子路由（EnablePathTransmission，按 path 后缀自管）：
 *   POST /api/auth/login   用户名口令换 token
 *   POST /api/sync/pull    拉取云端全量（Bearer token）
 *   POST /api/sync/push    推送全量并做服务端字段级合并（Bearer token）
 *   OPTIONS /api/*         预检
 *
 * v0.5 增补（账号体系打通，契约见 docs/v0.5-api-design.md）：
 *   - HTTP 新增 /api/bind/*（绑定码 / 已关联身份 / 解绑 / 合并预检与裁决）
 *   - 新增 wx.cloud.callFunction 双入口（event.action）：
 *     ping / mpLogin / mpLoginPassword / bind / mpMergeStatus / mpMergeApply / pull / push
 *   - 新增身份映射集合 hw_identities 与一次性绑定码集合 hw_bind_codes
 *   - 新增绑定合并 bindMerge：条目级并集 + 标量 LWW，真冲突交用户裁决
 *   - 契约与安全设计见 docs/v0.5-api-design.md（v0.4 见 docs/v0.4-api-design.md）
 */
const crypto = require('crypto');

/* @cloudbase/node-sdk 改为惰性加载：
 * 1) 未安装依赖时仍可 require 本模块跑纯逻辑单测（不触库）；
 * 2) 真正需要访问数据库时才初始化。 */
let _sdk = null;
function sdk() {
  if (!_sdk) {
    try {
      _sdk = require('@cloudbase/node-sdk');
    } catch (e) {
      const err = new Error('@cloudbase/node-sdk 未安装（部署环境会自动注入）');
      err.code = 'sdk_missing';
      throw err;
    }
  }
  return _sdk;
}

const USERS = 'home_users';
const ITEMS = 'home_items';
const PUSH_LOG = 'home_push_log';
const IDENTITIES = 'hw_identities';
const BIND_CODES = 'hw_bind_codes';
const TOKEN_TTL_SEC = 30 * 24 * 60 * 60; // 30 天
const MAX_FAILED = 5;
const LOCK_MS = 15 * 60 * 1000;
/* 每个 uid 保留的「内容变化」快照条数上限（无变化的推送不占位，见 writePushLog） */
const PUSH_LOG_KEEP = 50;
/* 绑定 */
const BIND_CODE_TTL_MS = 5 * 60 * 1000;          // 绑定码 5 分钟
const BIND_CODE_MAX_ATTEMPTS = 5;                 // 兑换错误尝试上限
const BIND_CODE_MAX_OPEN_PER_UID = 3;             // 单账号未核销并发码上限
const MERGE_TICKET_TTL_MS = 15 * 60 * 1000;       // 合并票据 15 分钟
const WECHAT_PROVIDER = 'wechat';

const DEFAULT_ORIGINS = [
  'https://home.virola-eko.com',
  'https://home.matishare.com',
  'https://home-workbench.pages.dev',
];

let app = null;
let db = null;
function getDb() {
  if (!db) {
    const cloudbase = sdk();
    app = cloudbase.init({ env: process.env.TCB_ENV || cloudbase.SYMBOL_CURRENT_ENV });
    db = app.database();
  }
  return db;
}
const cmd = () => getDb().command;

/* ---------- CORS ---------- */
function allowedOrigins() {
  const envList = (process.env.HW_ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return envList.length ? envList : DEFAULT_ORIGINS;
}
function corsHeaders(origin) {
  if (!origin) return {};
  const list = allowedOrigins();
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  if (!isLocal && !list.includes(origin)) return {}; // 非法 Origin：不回任何 CORS 头
  return {
    'Access-Control-Allow-Origin': origin,
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

/* ---------- password (scrypt) ---------- */
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return salt.toString('hex') + ':' + hash.toString('hex');
}
function verifyPassword(password, stored) {
  if (!stored || stored.indexOf(':') < 0) return false;
  const [saltHex, hashHex] = stored.split(':');
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, salt, expected.length, { N: 16384, r: 8, p: 1 });
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

/* ---------- token (HMAC) ---------- */
function secret() {
  const s = process.env.HW_TOKEN_SECRET;
  if (!s) throw new Error('HW_TOKEN_SECRET not configured');
  return s;
}
const b64u = (buf) => Buffer.from(buf).toString('base64url');
function sign(payload) {
  const body = b64u(JSON.stringify(payload));
  const mac = crypto.createHmac('sha256', secret()).update(body).digest();
  return body + '.' + b64u(mac);
}
function issueToken(uid, tokenVersion) {
  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SEC;
  return { token: sign({ uid, tv: tokenVersion || 0, exp }), exp };
}
function verifyToken(token) {
  if (!token || token.indexOf('.') < 0) return null;
  const [body, mac] = token.split('.');
  const expected = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch (e) {
    return null;
  }
  if (!payload || !payload.uid) return null;
  if (typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) return null;
  return payload;
}

/* ---------- merge ticket (HMAC, v0.5) ----------
 * 合并票据只承载「哪一次合并」，不携带任何业务数据：
 * 合并所需数据一律以服务端已存的两侧文档为准，客户端只回传「选择」。 */
function signMergeTicket(payload) {
  const body = b64u(JSON.stringify(payload));
  const mac = crypto.createHmac('sha256', secret()).update(body).digest();
  return 'mt.' + body + '.' + b64u(mac);
}
function verifyMergeTicket(ticket) {
  try {
    if (typeof ticket !== 'string' || !ticket.startsWith('mt.')) return null;
    const parts = ticket.split('.');
    if (parts.length !== 3) return null;
    const body = parts[1];
    const mac = parts[2];
    const expected = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
    const a = Buffer.from(mac);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload || payload.k !== 'merge' || !payload.uid || !payload.tempUid) return null;
    if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
    return payload;
  } catch (e) {
    return null;
  }
}
function issueMergeTicket(identityId, uid, tempUid) {
  const exp = Date.now() + MERGE_TICKET_TTL_MS;
  return { ticket: signMergeTicket({ k: 'merge', identityId, uid, tempUid, exp }), exp };
}

/* ---------- 绑定码（v0.5） ---------- */
function genBindCode() {
  // 6 位数字，首位非 0（避免展示时被误吞），仍保有 9*10^5 的空间，
  // 配合 TTL 5 分钟 + 错误尝试上限，足够抵御暴力枚举
  const first = 1 + Math.floor(Math.random() * 9);
  let rest = '';
  for (let i = 0; i < 5; i++) rest += Math.floor(Math.random() * 10);
  return String(first) + rest;
}

/* ---------- field-level merge (等价 v0.3 mergeData) ---------- */
function businessEmpty(st) {
  if (!st || typeof st !== 'object') return true;
  const n = (k) => (Array.isArray(st[k]) ? st[k].length : 0);
  return !n('items') && !n('wants') && !n('logs');
}
function mergeFields(base, incoming) {
  const result = JSON.parse(JSON.stringify(base));
  // 客户端时钟向前偏移会让其时间戳永远胜出（覆盖事故的放大器之一），
  // 双侧时间均钳制到服务器当前时间：晚于 now 的时间戳不给予胜出权。
  // 注意：钳制后的比较必须用「严格大于」——否则被钳到与 base 相同刻度的
  // 伪造时间戳会因 >= 反而胜出（单测「客户端时钟前移被钳制」即此例）。
  const nowMs = Date.now();
  const rawBaseTime = new Date(base.updatedAt || base.exportedAt || 0).getTime() || 0;
  const rawInTime = new Date(incoming.updatedAt || incoming.exportedAt || 0).getTime() || 0;
  const baseTime = Math.min(rawBaseTime, nowMs);
  const inClamped = rawInTime > nowMs; // 被钳制过 → 一律不给予胜出权
  const inTime = Math.min(rawInTime, nowMs);
  const useIncoming = !inClamped && inTime > baseTime;
  for (const key in incoming) {
    if (!Object.prototype.hasOwnProperty.call(incoming, key)) continue;
    const bv = base[key];
    const iv = incoming[key];
    if (iv == null && bv != null) result[key] = bv;
    else if (bv == null && iv != null) result[key] = iv;
    else if (useIncoming) result[key] = iv;
  }
  return result;
}

/* ---------- bindMerge（v0.5 绑定合并：条目级并集 + 标量 LWW） ----------
 * 与 mergeFields 的区别：mergeFields 面向「同一身份的同一份文档」做字段级
 * 合并（数组整键替换）；bindMerge 面向「两个不同身份的文档」做并集——
 * 数组整键替换在这里等于整包丢数据（2026-09-21 覆盖事故的同类风险）。
 *
 * 合并规则（契约 §2）：
 *   items/wants/logs   按条目 id union + 去重；仅单侧存在 → 直接保留（无损）
 *                      同 id 内容不同 → 真冲突，交冲突解决 UI
 *   shopName/tagline   相同取值；不同 → 真冲突（默认较新 updatedAt 侧）
 *   members/cats/places 并集（左序在前，右侧新增追加）
 *   freshDays/soonDays 同标量
 *   schemaVersion      取较大值
 *   updatedAt/ui/服务端内部字段  不参与合并
 */
const MERGE_COLLECTIONS = ['items', 'wants', 'logs'];
const MERGE_SCALARS = ['shopName', 'tagline', 'freshDays', 'soonDays'];
const MERGE_UNION_ARRAYS = ['members', 'cats', 'places'];
/* 服务端内部字段：永不进入合并与冲突 */
const SERVER_ONLY_KEYS = ['updatedAt', 'exportedAt', 'prevData', 'prevUpdatedAt', 'ui', 'mergedInto', 'migratedFrom', 'migratedAt'];

function entryIdOf(entry) {
  if (!entry || typeof entry !== 'object') return null;
  if (entry._id != null) return String(entry._id);
  if (entry.id != null) return String(entry.id);
  return null;
}
/* 条目展示名：尽量给人类可读的名字（库存/需求/流水各自的字段名不同） */
function entryNameOf(entry) {
  if (!entry || typeof entry !== 'object') return '';
  return String(entry.name || entry.title || entry.text || entry.itemName || entry.id || entry._id || '');
}
function entryTimeOf(entry) {
  const t = entry && (entry.updatedAt || entry.at || entry.createdAt);
  const ms = new Date(t || 0).getTime();
  return Number.isFinite(ms) ? ms : 0;
}
/* 浅比较：字段级差异（用于「展开字段差异」） */
function entryFieldDiff(left, right) {
  const keys = new Set([...Object.keys(left || {}), ...Object.keys(right || {})]);
  const out = [];
  for (const k of keys) {
    if (k === 'updatedAt' || k === 'exportedAt' || k === '_id' || k === 'id') continue;
    const lv = left ? left[k] : undefined;
    const rv = right ? right[k] : undefined;
    if (stable(lv) !== stable(rv)) out.push({ field: k, left: lv == null ? null : lv, right: rv == null ? null : rv });
  }
  return out;
}

/**
 * 绑定合并。
 * @param left  canonical（Web 账号）侧业务 state
 * @param right 临时（小程序）侧业务 state
 * @param opts.leftTime / opts.rightTime  两侧文档级 updatedAt（毫秒），用于标量默认裁决
 * @returns {{ merged: object, conflicts: Array, summary: object }}
 */
function bindMerge(left, right, opts) {
  opts = opts || {};
  const L = left && typeof left === 'object' ? left : {};
  const R = right && typeof right === 'object' ? right : {};
  const merged = {};
  const conflicts = [];
  let conflictSeq = 0;
  const summary = { leftOnly: 0, rightOnly: 0, mergedEntries: 0, conflicts: 0 };

  // 1) 三张业务集合：按条目 id union
  for (const col of MERGE_COLLECTIONS) {
    const la = Array.isArray(L[col]) ? L[col] : [];
    const ra = Array.isArray(R[col]) ? R[col] : [];
    const map = new Map();
    for (const e of la) {
      const id = entryIdOf(e);
      if (id == null) continue;
      map.set(id, { side: 'left', entry: e });
    }
    for (const e of ra) {
      const id = entryIdOf(e);
      if (id == null) continue;
      const hit = map.get(id);
      if (!hit) {
        map.set(id, { side: 'right', entry: e });
      } else if (stable(hit.entry) !== stable(e)) {
        // 同 id 内容不同 → 真冲突
        conflictSeq += 1;
        conflicts.push({
          conflictId: 'c' + conflictSeq,
          kind: 'entry',
          collection: col,
          entryId: id,
          name: entryNameOf(hit.entry) || entryNameOf(e),
          left: { value: hit.entry, updatedAt: new Date(entryTimeOf(hit.entry) || (opts.leftTime || 0)).toISOString() },
          right: { value: e, updatedAt: new Date(entryTimeOf(e) || (opts.rightTime || 0)).toISOString() },
          fieldDiff: entryFieldDiff(hit.entry, e),
        });
      } else {
        // 完全一致：任取一侧
        map.set(id, { side: 'same', entry: hit.entry });
      }
    }
    const arr = [];
    for (const [, v] of map) arr.push(v.entry);
    summary.mergedEntries += arr.length;
    merged[col] = arr;
  }

  // 2) 单侧独有条目统计（供 UI 的「自动并入」概览；这些不进 conflicts，不可被排除）
  {
    const countBy = (state, col) => (Array.isArray(state[col]) ? state[col].length : 0);
    let leftOnly = 0, rightOnly = 0;
    for (const col of MERGE_COLLECTIONS) {
      const lm = new Map((Array.isArray(L[col]) ? L[col] : []).map((e) => [entryIdOf(e), e]));
      const rm = new Map((Array.isArray(R[col]) ? R[col] : []).map((e) => [entryIdOf(e), e]));
      for (const [id] of lm) if (!rm.has(id)) leftOnly += 1;
      for (const [id] of rm) if (!lm.has(id)) rightOnly += 1;
    }
    summary.leftOnly = leftOnly;
    summary.rightOnly = rightOnly;
  }

  // 3) 标量字段：一致取值；分歧 → 真冲突（默认较新文档级时间戳一侧）
  for (const key of MERGE_SCALARS) {
    const lv = L[key];
    const rv = R[key];
    if (lv == null && rv == null) { merged[key] = null; continue; }
    if (lv == null) { merged[key] = rv; continue; }
    if (rv == null) { merged[key] = lv; continue; }
    if (stable(lv) === stable(rv)) { merged[key] = lv; continue; }
    conflictSeq += 1;
    conflicts.push({
      conflictId: 'c' + conflictSeq,
      kind: 'scalar',
      field: key,
      left: { value: lv, updatedAt: new Date(opts.leftTime || 0).toISOString() },
      right: { value: rv, updatedAt: new Date(opts.rightTime || 0).toISOString() },
      fieldDiff: [],
    });
  }

  // 4) 配置数组：并集（左序在前，右侧新增追加在后）
  for (const key of MERGE_UNION_ARRAYS) {
    const la = Array.isArray(L[key]) ? L[key] : [];
    const ra = Array.isArray(R[key]) ? R[key] : [];
    const seen = new Set();
    const out = [];
    for (const v of la) { const s = stable(v); if (!seen.has(s)) { seen.add(s); out.push(v); } }
    for (const v of ra) { const s = stable(v); if (!seen.has(s)) { seen.add(s); out.push(v); } }
    merged[key] = out;
  }

  // 5) schemaVersion 取较大值
  const lsv = Number(L.schemaVersion) || 0;
  const rsv = Number(R.schemaVersion) || 0;
  merged.schemaVersion = Math.max(lsv, rsv) || (L.schemaVersion != null ? L.schemaVersion : R.schemaVersion) || 1;

  // 6) 应用默认裁决（较新时间戳一侧胜出），返回「自动版」结果；
  //    用户在冲突解决 UI 改选择的，由 applyChoices 覆盖。
  for (const c of conflicts) {
    const lt = new Date(c.left.updatedAt).getTime() || 0;
    const rt = new Date(c.right.updatedAt).getTime() || 0;
    c.defaultSide = rt > lt ? 'right' : 'left';
    c.side = c.defaultSide;
  }
  applyChoices(merged, conflicts, conflicts.map((c) => ({ conflictId: c.conflictId, side: c.defaultSide })), { leftTime: opts.leftTime, rightTime: opts.rightTime });

  summary.conflicts = conflicts.length;
  return { merged, conflicts, summary };
}

/**
 * 把用户选择（或默认选择）落到合并结果上。
 * choices: [{ conflictId, side: 'left'|'right' }]
 */
function applyChoices(merged, conflicts, choices, opts) {
  opts = opts || {};
  const byId = new Map(conflicts.map((c) => [c.conflictId, c]));
  const chosen = new Map();
  for (const ch of Array.isArray(choices) ? choices : []) {
    if (!ch || !byId.has(ch.conflictId)) continue;
    if (ch.side !== 'left' && ch.side !== 'right') continue;
    chosen.set(ch.conflictId, ch.side);
  }
  for (const c of conflicts) {
    const side = chosen.get(c.conflictId) || c.defaultSide || 'left';
    if (c.kind === 'entry') {
      const arr = Array.isArray(merged[c.collection]) ? merged[c.collection] : [];
      const idx = arr.findIndex((e) => entryIdOf(e) === c.entryId);
      const pick = side === 'right' ? c.right.value : c.left.value;
      if (idx >= 0) arr[idx] = JSON.parse(JSON.stringify(pick));
      else arr.push(JSON.parse(JSON.stringify(pick)));
      merged[c.collection] = arr;
    } else if (c.kind === 'scalar') {
      merged[c.field] = side === 'right' ? c.right.value : c.left.value;
    }
  }
  return merged;
}

/* ---------- 推送快照（取证留痕） ---------- */
/* 背景：2026-09-21 覆盖事故中云端数据被清空，而服务端不记录任何请求体，
 * 导致「谁在什么时候推了什么」完全无从倒查。现每次 push 落库前留一份快照，
 * 但**只保留内容真正发生变化的那些**——纯重复同步不留痕，避免日志被噪音淹没。
 *
 * 「内容」只认业务字段：时间戳（updatedAt/exportedAt）、界面态（ui）等一律排除。
 * 理由：设备每次交互都会刷时间戳、切筛选条件会改 ui，这些不是用户数据，
 * 拿它们算指纹会让「无改动」判定永远失败，快照退化成流水账。
 */
const BIZ_KEYS = [
  'schemaVersion', 'shopName', 'tagline', 'members', 'cats', 'places',
  'freshDays', 'soonDays', 'items', 'wants', 'logs',
];

function bizOf(data) {
  const out = {};
  if (!data || typeof data !== 'object') return out;
  for (const k of BIZ_KEYS) {
    if (Object.prototype.hasOwnProperty.call(data, k)) out[k] = data[k];
  }
  return out;
}

/* 键序无关的稳定序列化：指纹只反映内容，不受字段书写顺序影响 */
function stable(v) {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  }
  return JSON.stringify(v === undefined ? null : v);
}

function bizFp(data) {
  return crypto.createHash('sha1').update(stable(bizOf(data))).digest('hex');
}

function clientIp(event) {
  const h = event.headers || {};
  const raw = h['x-forwarded-for'] || h['X-Forwarded-For'] || h['x-real-ip'] || h['X-Real-Ip'];
  if (raw) return String(raw).split(',')[0].trim().slice(0, 64);
  return String((event.requestContext && event.requestContext.sourceIp) || '').slice(0, 64);
}

function clientUa(event) {
  const h = event.headers || {};
  return String(h['user-agent'] || h['User-Agent'] || '').slice(0, 200);
}

/* 写快照。判据：本次推来的业务内容指纹 !== 云端当前内容指纹才记一条。
 * 即「推的东西与云端已有的一样」= 无意义同步，直接跳过（不写库）。
 * 快照失败绝不能影响同步主流程，故整体 try/catch 吞掉。 */
async function writePushLog(opt) {
  try {
    const db = getDb();
    const res = await db
      .collection(PUSH_LOG)
      .where({ uid: opt.uid })
      .orderBy('seq', 'desc')
      .limit(1)
      .get()
      .catch(() => null);
    const last = res && res.data && res.data[0];
    /* 无变化判定（两个都要比，缺一即漏）：
     *   last.fp === opt.fp      本次推来的内容与上一条记录推来的相同 → 重复推送
     *   last.resultFp === opt.fp 本次推来的内容与云端当前内容相同     → 无效同步
     * 只比后者会让「连续多次相同的空推送」每次都留一条（云端内容始终没变）。 */
    if (last && (last.fp === opt.fp || last.resultFp === opt.fp)) return;
    const seq = ((last && last.seq) || 0) + 1;
    await db.collection(PUSH_LOG).add({
      uid: opt.uid,
      seq,
      kind: 'push',
      at: new Date().toISOString(),
      fp: opt.fp, // 客户端推来的内容指纹
      prevFp: last ? last.resultFp : null, // 推送前云端内容指纹
      prevSeq: last ? last.seq : null,
      resultFp: opt.resultFp, // 推送后云端内容指纹（被拦时 = prevFp）
      stored: !!opt.stored,
      stripped: !!opt.stripped,
      clientUpdatedAt: opt.clientUpdatedAt || null, // 客户端声称的时间戳，查时钟偏移/伪造
      biz: opt.biz, // 推来的业务数据原文（已剔除时间戳与 ui）
      ip: clientIp(opt.event),
      ua: clientUa(opt.event),
    });
    /* 只保留最近 PUSH_LOG_KEEP 条变化，超期快照自动淘汰，避免无限膨胀。
     * 保留区间是 [seq-KEEP+1, seq]，故删除条件是 seq <= seq-KEEP */
    if (seq > PUSH_LOG_KEEP) {
      await db
        .collection(PUSH_LOG)
        .where({ uid: opt.uid, seq: cmd().lte(seq - PUSH_LOG_KEEP) })
        .remove();
    }
  } catch (e) {
    console.error('hwSyncApi pushLog failed:', e && e.message);
  }
}

/* 合并事件留痕（bind_merge / bind_merge_manual）。
 * 与 push 快照共用集合但独立 seq 空间（按 uid+kind 计数），互不挤占；
 * 合并是低频且高价值事件，**不做滚动淘汰**——它就是回滚与倒查的依据。 */
async function writeMergeLog(opt) {
  try {
    const db = getDb();
    const kind = opt.kind || 'bind_merge';
    const res = await db
      .collection(PUSH_LOG)
      .where({ uid: opt.uid, kind })
      .orderBy('seq', 'desc')
      .limit(1)
      .get()
      .catch(() => null);
    const last = res && res.data && res.data[0];
    const seq = ((last && last.seq) || 0) + 1;
    await db.collection(PUSH_LOG).add({
      uid: opt.uid,
      seq,
      kind,
      at: new Date().toISOString(),
      identityId: opt.identityId || null,
      tempUid: opt.tempUid || null,
      leftFp: opt.leftFp || null,   // canonical 侧内容指纹
      rightFp: opt.rightFp || null, // 临时侧内容指纹
      resultFp: opt.resultFp || null,
      conflicts: opt.conflicts || [], // 冲突摘要（含用户选择，manual 时）
      choices: opt.choices || null,
      summary: opt.summary || null,
      biz: opt.biz || null, // 合并结果业务原文（含未冲突并集与已裁决项）
      manual: kind === 'bind_merge_manual',
    });
  } catch (e) {
    console.error('hwSyncApi mergeLog failed:', e && e.message);
  }
}

/* ---------- helpers ---------- */
function json(status, obj, origin) {
  return {
    statusCode: status,
    headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders(origin)),
    body: JSON.stringify(obj),
    isBase64Encoded: false,
  };
}
const err = (status, code, message) => ({ error: { code, message } });
function readBody(event) {
  if (event.body == null) return {};
  let raw = event.body;
  if (event.isBase64Encoded) raw = Buffer.from(raw, 'base64').toString('utf8');
  if (typeof raw === 'object') return raw;
  try {
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return null; // 触发 400
  }
}
async function loadUserByUsername(username) {
  const res = await getDb()
    .collection(USERS)
    .where({ username: username })
    .limit(1)
    .get();
  return (res.data && res.data[0]) || null;
}
async function loadUserByUid(uid) {
  const res = await getDb().collection(USERS).doc(uid).get().catch(() => null);
  return (res && res.data && res.data[0]) || null;
}
function bearer(event) {
  const h = event.headers || {};
  const auth = h.authorization || h.Authorization || h.auth || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return '';
}
async function authedUid(event) {
  const payload = verifyToken(bearer(event));
  if (!payload) return { error: json(401, err(401, 'unauthorized', '请先登录'), origin(event)) };
  const user = await loadUserByUid(payload.uid);
  if (!user) return { error: json(401, err(401, 'unauthorized', '账号不存在'), origin(event)) };
  if ((user.tokenVersion || 0) !== (payload.tv || 0)) {
    return { error: json(401, err(401, 'unauthorized', '登录状态已失效，请重新登录'), origin(event)) };
  }
  return { uid: payload.uid };
}
const origin = (event) => (event.headers || {}).origin || (event.headers || {}).Origin;

/* ---------- 身份层（v0.5） ---------- */
function tempUidOf(openid) {
  return 'wx_' + openid;
}
function identityKey(openid) {
  return 'wx:' + openid;
}
async function getIdentityByOpenid(openid) {
  const res = await getDb()
    .collection(IDENTITIES)
    .where({ identity: identityKey(openid) })
    .limit(1)
    .get()
    .catch(() => null);
  return (res && res.data && res.data[0]) || null;
}
async function getIdentityById(identityId) {
  const res = await getDb().collection(IDENTITIES).doc(identityId).get().catch(() => null);
  return (res && res.data && res.data[0]) || null;
}
async function listIdentities(uid) {
  const res = await getDb()
    .collection(IDENTITIES)
    .where({ uid })
    .get()
    .catch(() => null);
  return (res && res.data) || [];
}
async function getItemsDoc(uid) {
  const res = await getDb().collection(ITEMS).doc(uid).get().catch(() => null);
  return (res && res.data && res.data[0]) || null;
}
function itemsDoc(uid, data, updatedAt, existing) {
  return {
    uid,
    data,
    updatedAt,
    prevData: existing && existing.data ? existing.data : null,
    prevUpdatedAt: existing && existing.updatedAt ? existing.updatedAt : null,
  };
}
async function saveItemsDoc(uid, doc, existing) {
  if (existing) {
    await getDb().collection(ITEMS).doc(uid).set(doc);
  } else {
    await getDb().collection(ITEMS).add(Object.assign({ _id: uid }, doc));
  }
}

/* 读取某身份当前的「业务 state」；无文档返回 null */
async function loadState(uid) {
  const doc = await getItemsDoc(uid);
  if (!doc) return null;
  return { data: doc.data || null, updatedAt: doc.updatedAt || null, raw: doc };
}

/**
 * 绑定核心：把 openid 绑到 targetUid，并处理两侧数据合并。
 * 返回统一结构，由 mpLoginPassword / bind 两个入口复用。
 */
async function linkIdentity(openid, targetUid, source) {
  const db = getDb();
  const nowIso = new Date().toISOString();
  const tempUid = tempUidOf(openid);
  const key = identityKey(openid);

  // 身份被其他账号占用？
  const existing = await getIdentityByOpenid(openid);
  if (existing && existing.uid && existing.uid !== targetUid) {
    return { ok: false, status: 403, error: err(403, 'identity_taken', '该微信已绑定到其它账号，请先解绑') };
  }

  const user = await loadUserByUid(targetUid);
  if (!user) return { ok: false, status: 401, error: err(401, 'unauthorized', '账号不存在') };

  const leftState = await loadState(targetUid);
  const rightState = await loadState(tempUid);

  let identity = existing;
  if (!identity) {
    const doc = {
      identity: key,
      provider: WECHAT_PROVIDER,
      openid,
      uid: targetUid,
      tempUid,
      status: 'linked',
      mergePending: false,
      nickname: user.nickname || user.username || null,
      createdAt: nowIso,
      linkedAt: nowIso,
      mergedAt: null,
    };
    const added = await db.collection(IDENTITIES).add(doc);
    identity = Object.assign({ _id: added && added._id ? added._id : null }, doc);
  }

  // 临时身份没有数据 → 直接绑定成功，无需合并
  const hasTempData = rightState && rightState.data && !businessEmpty(rightState.data);
  if (!hasTempData) {
    await db.collection(IDENTITIES).doc(identity._id).update({
      status: 'linked',
      mergePending: false,
      linkedAt: identity.linkedAt || nowIso,
      uid: targetUid,
      tempUid,
      mergedAt: identity.mergedAt || nowIso,
    });
    return { ok: true, uid: targetUid, tempUid, mergeRequired: false, identityId: identity._id };
  }

  // 两侧都有数据 → 算并集与真冲突
  const leftTime = new Date((leftState && leftState.updatedAt) || 0).getTime();
  const rightTime = new Date((rightState && rightState.updatedAt) || 0).getTime();
  const { conflicts, summary } = bindMerge(
    (leftState && leftState.data) || {},
    rightState.data,
    { leftTime, rightTime },
  );

  await db.collection(IDENTITIES).doc(identity._id).update({
    status: 'linked',
    mergePending: true,
    linkedAt: identity.linkedAt || nowIso,
    uid: targetUid,
    tempUid,
  });

  /* 无真冲突：并集是无损的，服务端直接应用，不必让用户白跑一趟合并页。
   * （若此处只置 mergePending 而不落库，客户端又因 mergeRequired=false 不进合并页，
   *   临时身份的数据将永远悬空——集成测试捕获到这个缺陷。） */
  if (!conflicts.length) {
    const applied = await applyMerge(identity, [], false);
    return {
      ok: true,
      uid: targetUid,
      tempUid,
      identityId: identity._id,
      mergeRequired: false,
      merged: true,
      summary: applied.summary,
    };
  }

  const { ticket } = issueMergeTicket(identity._id, targetUid, tempUid);
  return {
    ok: true,
    uid: targetUid,
    tempUid,
    identityId: identity._id,
    mergeRequired: true,
    ticket,
    conflicts,
    summary,
    leftFp: bizFp((leftState && leftState.data) || {}),
    rightFp: bizFp(rightState.data),
  };
}

/** 真正执行合并落库（预检后无冲突自动应用，或用户裁决后应用）。 */
async function applyMerge(identity, choices, manual) {
  const db = getDb();
  const tempUid = identity.tempUid || tempUidOf(identity.openid);
  const nowIso = new Date().toISOString();

  const leftState = await loadState(identity.uid);
  const rightState = await loadState(tempUid);
  const leftData = (leftState && leftState.data) || {};
  const rightData = (rightState && rightState.data) || {};

  const leftTime = new Date((leftState && leftState.updatedAt) || 0).getTime();
  const rightTime = new Date((rightState && rightState.updatedAt) || 0).getTime();
  const { merged, conflicts, summary } = bindMerge(leftData, rightData, { leftTime, rightTime });
  const finalData = applyChoices(merged, conflicts, choices || [], { leftTime, rightTime });

  const storedUpdatedAt = nowIso;
  const doc = itemsDoc(identity.uid, finalData, storedUpdatedAt, leftState && leftState.raw);
  await saveItemsDoc(identity.uid, doc, leftState && leftState.raw);

  // 临时文档保留但标记 mergedInto（便于核对与回滚），并清空业务数据防二次合并
  const tempExisting = rightState && rightState.raw;
  if (tempExisting) {
    await getDb().collection(ITEMS).doc(tempUid).set({
      uid: tempUid,
      data: rightData, // 原样保留（回滚依据），不再参与读写
      updatedAt: rightState.updatedAt || nowIso,
      mergedInto: identity.uid,
      mergedAt: nowIso,
      mergedKind: manual ? 'bind_merge_manual' : 'bind_merge',
    });
  }

  await writeMergeLog({
    uid: identity.uid,
    kind: manual ? 'bind_merge_manual' : 'bind_merge',
    identityId: identity._id,
    tempUid,
    leftFp: bizFp(leftData),
    rightFp: bizFp(rightData),
    resultFp: bizFp(finalData),
    conflicts: conflicts.map((c) => ({
      conflictId: c.conflictId,
      kind: c.kind,
      collection: c.collection,
      entryId: c.entryId,
      field: c.field,
      name: c.name,
      defaultSide: c.defaultSide,
      side: (choices || []).find((x) => x.conflictId === c.conflictId)?.side || c.defaultSide,
    })),
    choices: choices || null,
    summary,
    biz: finalData,
  });

  await db.collection(IDENTITIES).doc(identity._id).update({
    mergePending: false,
    mergedAt: nowIso,
  });

  return { data: finalData, updatedAt: storedUpdatedAt, conflicts, summary };
}

/* 绑定码 ---------- */
async function createBindCode(uid) {
  const db = getDb();
  const now = Date.now();
  // 未核销并发码上限
  const open = await db
    .collection(BIND_CODES)
    .where({ uid, usedAt: null })
    .get()
    .catch(() => null);
  const openList = (open && open.data) || [];
  const alive = openList.filter((c) => new Date(c.expiresAt).getTime() > now);
  if (alive.length >= BIND_CODE_MAX_OPEN_PER_UID) {
    return { ok: false, status: 429, error: err(429, 'too_many_requests', '生成太频繁，请稍后再试') };
  }
  // 让旧的自然过期码可被清理（惰性）
  for (const c of openList) {
    if (new Date(c.expiresAt).getTime() <= now) {
      await db.collection(BIND_CODES).doc(c._id).remove().catch(() => null);
    }
  }
  const code = genBindCode();
  const expiresAt = new Date(now + BIND_CODE_TTL_MS).toISOString();
  await db.collection(BIND_CODES).add({
    code,
    uid,
    expiresAt,
    usedAt: null,
    attempts: 0,
    createdAt: new Date(now).toISOString(),
  });
  return { ok: true, code, expiresAt };
}

/** 兑换绑定码：成功返回 { ok, uid }；失败返回结构化错误。 */
async function consumeBindCode(code, openid) {
  const db = getDb();
  const raw = String(code || '').trim();
  if (!/^\d{6}$/.test(raw)) {
    return { ok: false, status: 400, error: err(400, 'bind_code_invalid', '绑定码不正确') };
  }
  const res = await db
    .collection(BIND_CODES)
    .where({ code: raw })
    .limit(1)
    .get()
    .catch(() => null);
  const rec = res && res.data && res.data[0];
  if (!rec) return { ok: false, status: 400, error: err(400, 'bind_code_invalid', '绑定码不正确') };
  if (rec.usedAt) return { ok: false, status: 400, error: err(400, 'bind_code_used', '这个绑定码已经用过了') };
  if (new Date(rec.expiresAt).getTime() <= Date.now()) {
    await db.collection(BIND_CODES).doc(rec._id).remove().catch(() => null);
    return { ok: false, status: 400, error: err(400, 'bind_code_expired', '绑定码已过期，请在网页端重新生成') };
  }
  if ((rec.attempts || 0) >= BIND_CODE_MAX_ATTEMPTS) {
    await db.collection(BIND_CODES).doc(rec._id).remove().catch(() => null);
    return { ok: false, status: 400, error: err(400, 'bind_code_invalid', '绑定码不正确') };
  }

  const identity = await getIdentityByOpenid(openid);
  if (identity && identity.uid && identity.uid !== rec.uid) {
    return { ok: false, status: 403, error: err(403, 'identity_taken', '该微信已绑定到其它账号，请先解绑') };
  }

  // 核销（条件更新，防并发复用：仅当 usedAt 仍为 null 时置值）
  await db
    .collection(BIND_CODES)
    .doc(rec._id)
    .update({ usedAt: new Date().toISOString(), usedBy: tempUidOf(openid) });

  const linked = await linkIdentity(openid, rec.uid, 'bind_code');
  if (!linked.ok) return linked;
  return linked;
}

/* ---------- handlers（v0.4，保持不变） ---------- */
async function handleLogin(event) {
  const o = origin(event);
  const body = readBody(event);
  if (!body || !body.username || !body.password) {
    return json(400, err(400, 'bad_request', '请填写用户名和密码'), o);
  }
  const user = await loadUserByUsername(String(body.username).trim());
  if (!user) return json(401, err(401, 'invalid_credentials', '用户名或密码不正确'), o);

  const now = Date.now();
  if (user.lockedUntil && new Date(user.lockedUntil).getTime() > now) {
    return json(429, err(429, 'too_many_requests', '尝试过于频繁，请稍后再试'), o);
  }

  if (!verifyPassword(String(body.password), user.pwdHash)) {
    const failed = (user.failedCount || 0) + 1;
    const patch = { failedCount: failed, updatedAt: new Date(now).toISOString() };
    if (failed >= MAX_FAILED) patch.lockedUntil = new Date(now + LOCK_MS).toISOString();
    await getDb().collection(USERS).doc(user.uid).update(patch);
    return json(401, err(401, 'invalid_credentials', '用户名或密码不正确'), o);
  }

  const { token, exp } = issueToken(user.uid, user.tokenVersion);
  await getDb().collection(USERS).doc(user.uid).update({
    failedCount: 0,
    lockedUntil: null,
    lastLoginAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
  });
  return json(200, {
    ok: true,
    token,
    uid: user.uid,
    username: user.username,
    nickname: user.nickname || null,
    expiresAt: new Date(exp * 1000).toISOString(),
  }, o);
}

async function handlePull(event) {
  const o = origin(event);
  const a = await authedUid(event);
  if (a.error) return a.error;
  const doc = await getItemsDoc(a.uid);
  if (!doc) return json(200, { ok: true, data: null, updatedAt: null }, o);
  return json(200, { ok: true, data: doc.data || null, updatedAt: doc.updatedAt || null }, o);
}

async function handlePush(event) {
  const o = origin(event);
  const a = await authedUid(event);
  if (a.error) return a.error;
  const body = readBody(event);
  if (!body || body.data == null || typeof body.data !== 'object') {
    return json(400, err(400, 'bad_request', '缺少同步数据'), o);
  }
  const incomingUpdatedAt = body.updatedAt || new Date().toISOString();
  const incomingBiz = bizOf(body.data);
  const incomingFp = bizFp(body.data);
  const existing = await getItemsDoc(a.uid);
  /* 清空式覆盖护栏（2026-09-21 二次事故后追加）：客户端本地为空（新设备、
   * 或本地已被污染）时会推来一张空的业务表。若云端此刻仍有数据，这种推送
   * 一律**不落库**，直接原样返回云端数据——云端数据一旦被空推送覆盖就是
   * 不可逆的。代价：无法从空设备"清空云端"，需人工处理。 */
  if (existing && existing.data && businessEmpty(body.data) && !businessEmpty(existing.data)) {
    /* 取证：这次推送被拦下，但「试图清空云端」本身就是必须留痕的事件 */
    await writePushLog({
      uid: a.uid,
      fp: incomingFp,
      biz: incomingBiz,
      resultFp: bizFp(existing.data),
      stored: false,
      stripped: true,
      clientUpdatedAt: incomingUpdatedAt,
      event,
    });
    return json(200, {
      ok: true,
      data: existing.data,
      updatedAt: existing.updatedAt || null,
      strippedEmptyPush: true,
    }, o);
  }
  let merged = body.data;
  if (existing && existing.data) {
    /* 合并需要一个「可比较的 incoming 时间戳」。契约里 updatedAt 在请求顶层
     * （{data, updatedAt}），而 mergeFields 读的是 incoming.updatedAt：若客户端
     * 只给顶层而 data 里没有，合并判定会拿到 0 → 永远判 incoming 非新 → 推送
     * 静默不生效。这里以顶层值补位（客户端已自带则优先用其自带值）。 */
    const incomingData = Object.assign({}, body.data);
    if (!incomingData.updatedAt && incomingUpdatedAt) incomingData.updatedAt = incomingUpdatedAt;
    merged = mergeFields(existing.data, incomingData);
  }
  const storedUpdatedAt = new Date().toISOString();
  // 覆盖前留一深备份（prevData/prevUpdatedAt）：误覆盖可人工回滚，是硬拒收清空式
  // 推送的替代方案——硬拒会误杀「设置页刻意清空」的合法操作，备份保可回滚性
  const doc = itemsDoc(a.uid, merged, storedUpdatedAt, existing);
  await saveItemsDoc(a.uid, doc, existing);
  /* 取证快照：只记内容真正变化的推送（resultFp 取自落库结果，尊重服务端合并） */
  await writePushLog({
    uid: a.uid,
    fp: incomingFp,
    biz: incomingBiz,
    resultFp: bizFp(merged),
    stored: true,
    stripped: false,
    clientUpdatedAt: incomingUpdatedAt,
    event,
  });
  return json(200, { ok: true, data: merged, updatedAt: storedUpdatedAt }, o);
}

/* ---------- handlers（v0.5 HTTP 绑定端点） ---------- */
async function handleBindCode(event) {
  const o = origin(event);
  const a = await authedUid(event);
  if (a.error) return a.error;
  const r = await createBindCode(a.uid);
  if (!r.ok) return json(r.status, r.error, o);
  return json(200, { ok: true, code: r.code, expiresAt: r.expiresAt }, o);
}

async function handleBindIdentities(event) {
  const o = origin(event);
  const a = await authedUid(event);
  if (a.error) return a.error;
  const list = await listIdentities(a.uid);
  return json(200, {
    ok: true,
    identities: list.map((x) => ({
      identityId: x._id,
      identity: x.identity,
      provider: x.provider || WECHAT_PROVIDER,
      nickname: x.nickname || null,
      status: x.status || 'linked',
      mergePending: !!x.mergePending,
      linkedAt: x.linkedAt || null,
      mergedAt: x.mergedAt || null,
    })),
  }, o);
}

async function handleBindRevoke(event) {
  const o = origin(event);
  const a = await authedUid(event);
  if (a.error) return a.error;
  const body = readBody(event);
  if (!body || !body.identityId) return json(400, err(400, 'identity_required', '缺少 identityId'), o);
  const iden = await getIdentityById(String(body.identityId));
  if (!iden || iden.uid !== a.uid) return json(400, err(400, 'identity_required', '身份不存在或不属于当前账号'), o);
  if (iden.provider !== WECHAT_PROVIDER || !String(iden.identity || '').startsWith('wx:')) {
    return json(400, err(400, 'identity_required', '该身份不支持解绑'), o);
  }
  await getDb().collection(IDENTITIES).doc(iden._id).remove();
  return json(200, { ok: true }, o);
}

/** 合并预检（Web 侧）：列出当前账号下所有待合并身份 + 冲突 diff + 票据 */
async function handleBindMergePending(event) {
  const o = origin(event);
  const a = await authedUid(event);
  if (a.error) return a.error;
  const list = await listIdentities(a.uid);
  const items = [];
  for (const iden of list) {
    if (!iden.mergePending) continue;
    const tempUid = iden.tempUid || tempUidOf(iden.openid);
    const leftState = await loadState(a.uid);
    const rightState = await loadState(tempUid);
    const leftTime = new Date((leftState && leftState.updatedAt) || 0).getTime();
    const rightTime = new Date((rightState && rightState.updatedAt) || 0).getTime();
    const { conflicts, summary } = bindMerge(
      (leftState && leftState.data) || {},
      (rightState && rightState.data) || {},
      { leftTime, rightTime },
    );
    const { ticket } = issueMergeTicket(iden._id, a.uid, tempUid);
    items.push({
      identityId: iden._id,
      tempUid,
      ticket,
      conflicts,
      summary,
      generatedAt: new Date().toISOString(),
    });
  }
  return json(200, { ok: true, items }, o);
}

async function handleBindMergeApply(event) {
  const o = origin(event);
  const a = await authedUid(event);
  if (a.error) return a.error;
  const body = readBody(event);
  if (!body || !body.ticket) return json(400, err(400, 'merge_ticket_invalid', '缺少合并票据'), o);
  const payload = verifyMergeTicket(body.ticket);
  if (!payload || payload.uid !== a.uid) {
    return json(400, err(400, 'merge_ticket_invalid', '合并票据无效或已过期'), o);
  }
  const iden = await getIdentityById(payload.identityId);
  if (!iden || iden.uid !== a.uid) return json(400, err(400, 'merge_ticket_invalid', '合并票据与身份不匹配'), o);
  const r = await applyMerge(iden, body.choices, true);
  return json(200, { ok: true, data: r.data, updatedAt: r.updatedAt }, o);
}

/* ---------- callFunction（小程序侧） ---------- */
function isMpEvent(event) {
  return !!event && typeof event.action === 'string' && !event.httpMethod && !event.httpmethod;
}
function mpOpenid(event) {
  // wx-server-sdk 的 getWXContext 在云函数内可信返回微信侧身份
  try {
    const wx = (sdk().getWXContext ? sdk().getWXContext() : {}) || {};
    return wx.OPENID || (event && event.userInfo && event.userInfo.openId) || null;
  } catch (e) {
    return (event && event.userInfo && event.userInfo.openId) || null;
  }
}
function mpJson(obj) {
  return obj; // callFunction 直接返回对象
}
function mpErr(status, code, message) {
  return { error: { code, message } };
}

/** 小程序侧身份：已绑定 → canonical uid；未绑定 → 临时 uid（只读/写自己临时文档） */
async function mpResolve(openid, opts) {
  opts = opts || {};
  const iden = openid ? await getIdentityByOpenid(openid) : null;
  if (iden && iden.uid && !opts.tempOnly) {
    const user = await loadUserByUid(iden.uid);
    if (!user) return { error: mpErr(401, 'unauthorized', '账号不存在') };
    return { uid: iden.uid, tempUid: iden.tempUid || tempUidOf(openid), identity: iden, bound: true, username: user.username, nickname: user.nickname || null };
  }
  if (!openid) return { error: mpErr(401, 'identity_required', '缺少微信身份，请在微信内打开') };
  return { uid: tempUidOf(openid), tempUid: tempUidOf(openid), identity: iden || null, bound: false, openid };
}

async function mpPing() {
  let appid = null;
  try { const wx = sdk().getWXContext ? sdk().getWXContext() : {}; appid = wx.APPID || null; } catch (e) { /* 忽略 */ }
  return { ok: true, authed: true, appid };
}

async function mpLogin(openid) {
  const r = await mpResolve(openid);
  if (r.error) return r.error;
  return {
    ok: true,
    bound: !!r.bound,
    uid: r.bound ? r.uid : undefined,
    tempUid: r.tempUid,
    nickname: r.nickname || null,
    username: r.username || null,
  };
}

/** 口令登录（主路径）：复用 /api/auth/login 的校验与锁定逻辑，成功即绑定 */
async function mpLoginPassword(openid, body) {
  if (!openid) return mpErr(401, 'identity_required', '缺少微信身份，请在微信内打开');
  if (!body || !body.username || !body.password) {
    return mpErr(400, 'bad_request', '请填写用户名和密码');
  }
  const user = await loadUserByUsername(String(body.username).trim());
  if (!user) return mpErr(401, 'invalid_credentials', '用户名或密码不正确');
  const now = Date.now();
  if (user.lockedUntil && new Date(user.lockedUntil).getTime() > now) {
    return mpErr(429, 'rate_limited', '尝试次数过多，请 15 分钟后再试');
  }
  if (!verifyPassword(String(body.password), user.pwdHash)) {
    const failed = (user.failedCount || 0) + 1;
    const patch = { failedCount: failed, updatedAt: new Date(now).toISOString() };
    if (failed >= MAX_FAILED) patch.lockedUntil = new Date(now + LOCK_MS).toISOString();
    await getDb().collection(USERS).doc(user.uid).update(patch);
    return mpErr(401, 'invalid_credentials', '用户名或密码不正确');
  }
  await getDb().collection(USERS).doc(user.uid).update({
    failedCount: 0,
    lockedUntil: null,
    lastLoginAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
  });

  const linked = await linkIdentity(openid, user.uid, 'mp_login_password');
  if (!linked.ok) return linked.error;
  const out = {
    ok: true,
    uid: linked.uid,
    username: user.username,
    bound: true,
    mergeRequired: !!linked.mergeRequired,
    merged: !!linked.merged,
  };
  if (linked.mergeRequired) {
    out.ticket = linked.ticket;
    out.conflicts = linked.conflicts;
    out.summary = linked.summary;
  }
  return out;
}

/** 恢复未完成的合并（小程序冷启动后 / 中途退出） */
async function mpMergeStatus(openid) {
  const r = await mpResolve(openid);
  if (r.error) return r.error;
  if (!r.bound || !r.identity) return { ok: true, mergeRequired: false };
  if (!r.identity.mergePending) return { ok: true, mergeRequired: false };
  const tempUid = r.identity.tempUid || tempUidOf(openid);
  const leftState = await loadState(r.uid);
  const rightState = await loadState(tempUid);
  const leftTime = new Date((leftState && leftState.updatedAt) || 0).getTime();
  const rightTime = new Date((rightState && rightState.updatedAt) || 0).getTime();
  const { conflicts, summary } = bindMerge(
    (leftState && leftState.data) || {},
    (rightState && rightState.data) || {},
    { leftTime, rightTime },
  );
  const { ticket } = issueMergeTicket(r.identity._id, r.uid, tempUid);
  return { ok: true, mergeRequired: true, ticket, conflicts, summary };
}

async function mpMergeApply(openid, body) {
  const r = await mpResolve(openid);
  if (r.error) return r.error;
  if (!r.bound || !r.identity) return mpErr(400, 'merge_ticket_invalid', '当前身份没有待合并的数据');
  if (!body || !body.ticket) return mpErr(400, 'merge_ticket_invalid', '缺少合并票据');
  const payload = verifyMergeTicket(body.ticket);
  if (!payload || payload.uid !== r.identity.uid || payload.identityId !== r.identity._id) {
    return mpErr(400, 'merge_ticket_invalid', '合并票据无效或已过期');
  }
  const res = await applyMerge(r.identity, body.choices, true);
  return { ok: true, data: res.data, updatedAt: res.updatedAt };
}

/** 小程序 pull/push：与 HTTP 侧同一份业务 handler（按 uid 而非 token） */
async function mpPull(uid) {
  const doc = await getItemsDoc(uid);
  if (!doc) return { ok: true, data: null, updatedAt: null };
  return { ok: true, data: doc.data || null, updatedAt: doc.updatedAt || null };
}

async function mpPush(uid, body) {
  if (!body || body.data == null || typeof body.data !== 'object') {
    return mpErr(400, 'bad_request', '缺少同步数据');
  }
  const incomingUpdatedAt = body.updatedAt || new Date().toISOString();
  const existing = await getItemsDoc(uid);
  // 与 HTTP push 同一道清空式护栏：小程序端同样不允许空数据覆盖云端
  if (existing && existing.data && businessEmpty(body.data) && !businessEmpty(existing.data)) {
    await writePushLog({
      uid,
      fp: bizFp(body.data),
      biz: bizOf(body.data),
      resultFp: bizFp(existing.data),
      stored: false,
      stripped: true,
      clientUpdatedAt: incomingUpdatedAt,
      event: {},
    });
    return { ok: true, data: existing.data, updatedAt: existing.updatedAt || null, strippedEmptyPush: true };
  }
  let merged = body.data;
  if (existing && existing.data) {
    // 同 HTTP 侧：顶层 updatedAt 补位，避免客户端漏写 data.updatedAt 时静默不生效
    const incomingData = Object.assign({}, body.data);
    if (!incomingData.updatedAt && incomingUpdatedAt) incomingData.updatedAt = incomingUpdatedAt;
    merged = mergeFields(existing.data, incomingData);
  }
  const storedUpdatedAt = new Date().toISOString();
  const doc = itemsDoc(uid, merged, storedUpdatedAt, existing);
  await saveItemsDoc(uid, doc, existing);
  await writePushLog({
    uid,
    fp: bizFp(body.data),
    biz: bizOf(body.data),
    resultFp: bizFp(merged),
    stored: true,
    stripped: false,
    clientUpdatedAt: incomingUpdatedAt,
    event: {},
  });
  return { ok: true, data: merged, updatedAt: storedUpdatedAt };
}

async function dispatchMp(event) {
  const action = String(event.action || '');
  const openid = mpOpenid(event);
  try {
    switch (action) {
      case 'ping':
        return await mpPing();
      case 'mpLogin':
        return await mpLogin(openid);
      case 'mpLoginPassword':
        return await mpLoginPassword(openid, event);
      case 'bind':
        return await (async () => {
          const r = await consumeBindCode(event.code, openid);
          if (!r.ok) return r.error;
          const out = {
            ok: true,
            uid: r.uid,
            bound: true,
            mergeRequired: !!r.mergeRequired,
            merged: !!r.merged,
          };
          if (r.mergeRequired) {
            out.ticket = r.ticket;
            out.conflicts = r.conflicts;
            out.summary = r.summary;
          }
          return out;
        })();
      case 'mpMergeStatus':
        return await mpMergeStatus(openid);
      case 'mpMergeApply':
        return await mpMergeApply(openid, event);
      case 'pull':
      case 'push': {
        const r = await mpResolve(openid);
        if (r.error) return r.error;
        // 未绑定的临时身份只能读写自己的临时文档（wx_<openid>）
        return action === 'pull' ? await mpPull(r.uid) : await mpPush(r.uid, event);
      }
      default:
        return mpErr(404, 'not_found', '未知 action');
    }
  } catch (e) {
    console.error('hwSyncApi mp error:', e && e.stack);
    return mpErr(500, 'internal', '服务异常，请稍后重试');
  }
}

/* ---------- router ---------- */
function route(path) {
  const p = String(path || '');
  if (/auth\/login$/.test(p)) return 'login';
  if (/sync\/pull$/.test(p)) return 'pull';
  if (/sync\/push$/.test(p)) return 'push';
  if (/bind\/code$/.test(p)) return 'bind_code';
  if (/bind\/identities$/.test(p)) return 'bind_identities';
  if (/bind\/revoke$/.test(p)) return 'bind_revoke';
  if (/bind\/merge\/pending$/.test(p)) return 'bind_merge_pending';
  if (/bind\/merge\/apply$/.test(p)) return 'bind_merge_apply';
  return null;
}

exports.main = async (event) => {
  try {
    // 双入口：callFunction（event.action）优先
    if (isMpEvent(event)) {
      return await dispatchMp(event);
    }
    const o = origin(event);
    const method = (event.httpMethod || event.httpmethod || '').toUpperCase();
    const path = event.path || (event.requestContext && event.requestContext.http && event.requestContext.http.path) || '';
    if (method === 'OPTIONS') {
      return { statusCode: 204, headers: corsHeaders(o), body: '', isBase64Encoded: false };
    }
    if (method !== 'POST') {
      return json(404, err(404, 'not_found', '接口不存在'), o);
    }
    const name = route(path);
    if (name === 'login') return await handleLogin(event);
    if (name === 'pull') return await handlePull(event);
    if (name === 'push') return await handlePush(event);
    if (name === 'bind_code') return await handleBindCode(event);
    if (name === 'bind_identities') return await handleBindIdentities(event);
    if (name === 'bind_revoke') return await handleBindRevoke(event);
    if (name === 'bind_merge_pending') return await handleBindMergePending(event);
    if (name === 'bind_merge_apply') return await handleBindMergeApply(event);
    return json(404, err(404, 'not_found', '接口不存在'), o);
  } catch (e) {
    console.error('hwSyncApi error:', e && e.stack);
    return json(500, err(500, 'internal', '服务异常，请稍后重试'), o);
  }
};

/* ---------- 供单测使用的纯逻辑（不触数据库、不需要 SDK） ---------- */
exports._internal = {
  MERGE_COLLECTIONS,
  MERGE_SCALARS,
  MERGE_UNION_ARRAYS,
  SERVER_ONLY_KEYS,
  businessEmpty,
  mergeFields,
  bindMerge,
  applyChoices,
  entryIdOf,
  entryFieldDiff,
  bizOf,
  stable,
  bizFp,
  genBindCode,
  signMergeTicket,
  verifyMergeTicket,
  sign,
  verifyToken,
  hashPassword,
  verifyPassword,
  route,
  isMpEvent,
};
