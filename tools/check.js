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

console.log('\n[1/8] JS 语法检查（' + jsFiles.length + ' 个文件）');
jsFiles.forEach(function (f) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
  } catch (e) {
    fail(rel(f) + ' 语法错误：' + String(e.stderr || e.message).split('\n').slice(0, 3).join(' '));
  }
});
if (!errors) ok('全部通过');

/* ---------- 2. JSON 语法 ---------- */
console.log('\n[2/8] JSON 解析检查（' + jsonFiles.length + ' 个文件）');
jsonFiles.forEach(function (f) {
  try {
    JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch (e) {
    fail(rel(f) + ' 解析失败：' + e.message);
  }
});
if (!errors) ok('全部通过');

/* ---------- 3. app.json 页面四件套 ---------- */
console.log('\n[3/8] 页面四件套完整性');
const appJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
const ALL_PAGES = require('./fixtures.js').allPages(appJson);
ALL_PAGES.forEach(function (p) {
  ['js', 'json', 'wxml', 'wxss'].forEach(function (ext) {
    const f = path.join(ROOT, p + '.' + ext);
    if (!fs.existsSync(f)) fail('缺少文件 ' + p + '.' + ext);
  });
});
ok('共 ' + ALL_PAGES.length + ' 个页面（主包 ' + (appJson.pages || []).length + '，分包 ' + (ALL_PAGES.length - (appJson.pages || []).length) + '）');

/* ---------- 4. require 路径 + 越界判定 ---------- */
console.log('\n[4/8] require 路径与越界');
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
    // 存储子模块只能经门面 utils/store.js 访问（加载顺序和 ctx 注册都在门面里）
    const from = rel(f);
    if (/^utils\/store\//.test(rel(hit)) && from !== 'utils/store.js' && !/^utils\/store\//.test(from)) {
      fail(from + ' → 直接 require 了 ' + rel(hit) + '，请改为 require utils/store.js');
    }
  }
});
if (!errors) ok('全部通过');

