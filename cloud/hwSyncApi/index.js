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
 * 契约与安全设计见 docs/v0.4-api-design.md。
 */
const crypto = require('crypto');
const cloudbase = require('@cloudbase/node-sdk');

const USERS = 'home_users';
const ITEMS = 'home_items';
const TOKEN_TTL_SEC = 30 * 24 * 60 * 60; // 30 天
const MAX_FAILED = 5;
const LOCK_MS = 15 * 60 * 1000;

const DEFAULT_ORIGINS = [
  'https://home.virola-eko.com',
  'https://home.matishare.com',
  'https://home-workbench.pages.dev',
];

let app = null;
let db = null;
function getDb() {
  if (!db) {
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

/* ---------- field-level merge (等价 v0.3 mergeData) ---------- */
function businessEmpty(st) {
  if (!st || typeof st !== 'object') return true;
  const n = (k) => (Array.isArray(st[k]) ? st[k].length : 0);
  return !n('items') && !n('wants') && !n('logs');
}
function mergeFields(base, incoming) {
  const result = JSON.parse(JSON.stringify(base));
  // 客户端时钟向前偏移会让其时间戳永远胜出（覆盖事故的放大器之一），
  // 双侧时间均钳制到服务器当前时间：晚于 now 的时间戳不给予胜出权
  const nowMs = Date.now();
  const baseTime = Math.min(
    new Date(base.updatedAt || base.exportedAt || 0).getTime() || 0,
    nowMs,
  );
  const inTime = Math.min(
    new Date(incoming.updatedAt || incoming.exportedAt || 0).getTime() || 0,
    nowMs,
  );
  const useIncoming = inTime >= baseTime;
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
function bearer(event) {
  const h = event.headers || {};
  const auth = h.authorization || h.Authorization || h.auth || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return '';
}
async function authedUid(event) {
  const payload = verifyToken(bearer(event));
  if (!payload) return { error: json(401, err(401, 'unauthorized', '请先登录'), origin(event)) };
  const res = await getDb().collection(USERS).doc(payload.uid).get().catch(() => null);
  const user = res && res.data && res.data[0];
  if (!user) return { error: json(401, err(401, 'unauthorized', '账号不存在'), origin(event)) };
  if ((user.tokenVersion || 0) !== (payload.tv || 0)) {
    return { error: json(401, err(401, 'unauthorized', '登录状态已失效，请重新登录'), origin(event)) };
  }
  return { uid: payload.uid };
}
const origin = (event) => (event.headers || {}).origin || (event.headers || {}).Origin;

/* ---------- handlers ---------- */
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
  const res = await getDb().collection(ITEMS).doc(a.uid).get().catch(() => null);
  const doc = res && res.data && res.data[0];
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
  const res = await getDb().collection(ITEMS).doc(a.uid).get().catch(() => null);
  const existing = res && res.data && res.data[0];
  /* 清空式覆盖护栏（2026-09-21 二次事故后追加）：客户端本地为空（新设备、
   * 或本地已被污染）时会推来一张空的业务表。若云端此刻仍有数据，这种推送
   * 一律**不落库**，直接原样返回云端数据——云端数据一旦被空推送覆盖就是
   * 不可逆的。代价：无法从空设备"清空云端"，需人工处理。 */
  if (existing && existing.data && businessEmpty(body.data) && !businessEmpty(existing.data)) {
    return json(200, {
      ok: true,
      data: existing.data,
      updatedAt: existing.updatedAt || null,
      strippedEmptyPush: true,
    }, o);
  }
  let merged = body.data;
  if (existing && existing.data) {
    merged = mergeFields(existing.data, body.data);
  }
  const storedUpdatedAt = new Date().toISOString();
  // 覆盖前留一深备份（prevData/prevUpdatedAt）：误覆盖可人工回滚，是硬拒收清空式
  // 推送的替代方案——硬拒会误杀「设置页刻意清空」的合法操作，备份保可回滚性
  const doc = {
    uid: a.uid,
    data: merged,
    updatedAt: storedUpdatedAt,
    prevData: existing && existing.data ? existing.data : null,
    prevUpdatedAt: existing && existing.updatedAt ? existing.updatedAt : null,
  };
  if (existing) {
    await getDb().collection(ITEMS).doc(a.uid).set(doc);
  } else {
    await getDb().collection(ITEMS).add(Object.assign({ _id: a.uid }, doc));
  }
  return json(200, { ok: true, data: merged, updatedAt: storedUpdatedAt }, o);
}

/* ---------- router ---------- */
function route(path) {
  const p = String(path || '');
  if (/auth\/login$/.test(p)) return 'login';
  if (/sync\/pull$/.test(p)) return 'pull';
  if (/sync\/push$/.test(p)) return 'push';
  return null;
}

exports.main = async (event) => {
  const o = origin(event);
  try {
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
    return json(404, err(404, 'not_found', '接口不存在'), o);
  } catch (e) {
    console.error('hwSyncApi error:', e && e.stack);
    return json(500, err(500, 'internal', '服务异常，请稍后重试'), o);
  }
};
