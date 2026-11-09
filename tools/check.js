#!/usr/bin/env node
/**
 * tools/check.js —— 小程序工程静态体检（零依赖）
 * 覆盖：JS 语法 / JSON 语法 / 页面四件套 / require 路径与越界 / wxml 事件绑定 / 组件声明 / 免责声明覆盖
 * 用法：node tools/check.js
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SKIP_DIRS = ['node_modules', '.workbuddy', '.git', 'tools', 'cloudfunctions'];

let errors = 0;
let warnings = 0;

function fail(msg) {
  errors++;
  console.log('  ✗ ' + msg);
}

function warn(msg) {
  warnings++;
  console.log('  ! ' + msg);
}

function ok(msg) {
  console.log('  ✓ ' + msg);
}

function walk(dir, out) {
  const list = fs.readdirSync(dir, { withFileTypes: true });
  list.forEach(function (ent) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (SKIP_DIRS.indexOf(ent.name) > -1) return;
      walk(full, out);
    } else {
      if (/\.(js|json|wxml|wxss)$/.test(ent.name)) out.push(full);
    }
  });
  return out;
}

function rel(p) {
  return path.relative(ROOT, p);
}

function isInsideRoot(p) {
  const r = path.relative(ROOT, p);
  return !!r && !r.startsWith('..') && !path.isAbsolute(r);
}

/* ---------- 1. 收集文件 ---------- */
const files = walk(ROOT, []);
const jsFiles = files.filter(function (f) {
  return f.endsWith('.js');
});
const jsonFiles = files.filter(function (f) {
  return f.endsWith('.json');
});
const wxmlFiles = files.filter(function (f) {
  return f.endsWith('.wxml');
});

console.log('\n[1/7] JS 语法检查（' + jsFiles.length + ' 个文件）');
jsFiles.forEach(function (f) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
  } catch (e) {
    fail(rel(f) + ' 语法错误：' + String(e.stderr || e.message).split('\n').slice(0, 3).join(' '));
  }
});
if (!errors) ok('全部通过');

/* ---------- 2. JSON 语法 ---------- */
console.log('\n[2/7] JSON 解析检查（' + jsonFiles.length + ' 个文件）');
jsonFiles.forEach(function (f) {
  try {
    JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch (e) {
    fail(rel(f) + ' 解析失败：' + e.message);
  }
});
if (!errors) ok('全部通过');

/* ---------- 3. app.json 页面四件套 ---------- */
console.log('\n[3/7] 页面四件套完整性');
const appJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
(appJson.pages || []).forEach(function (p) {
  ['js', 'json', 'wxml', 'wxss'].forEach(function (ext) {
    const f = path.join(ROOT, p + '.' + ext);
    if (!fs.existsSync(f)) fail('缺少文件 ' + p + '.' + ext);
  });
});
ok('共 ' + (appJson.pages || []).length + ' 个页面');

/* ---------- 4. require 路径 + 越界判定 ---------- */
console.log('\n[4/7] require 路径与越界');
jsFiles.forEach(function (f) {
  const src = fs.readFileSync(f, 'utf8');
  const re = /require\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m;
  while ((m = re.exec(src))) {
    const spec = m[1];
    if (spec.charAt(0) !== '.') continue; // 内置模块或 npm 包
    const base = path.resolve(path.dirname(f), spec);
    const candidates = [base, base + '.js', path.join(base, 'index.js')];
    const hit = candidates.find(function (c) {
      return fs.existsSync(c) && fs.statSync(c).isFile();
    });
    if (!hit) {
      fail(rel(f) + ' → 找不到模块 ' + spec);
      continue;
    }
    if (!isInsideRoot(hit)) {
      fail(rel(f) + ' → require 越出工程根：' + spec + '（解析到 ' + hit + '）');
    }
  }
});
if (!errors) ok('全部通过');

/* ---------- 5. wxml 事件绑定 → js 方法 ---------- */
console.log('\n[5/7] wxml 事件绑定');
wxmlFiles.forEach(function (f) {
  const wxml = fs.readFileSync(f, 'utf8');
  const jsPath = f.replace(/\.wxml$/, '.js');
  if (!fs.existsSync(jsPath)) return;
  const js = fs.readFileSync(jsPath, 'utf8');

  const re = /\b(?:bind|catch)([a-zA-Z]+)\s*=\s*"([^"{}]+)"/g;
  let m;
  while ((m = re.exec(wxml))) {
    const handler = m[2].trim();
    const exists =
      new RegExp('(^|[^\\w.])' + handler + '\\s*[:(]').test(js) ||
      new RegExp(handler + '\\s*:\\s*function').test(js);
    if (!exists) fail(rel(f) + ' → 事件 ' + handler + ' 在 js 中不存在');
  }

  // 按钮样式但没有任何事件
  const btnRe = /<(view|view|button)[^>]*class="[^"]*\bbtn\b[^"]*"[^>]*>/g;
  let b;
  while ((b = btnRe.exec(wxml))) {
    const tag = b[0];
    if (!/bindtap|catchtap|open-type|bind:tap/.test(tag)) {
      warn(rel(f) + ' → 有一个按钮样式元素没有绑定事件：' + tag.slice(0, 80));
    }
  }

  // wx:for-item 改名后仍引用 item（选中态会静默失效）
  const itemRe = /<[a-z-]+[^>]*wx:for-item="([^"]+)"[^>]*>/g;
  let it;
  while ((it = itemRe.exec(wxml))) {
    const alias = it[1];
    if (alias === 'item') continue;
    // wx:for 表达式里出现 outer item 是合法的（嵌套循环），先剔除再判断
    const cleaned = it[0].replace(/wx:for="[^"]*"/, '');
    if (/\bitem\.|\bitem\}\}/.test(cleaned)) {
      fail(rel(f) + ' → wx:for-item 已改名为 ' + alias + '，但标签里仍在用 item');
    }
  }
});
if (!errors) ok('全部通过');