/* ---------- 5. wxml 事件绑定 → js 方法 ---------- */
console.log('\n[5/8] wxml 事件绑定');
wxmlFiles.forEach(function (f) {
  const wxml = fs.readFileSync(f, 'utf8');
  const jsPath = f.replace(/\.wxml$/, '.js');
  if (!fs.existsSync(jsPath)) return;
  let js = fs.readFileSync(jsPath, 'utf8');
  // 页面通过 Object.assign({}, xxx.methods, {...}) 混入共享方法时，把被 require 的模块源码也算进来
  const mixRe = /const\s+(\w+)\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)/g;
  let mx;
  while ((mx = mixRe.exec(js))) {
    if (!new RegExp('\\b' + mx[1] + '\\.methods\\b').test(js)) continue;
    const modPath = path.resolve(path.dirname(jsPath), /\.js$/.test(mx[2]) ? mx[2] : mx[2] + '.js');
    if (fs.existsSync(modPath)) js += '\n' + fs.readFileSync(modPath, 'utf8');
  }

  // 模板文件里的事件（<import> 进来的）也要能在页面 js（含混入）里找到
  const impRe = /<import\s+src="([^"]+)"/g;
  let im;
  let wxmlAll = wxml;
  while ((im = impRe.exec(wxml))) {
    const tp = im[1].charAt(0) === '/' ? path.join(ROOT, im[1]) : path.resolve(path.dirname(f), im[1]);
    if (fs.existsSync(tp)) wxmlAll += '\n' + fs.readFileSync(tp, 'utf8');
    else fail(rel(f) + ' → import 的模板不存在：' + im[1]);
  }

  const re = /\b(?:bind|catch)([a-zA-Z]+)\s*=\s*"([^"{}]+)"/g;
  let m;
  while ((m = re.exec(wxmlAll))) {
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
console.log('\n[6/8] 自定义组件声明');
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
console.log('\n[7/8] 合规与包体');
ALL_PAGES.forEach(function (p) {
  const f = path.join(ROOT, p + '.wxml');
  if (!fs.existsSync(f)) return;
  const wxml = fs.readFileSync(f, 'utf8');
  if (wxml.indexOf('<disclaimer') === -1) fail(p + ' 缺少免责声明组件');
});

const BANNED = ['算命', '占卜', '吉凶', '祸福', '转运', '改命', '塔罗', '星盘', '生辰八字', '预测财运'];
// 健康类：只能说「参考 / 建议就医」，不能下诊断、承诺疗效（类目审核的红线）
const OLD_TERMS = ['带娃人', '一起带娃的人', '这台手机是谁在记'];
const MEDICAL_BANNED = ['确诊', '诊断为', '治愈', '根治', '疗效', '患有', '一定是', '肯定是', '保证没事', '不用去医院'];
files.forEach(function (f) {
  const src = fs.readFileSync(f, 'utf8');
  BANNED.forEach(function (w) {
    if (src.indexOf(w) > -1) fail(rel(f) + ' 命中禁词「' + w + '」');
  });
  if (/^(data|utils|pages|components)\//.test(rel(f))) {
    // 只查用户能看到的字符串，注释里讨论这些词没关系
    const strings = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    MEDICAL_BANNED.forEach(function (w) {
      if (strings.indexOf(w) > -1) fail(rel(f) + ' 健康文案用了诊断/承诺式说法「' + w + '」，请改成参考式');
    });
    // 称呼统一：一起带娃的人一律叫「家人」，这台手机的记录人叫「我是谁」
    OLD_TERMS.forEach(function (w) {
      if (strings.indexOf(w) > -1) fail(rel(f) + ' 用了旧称呼「' + w + '」，统一叫「家人」/「我是谁」');
    });
  }
});

/* 分包：主包里的代码不能 require 分包里的文件（分包可能还没下载），分包之间也不能互相 require */
const SUBS = (appJson.subPackages || []).map(function (sp) {
  return sp.root.replace(/\/$/, '') + '/';
});
function subOf(relPath) {
  for (let i = 0; i < SUBS.length; i++) if (relPath.indexOf(SUBS[i]) === 0) return SUBS[i];
  return '';
}
const IMG_RE = /\.(png|jpe?g|gif|webp|svg)$/;
// 体积统计按 project.config.json 的 packOptions.ignore 排除（和真正上传的内容一致）
const PACK_IGNORE = ((JSON.parse(fs.readFileSync(path.join(ROOT, 'project.config.json'), 'utf8')).packOptions || {}).ignore || []);
function packIgnored(relPath, isDir) {
  return PACK_IGNORE.some(function (r) {
    if (r.type === 'folder') return isDir && (relPath === r.value || relPath.indexOf(r.value + '/') === 0);
    if (r.type === 'file') return relPath === r.value;
    if (r.type === 'suffix') return !isDir && relPath.slice(-r.value.length) === r.value;
    return false;
  });
}
let mainBytes = 0;
const subBytes = {};
(function sizeWalk(dir) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (ent) {
    const full = path.join(dir, ent.name);
    const r = rel(full);
    if (ent.isDirectory()) {
      if (SKIP_DIRS.indexOf(ent.name) > -1 || packIgnored(r, true)) return;
      sizeWalk(full);
      return;
    }
    if (packIgnored(r, false)) return;
    if (!/\.(js|json|wxml|wxss)$/.test(ent.name) && !IMG_RE.test(ent.name)) return;
    const sub = subOf(r);
    const b = fs.statSync(full).size;
    if (sub) subBytes[sub] = (subBytes[sub] || 0) + b;
    else mainBytes += b;
  });
})(ROOT);
let crossBad = 0;
jsFiles.forEach(function (f) {
  const from = rel(f);
  const fromSub = subOf(from);
  const src = fs.readFileSync(f, 'utf8');
  const re = /require\(\s*['"](\.[^'"]+)['"]\s*\)/g;
  let m;
  while ((m = re.exec(src))) {
    const target = rel(path.resolve(path.dirname(f), /\.js$/.test(m[1]) ? m[1] : m[1] + '.js'));
    const toSub = subOf(target);
    if (toSub && toSub !== fromSub) {
      crossBad++;
      fail(from + ' → require 了分包里的 ' + target + '（' + (fromSub ? '分包之间不能互相引用' : '主包不能引用分包，分包可能还没下载') + '）');
    }
  }
});
if (!crossBad && SUBS.length) ok('没有跨包 require（' + SUBS.length + ' 个分包）');
const kb = (mainBytes / 1024).toFixed(1);
if (mainBytes > 2 * 1024 * 1024) fail('主包体积 ' + kb + 'KB 超过 2MB 上限');
else ok('主包体积约 ' + kb + ' KB（上限 2048 KB）');
const subTotal = Object.keys(subBytes).reduce(function (s, k) {
  return s + subBytes[k];
}, 0);
Object.keys(subBytes).forEach(function (k) {
  if (subBytes[k] > 2 * 1024 * 1024) fail('分包 ' + k + ' 超过 2MB');
});
if (SUBS.length) {
  const biggest = Object.keys(subBytes).sort(function (a, b) {
    return subBytes[b] - subBytes[a];
  })[0];
  ok('分包合计约 ' + (subTotal / 1024).toFixed(1) + ' KB，最大 ' + biggest + ' ' + (subBytes[biggest] / 1024).toFixed(1) + ' KB；整包 ' + ((mainBytes + subTotal) / 1024).toFixed(1) + ' KB（上限 20MB）');
}

