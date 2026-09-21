'use strict';
/* run-all.js — hwSyncApi v0.5 一键验证入口
 *
 * 依次跑完全部测试套件，汇总通过数并写出 test-report.md。
 * 用法：node cloud/hwSyncApi/test/run-all.js
 * 退出码：全部通过 = 0；任一失败 = 1（可直接用于 CI / 上线前门禁）。
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SUITES = [
  ['bindMerge.test.js', '合并语义与护栏回归'],
  ['ticket.test.js', '合并票据 / 绑定码 / 路由'],
  ['integration.test.js', '端到端集成（内存库驱动 exports.main）'],
  ['conformance.test.js', '跨仓契约一致性（两端 action / 端点）'],
  ['ui-wiring.test.js', 'UI 接线审计（监听有产出、事件有实现）'],
];

const rows = [];
let totalPass = 0;
let totalFail = 0;
let totalSkip = 0;

for (const [file, desc] of SUITES) {
  const abs = path.join(__dirname, file);
  if (!fs.existsSync(abs)) { totalSkip++; rows.push([file, desc, '—', 'SKIP（文件缺失）']); continue; }
  let out = '';
  let code = 0;
  try {
    out = execFileSync(process.execPath, [abs], { encoding: 'utf8' });
  } catch (e) {
    out = (e.stdout || '') + (e.stderr || '');
    code = e.status == null ? 1 : e.status;
  }
  const m = out.match(/(\d+) passed, (\d+) failed/);
  const p = m ? Number(m[1]) : 0;
  const f = m ? Number(m[2]) : 1;
  totalPass += p;
  totalFail += f;
  rows.push([file, desc, String(p), f ? 'FAIL ' + f + '（exit ' + code + '）' : 'ok']);
}

const stamp = new Date().toISOString();
const lines = [];
lines.push('# hwSyncApi v0.5 测试报告');
lines.push('');
lines.push('- 生成时间：' + stamp);
lines.push('- 通过：**' + totalPass + '**；失败：**' + totalFail + '**；跳过：' + totalSkip);
lines.push('');
lines.push('| 套件 | 覆盖 | 通过 | 结论 |');
lines.push('| --- | --- | --- | --- |');
for (const r of rows) lines.push('| `' + r[0] + '` | ' + r[1] + ' | ' + r[2] + ' | ' + r[3] + ' |');
lines.push('');
lines.push('复跑命令：`node cloud/hwSyncApi/test/run-all.js`');

const reportPath = path.join(__dirname, 'test-report.md');
fs.writeFileSync(reportPath, lines.join('\n') + '\n', 'utf8');

for (const r of rows) console.log(String(r[2]).padStart(4) + ' 通过  ' + r[0] + '  ' + r[3]);
console.log('\nTOTAL: ' + totalPass + ' passed, ' + totalFail + ' failed, ' + totalSkip + ' skipped');
console.log('报告已写入：' + reportPath);
process.exit(totalFail || totalSkip ? 1 : 0);
