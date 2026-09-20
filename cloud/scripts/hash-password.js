#!/usr/bin/env node
'use strict';
/*
 * 生成 home_users 账号的口令哈希（供管理端发号使用，不入库、不联网）。
 *
 *   node cloud/scripts/hash-password.js <username> [password]
 *
 * 密码可放在环境变量 HW_PWD 里以免进入 shell 历史：
 *   HW_PWD='xxxx' node cloud/scripts/hash-password.js alice
 *
 * 输出一段可直接写入 home_users 的 JSON。把 password 字段替换成 pwdHash 后，
 * 由管理员通过 tcb / 控制台插入集合，_id 与 uid 填同一个稳定 uid。
 */
const crypto = require('crypto');

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return salt.toString('hex') + ':' + hash.toString('hex');
}

const username = process.argv[2];
const password = process.argv[3] || process.env.HW_PWD;
if (!username || !password) {
  console.error('用法: node hash-password.js <username> [password]  (或设 HW_PWD 环境变量)');
  process.exit(1);
}
const now = new Date().toISOString();
const doc = {
  _id: '<填写稳定 uid>',
  uid: '<填写稳定 uid>',
  username: username,
  pwdHash: hashPassword(password),
  nickname: username,
  tokenVersion: 0,
  failedCount: 0,
  lockedUntil: null,
  createdAt: now,
  updatedAt: now,
  lastLoginAt: null,
};
console.log(JSON.stringify(doc, null, 2));
