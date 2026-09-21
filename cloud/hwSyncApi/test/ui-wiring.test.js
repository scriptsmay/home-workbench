'use strict';
/* UI 接线审计（v0.5）
 *
 * 目的：把「按钮点了没反应」这类问题在无浏览器环境下自动抓出来。
 *   - Web：事件委托里 closest('#id') / closest('[data-x]') 的每个目标，
 *          是否真的在某处被渲染出来（id="..." / data-x="..."）？
 *   - 小程序：每个 .wxml 里的 bind / catch 事件处理函数，在对应 .js 里是否存在？
 *   - 小程序：app.json 里登记的每个页面，四个文件是否齐全？
 *
 * 运行：node cloud/hwSyncApi/test/ui-wiring.test.js
 */
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '../../..');                            // home-workbench
const MINI = path.resolve(__dirname, '../../../../home-workbench-miniapp');  // 同级仓

let pass = 0; let fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('ok   - ' + name); }
  catch (e) { fail++; console.log('FAIL - ' + name + '\n       ' + (e && e.message)); }
}
const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return ''; } };

/* ---------------- Web ---------------- */
const appJs = read(path.join(REPO, 'frontend/app.js'));
const indexHtml = read(path.join(REPO, 'frontend/index.html'));
const webHtmlAll = appJs + '\n' + indexHtml;

const referencedIds = new Set([...appJs.matchAll(/closest\(\s*'#([A-Za-z0-9_-]+)'/g)].map((m) => m[1]));
const producedIds = new Set([...webHtmlAll.matchAll(/id="([A-Za-z0-9_-]+)"/g)].map((m) => m[1]));

const referencedData = new Set([...appJs.matchAll(/closest\(\s*'\[(data-[A-Za-z0-9_-]+)\]'/g)].map((m) => m[1]));
const producedData = new Set([...webHtmlAll.matchAll(/(?:^|[\s"'<])(data-[A-Za-z0-9_-]+)(?:\s*=\s*["']|[\s/>]|$)/g)].map((m) => m[1]));

t('Web：事件委托引用的每个 #id 都被渲染出来', () => {
  const missing = [...referencedIds].filter((id) => !producedIds.has(id));
  if (missing.length) throw new Error('有监听但无产出（点了没反应）：' + missing.join(', '));
  if (!referencedIds.size) throw new Error('未解析到任何 closest(#id)');
});

t('Web：事件委托引用的每个 data-* 都被渲染出来', () => {
  const missing = [...referencedData].filter((d) => !producedData.has(d));
  if (missing.length) throw new Error('有监听但无产出：' + missing.join(', '));
});

t('Web：账号合并相关入口全部接线（生成码/处理合并/合并按钮/解绑/保留侧选择）', () => {
  const need = ['genBindCodeBtn', 'mergeResolveBtn', 'mergeUnionAll', 'data-mpick', 'data-revoke'];
  const miss = need.filter((k) => !webHtmlAll.includes(k));
  if (miss.length) throw new Error('缺少：' + miss.join(', '));
  // 生成器与监听两端都要在
  if (!/wechatCardHtml/.test(appJs) || !/renderMergeBody/.test(appJs)) throw new Error('缺少渲染函数');
});

t('Web：index.html 容器 id 与 app.js 使用一致（modal/toast/view）', () => {
  const need = ['modal', 'modalBody', 'modalFoot', 'viewEl'];
  const miss = need.filter((id) => !producedIds.has(id));
  if (miss.length) throw new Error('容器缺失：' + miss.join(', '));
});

/* ---------------- 小程序 ---------------- */
const appJson = JSON.parse(read(path.join(MINI, 'app.json')) || '{}');
const pages = appJson.pages || [];

t('小程序：app.json 登记的每个页面四个文件齐全', () => {
  const miss = [];
  for (const p of pages) {
    for (const ext of ['.js', '.json', '.wxml', '.wxss']) {
      if (!fs.existsSync(path.join(MINI, p + ext))) miss.push(p + ext);
    }
  }
  if (miss.length) throw new Error('缺文件：' + miss.join(', '));
  if (!pages.length) throw new Error('app.json 无 pages');
});

t('小程序：每个 .wxml 的事件处理函数在对应 .js 里都有实现', () => {
  const problems = [];
  for (const p of pages) {
    const wxml = read(path.join(MINI, p + '.wxml'));
    const js = read(path.join(MINI, p + '.js'));
    const handlers = new Set(
      [...wxml.matchAll(/\b(?:bind|catch)[A-Za-z]*\s*=\s*"([A-Za-z0-9_]+)"/g)].map((m) => m[1]),
    );
    for (const h of handlers) {
      const re = new RegExp('(^|[\\s,{])' + h + '\\s*[:(]', 'm');
      if (!re.test(js)) problems.push(p + ' → ' + h);
    }
  }
  if (problems.length) throw new Error('无实现的事件绑定（点了没反应）：' + problems.join(', '));
});

t('小程序：「合并数据」页与「输入绑定码」页已登记且接线到 v0.5 接口', () => {
  if (!pages.includes('pages/merge/merge')) throw new Error('app.json 未登记 pages/merge/merge');
  if (!pages.includes('pages/bind/bind')) throw new Error('app.json 未登记 pages/bind/bind');
  const mergeJs = read(path.join(MINI, 'pages/merge/merge.js'));
  const bindJs = read(path.join(MINI, 'pages/bind/bind.js'));
  if (!/mpMergeStatus/.test(mergeJs)) throw new Error('合并页未调用 mpMergeStatus');
  if (!/mpMergeApply/.test(mergeJs)) throw new Error('合并页未调用 mpMergeApply');
  if (!/app\.bindByCode|bindByCode/.test(bindJs)) throw new Error('绑定码页未调用 bindByCode');
});

console.log('\nWeb 引用 id=' + referencedIds.size + '，产出 id=' + producedIds.size +
  '；Web 引用 data=' + referencedData.size + '，产出 data=' + producedData.size +
  '；小程序页面=' + pages.length);
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