/* ---------- 6. usingComponents ---------- */
console.log('\n[6/7] 自定义组件声明');
jsonFiles.forEach(function (f) {
  if (f.indexOf(path.join(ROOT, 'pages')) !== 0 && f.indexOf(path.join(ROOT, 'components')) !== 0) return;
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch (e) {
    return;
  }
  const comps = cfg.usingComponents || {};
  Object.keys(comps).forEach(function (k) {
    const p = comps[k];
    const abs = p.charAt(0) === '/' ? path.join(ROOT, p.slice(1)) : path.resolve(path.dirname(f), p);
    ['js', 'json', 'wxml', 'wxss'].forEach(function (ext) {
      if (!fs.existsSync(abs + '.' + ext)) fail(rel(f) + ' → 组件 ' + k + ' 缺少 ' + ext);
    });
    const cjson = JSON.parse(fs.readFileSync(abs + '.json', 'utf8'));
    if (cjson.component !== true) fail(rel(f) + ' → 组件 ' + k + ' 的 json 缺少 "component": true');
  });
});
if (!errors) ok('全部通过');

/* ---------- 7. 免责声明 + 合规禁词 + 主包体积 ---------- */
console.log('\n[7/7] 合规与包体');
(appJson.pages || []).forEach(function (p) {
  const f = path.join(ROOT, p + '.wxml');
  if (!fs.existsSync(f)) return;
  const wxml = fs.readFileSync(f, 'utf8');
  if (wxml.indexOf('<disclaimer') === -1) fail(p + ' 缺少免责声明组件');
});

const BANNED = ['算命', '占卜', '吉凶', '祸福', '转运', '改命', '塔罗', '星盘', '生辰八字', '预测财运'];
files.forEach(function (f) {
  const src = fs.readFileSync(f, 'utf8');
  BANNED.forEach(function (w) {
    if (src.indexOf(w) > -1) fail(rel(f) + ' 命中禁词「' + w + '」');
  });
});

let total = 0;
walk(ROOT, []).forEach(function (f) {
  total += fs.statSync(f).size;
});
const kb = (total / 1024).toFixed(1);
if (total > 2 * 1024 * 1024) fail('主包体积 ' + kb + 'KB 超过 2MB 上限');
else ok('主包体积约 ' + kb + ' KB（上限 2048 KB）');

/* ---------- 汇总 ---------- */
console.log('\n========================================');
console.log('问题: ' + errors + ' 条，提示: ' + warnings + ' 条');
console.log('========================================\n');
process.exit(errors ? 1 : 0);
