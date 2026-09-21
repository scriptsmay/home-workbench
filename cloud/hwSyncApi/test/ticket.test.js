'use strict';
/* hwSyncApi v0.5 单测：合并票据 + 绑定码 + 路由分流
 * 运行：node cloud/hwSyncApi/test/ticket.test.js
 * 纯逻辑测试。票据签名需要 HW_TOKEN_SECRET。 */
process.env.HW_TOKEN_SECRET = process.env.HW_TOKEN_SECRET || 'unit-test-secret';
const assert = require('assert');
const { _internal } = require('../index.js');
const { signMergeTicket, verifyMergeTicket, genBindCode, route, isMpEvent } = _internal;

let pass = 0;
let fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('ok   -', name); }
  catch (e) { fail++; console.error('FAIL -', name); console.error('       ' + (e && e.message)); }
}

/* ---------- 合并票据 ---------- */

t('票据：签发后可验签，负载完整', () => {
  const ticket = signMergeTicket({ k: 'merge', identityId: 'id1', uid: 'u1', tempUid: 'wx_oX', exp: Date.now() + 60000 });
  assert.ok(ticket.startsWith('mt.'));
  const p = verifyMergeTicket(ticket);
  assert.ok(p);
  assert.strictEqual(p.k, 'merge');
  assert.strictEqual(p.identityId, 'id1');
  assert.strictEqual(p.uid, 'u1');
  assert.strictEqual(p.tempUid, 'wx_oX');
});

t('票据：篡改负载 → 验签失败', () => {
  const ticket = signMergeTicket({ k: 'merge', identityId: 'id1', uid: 'u1', tempUid: 'wx_oX', exp: Date.now() + 60000 });
  const parts = ticket.split('.');
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  payload.uid = 'u2'; // 越权：把合并结果指到别的账号
  const forged = parts[0] + '.' + Buffer.from(JSON.stringify(payload)).toString('base64url') + '.' + parts[2];
  assert.strictEqual(verifyMergeTicket(forged), null);
});

t('票据：过期 → 拒绝', () => {
  const ticket = signMergeTicket({ k: 'merge', identityId: 'id1', uid: 'u1', tempUid: 'wx_oX', exp: Date.now() - 1000 });
  assert.strictEqual(verifyMergeTicket(ticket), null);
});

t('票据：缺少 k/uid/tempUid 或非 mt. 前缀 → 拒绝', () => {
  assert.strictEqual(verifyMergeTicket(signMergeTicket({ k: 'other', uid: 'u1', tempUid: 't', exp: Date.now() + 60000 })), null);
  assert.strictEqual(verifyMergeTicket('not-a-ticket'), null);
  assert.strictEqual(verifyMergeTicket(''), null);
  assert.strictEqual(verifyMergeTicket(null), null);
});

/* ---------- 绑定码 ---------- */

t('绑定码：6 位数字且首位非 0', () => {
  for (let i = 0; i < 200; i++) {
    const c = genBindCode();
    assert.ok(/^\d{6}$/.test(c), '格式: ' + c);
    assert.ok(c[0] !== '0', '首位非 0: ' + c);
  }
});

/* ---------- 路由分流 ---------- */

t('route: v0.4 三端点保持不变', () => {
  assert.strictEqual(route('/api/auth/login'), 'login');
  assert.strictEqual(route('/api/sync/pull'), 'pull');
  assert.strictEqual(route('/api/sync/push'), 'push');
});

t('route: v0.5 绑定端点', () => {
  assert.strictEqual(route('/api/bind/code'), 'bind_code');
  assert.strictEqual(route('/api/bind/identities'), 'bind_identities');
  assert.strictEqual(route('/api/bind/revoke'), 'bind_revoke');
  assert.strictEqual(route('/api/bind/merge/pending'), 'bind_merge_pending');
  assert.strictEqual(route('/api/bind/merge/apply'), 'bind_merge_apply');
});

t('route: 未知路径 → null', () => {
  assert.strictEqual(route('/api/nope'), null);
  assert.strictEqual(route(''), null);
});

t('isMpEvent: callFunction 与 HTTP 事件互斥判定', () => {
  assert.strictEqual(isMpEvent({ action: 'ping' }), true);
  assert.strictEqual(isMpEvent({ action: 'pull' }), true);
  assert.strictEqual(isMpEvent({ httpMethod: 'POST', path: '/api/sync/pull' }), false);
  assert.strictEqual(isMpEvent(null), false);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