/* ---------- 8. 设计 token：颜色只在 app.wxss 定义一次，页面里一律 var(--xxx) ---------- */
console.log('\n[8/8] 设计 token 与字号');
(function () {
  const appWxss = fs.readFileSync(path.join(ROOT, 'app.wxss'), 'utf8');
  const defined = {};
  let m;
  const defRe = /--([a-z0-9-]+)\s*:/g;
  while ((m = defRe.exec(appWxss))) defined[m[1]] = true;
  const wxssFiles = walk(ROOT, []).filter(function (f) {
    return /\.wxss$/.test(f);
  });
  let hexHits = 0;
  let smallHits = 0;
  wxssFiles.forEach(function (f) {
    const isApp = rel(f) === 'app.wxss';
    const src = fs.readFileSync(f, 'utf8');
    // app.wxss 里 token 定义块本身允许写色值
    const body = isApp ? src.replace(/\/\* ==== design tokens[\s\S]*?\/\* ==== \/design tokens ==== \*\//, '') : src;
    const hex = body.match(/#[0-9A-Fa-f]{3,8}\b/g);
    if (hex) {
      hexHits += hex.length;
      fail(rel(f) + ' 写死了颜色 ' + hex.slice(0, 3).join(' ') + '，请改用 var(--token)');
    }
    const useRe = /var\(--([a-z0-9-]+)\)/g;
    while ((m = useRe.exec(src))) {
      if (!defined[m[1]]) fail(rel(f) + ' 用到了未定义的 token --' + m[1]);
    }
    // 正文最小 22rpx；圆形徽标里的字形可以写注释豁免
    src.split('\n').forEach(function (line) {
      const fm = line.match(/font-size:\s*(\d+)rpx/);
      if (fm && Number(fm[1]) < 22 && line.indexOf('豁免最小字号') === -1) {
        smallHits++;
        fail(rel(f) + ' 字号 ' + fm[1] + 'rpx 小于 22rpx');
      }
    });
  });
  if (!hexHits) ok('页面样式没有写死的颜色（' + Object.keys(defined).length + ' 个 token）');

  // canvas 用的 utils/theme.js 必须和 app.wxss 同步
  const gen = require('child_process').spawnSync(process.execPath, [path.join(__dirname, 'gen-theme.js'), '--check']);
  if (gen.status !== 0) fail('utils/theme.js 和 app.wxss 的 token 不一致，跑一下 node tools/gen-theme.js');
  else ok('utils/theme.js 与 token 同步');

  // 深色模式：每个浅色 token 都要有深色值（--on-brand 这类刻意不变的除外）
  const SAME_IN_DARK = ['on-brand'];
  const darkBlock = appWxss.match(/@media \(prefers-color-scheme: dark\)[\s\S]*?\n\}/);
  if (darkBlock) {
    const missing = Object.keys(defined).filter(function (n) {
      return SAME_IN_DARK.indexOf(n) === -1 && darkBlock[0].indexOf('--' + n + ':') === -1;
    });
    if (missing.length) fail('深色模式缺少这些 token：' + missing.join(', '));
    else ok('深色模式覆盖了全部 token');
  }

  // theme.json 里引用的图标文件都要存在
  const themePath = path.join(ROOT, 'theme.json');
  if (fs.existsSync(themePath)) {
    const theme = JSON.parse(fs.readFileSync(themePath, 'utf8'));
    let bad = 0;
    ['light', 'dark'].forEach(function (mode) {
      Object.keys(theme[mode] || {}).forEach(function (k) {
        const v = theme[mode][k];
        if (/\.png$/.test(v) && !fs.existsSync(path.join(ROOT, v))) {
          bad++;
          fail('theme.json ' + mode + '.' + k + ' 指向的图标不存在：' + v);
        }
      });
    });
    const used = JSON.stringify(appJson).match(/@[A-Za-z]+/g) || [];
    used.forEach(function (ref) {
      const key = ref.slice(1);
      if (!(theme.light && key in theme.light) || !(theme.dark && key in theme.dark)) {
        bad++;
        fail('app.json 用到的主题变量 ' + ref + ' 在 theme.json 的 light/dark 里没有都定义');
      }
    });
    if (!bad) ok('theme.json 变量与图标齐全');
  }
  if (!smallHits) ok('正文字号全部 ≥ 22rpx');
})();

/* ---------- 汇总 ---------- */
console.log('\n========================================');
console.log('问题: ' + errors + ' 条，提示: ' + warnings + ' 条');
console.log('========================================\n');
process.exit(errors ? 1 : 0);
