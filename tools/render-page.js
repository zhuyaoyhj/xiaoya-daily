#!/usr/bin/env node
/**
 * tools/render-page.js —— 把一个页面按「真实页面逻辑算出的 data」渲染成 HTML，用来出预览截图
 *
 * 用法：node tools/render-page.js <页面路径，如 pages/index/index> <输出.html> [--dark] [--setup=脚本.js]
 *   --setup 指向一个 js：module.exports = function (store, fixtures) { ...造数据... }
 *
 * 支持的 WXML：view/text/button/image/input/scroll-view/picker/block/template(import)、
 *   wx:if / wx:elif / wx:else、wx:for / wx:for-item / wx:for-index、{{ 表达式 }}（用 JS 求值）
 * 不支持：自定义组件内部结构（disclaimer / privacy-popup 渲染为空）、canvas 内容、事件。
 * 只用于看布局和信息量，不等于真机效果。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const pagePath = args[0];
const outFile = args[1];
const dark = args.indexOf('--dark') > -1;
const setupArg = args.filter(function (a) {
  return a.indexOf('--setup=') === 0;
})[0];

/* ---------- 跑页面逻辑拿 data ---------- */
const mem = {};
global.getApp = function () {
  return { globalData: { tmplIds: [], cloudReady: false } };
};
global.getCurrentPages = function () {
  return [{}];
};
global.wx = {
  getStorageSync: function (k) {
    return Object.prototype.hasOwnProperty.call(mem, k) ? JSON.parse(JSON.stringify(mem[k])) : '';
  },
  setStorageSync: function (k, v) {
    mem[k] = v === '' ? '' : JSON.parse(JSON.stringify(v));
  },
  navigateTo: function () {},
  switchTab: function () {},
  showToast: function () {},
  showModal: function () {},
  setNavigationBarTitle: function () {},
  stopPullDownRefresh: function () {},
  request: function (o) {
    if (o.fail) o.fail(new Error('offline'));
  },
  getSystemInfoSync: function () {
    return { theme: dark ? 'dark' : 'light' };
  }
};
let cfg = null;
global.Page = function (c) {
  cfg = c;
};
global.Component = function () {};

const store = require(path.join(ROOT, 'utils/store.js'));
const fixtures = require(path.join(ROOT, 'tools/fixtures.js'));
if (setupArg) require(path.resolve(setupArg.slice('--setup='.length)))(store, fixtures);
require(path.join(ROOT, pagePath + '.js'));
const page = Object.assign({}, cfg);
page.data = JSON.parse(JSON.stringify(cfg.data || {}));
page.setData = function (o, cb) {
  Object.keys(o).forEach(function (k) {
    // 支持 'a.b' 路径
    const ks = k.split('.');
    let t = page.data;
    for (let i = 0; i < ks.length - 1; i++) t = t[ks[i]] = t[ks[i]] || {};
    t[ks[ks.length - 1]] = o[k];
  });
  if (cb) cb();
};
const origLog = console.log;
console.warn = function () {};
if (page.onLoad) page.onLoad({});
if (page.onShow) page.onShow();
if (page._careTimer) clearInterval(page._careTimer);
if (page._timer) clearInterval(page._timer);

/* ---------- 极简 WXML 解析 ---------- */
function parse(src) {
  const root = { tag: '#root', attrs: {}, children: [] };
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<\/([a-zA-Z-]+)\s*>|<([a-zA-Z-]+)((?:\s+[^\s=>\/]+(?:="[^"]*")?)*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(src))) {
    if (m[0].indexOf('<!--') === 0) continue;
    if (m[1]) {
      while (stack.length > 1 && stack[stack.length - 1].tag !== m[1]) stack.pop();
      if (stack.length > 1) stack.pop();
    } else if (m[2]) {
      const attrs = {};
      const ar = /([^\s=]+)(?:="([^"]*)")?/g;
      let a;
      while ((a = ar.exec(m[3] || ''))) attrs[a[1]] = a[2] === undefined ? 'true' : a[2];
      const node = { tag: m[2], attrs: attrs, children: [] };
      stack[stack.length - 1].children.push(node);
      const voidTag = ['input', 'image', 'import', 'canvas', 'switch'].indexOf(m[2]) > -1;
      if (!m[4] && !voidTag) stack.push(node);
    } else if (m[5] && m[5].trim()) {
      stack[stack.length - 1].children.push({ tag: '#text', text: m[5] });
    }
  }
  return root;
}

function evalExpr(expr, scope) {
  try {
    const keys = Object.keys(scope).filter(function (k) {
      return /^[A-Za-z_$][\w$]*$/.test(k);
    });
    // eslint-disable-next-line no-new-func
    return Function.apply(null, keys.concat(['return (' + expr + ');'])).apply(null, keys.map(function (k) {
      return scope[k];
    }));
  } catch (e) {
    return undefined;
  }
}

function interp(str, scope) {
  if (str === undefined) return '';
  const whole = /^\s*\{\{([\s\S]*)\}\}\s*$/.exec(str);
  if (whole && str.indexOf('{{', 2) === -1) return evalExpr(whole[1], scope);
  return str.replace(/\{\{([\s\S]*?)\}\}/g, function (_, e) {
    const v = evalExpr(e, scope);
    return v === undefined || v === null ? '' : String(v);
  });
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const templates = {};
function collectTemplates(node) {
  (node.children || []).forEach(function (c) {
    if (c.tag === 'template' && c.attrs.name) templates[c.attrs.name] = c;
    else collectTemplates(c);
  });
}

function renderChildren(children, scope) {
  let html = '';
  let prevShown = null; // wx:if 链：上一个是否已渲染
  children.forEach(function (c) {
    if (c.tag === '#text') {
      html += esc(interp(c.text, scope));
      prevShown = null;
      return;
    }
    const a = c.attrs;
    if ('wx:if' in a) {
      prevShown = !!interp(a['wx:if'], scope);
      if (!prevShown) return;
    } else if ('wx:elif' in a) {
      if (prevShown === true) return;
      prevShown = !!interp(a['wx:elif'], scope);
      if (!prevShown) return;
    } else if ('wx:else' in a) {
      if (prevShown === true) {
        prevShown = null;
        return;
      }
      prevShown = null;
    } else {
      prevShown = null;
    }
    html += renderNode(c, scope);
  });
  return html;
}

const TAG = { view: 'div', text: 'span', button: 'button', 'scroll-view': 'div', picker: 'div', block: '', image: 'img', input: 'input', canvas: 'div', switch: 'span' };

function renderNode(node, scope) {
  const a = node.attrs;
  if ('wx:for' in a) {
    const list = interp(a['wx:for'], scope) || [];
    const itemName = a['wx:for-item'] || 'item';
    const idxName = a['wx:for-index'] || 'index';
    const rest = Object.assign({}, node, { attrs: Object.assign({}, a) });
    delete rest.attrs['wx:for'];
    // wx:for 与 wx:if 同在一个节点上时，wx:if 对每一项求值
    const cond = rest.attrs['wx:if'];
    delete rest.attrs['wx:if'];
    return (Array.isArray(list) ? list : []).map(function (it, i) {
      const s = Object.assign({}, scope);
      s[itemName] = it;
      s[idxName] = i;
      if (cond !== undefined && !interp(cond, s)) return '';
      return renderNode(rest, s);
    }).join('');
  }
  if (node.tag === 'import') return '';
  if (node.tag === 'template') {
    if (a.name) return '';
    const t = templates[a.is];
    if (!t) return '';
    const data = a.data ? evalExpr('{' + a.data.replace(/^\{\{|\}\}$/g, '') + '}', scope) : {};
    return renderChildren(t.children, Object.assign({}, data || {}));
  }
  if (['disclaimer', 'privacy-popup'].indexOf(node.tag) > -1) return '';
  const tag = TAG[node.tag] === undefined ? 'div' : TAG[node.tag];
  const inner = renderChildren(node.children, scope);
  if (!tag) return inner;
  const cls = interp(a['class'], scope);
  const style = interp(a.style, scope);
  let attrs = '';
  if (cls) attrs += ' class="' + esc(cls) + '"';
  if (style) attrs += ' style="' + esc(style) + '"';
  if (node.tag === 'input') attrs += ' placeholder="' + esc(interp(a.placeholder, scope) || '') + '" value="' + esc(interp(a.value, scope) || '') + '"';
  if (tag === 'img' || tag === 'input') return '<' + tag + attrs + '>';
  return '<' + tag + attrs + '>' + inner + '</' + tag + '>';
}

function loadWxml(p) {
  const src = fs.readFileSync(path.join(ROOT, p), 'utf8');
  const tree = parse(src);
  collectTemplates(tree);
  const imp = /<import\s+src="([^"]+)"/g;
  let m;
  while ((m = imp.exec(src))) collectTemplates(parse(fs.readFileSync(path.join(ROOT, m[1].replace(/^\//, '')), 'utf8')));
  return tree;
}

/* ---------- 样式：rpx → px（按 375 宽）、page → body、深色模式 ---------- */
function loadCss(p, seen) {
  seen = seen || {};
  if (seen[p]) return '';
  seen[p] = true;
  const f = path.join(ROOT, p);
  if (!fs.existsSync(f)) return '';
  let s = fs.readFileSync(f, 'utf8');
  s = s.replace(/@import\s+"([^"]+)";/g, function (_, x) {
    return loadCss(x.replace(/^\//, ''), seen);
  });
  return s;
}
let css = loadCss('app.wxss') + loadCss(pagePath + '.wxss');
css = css
  .replace(/(-?\d+(?:\.\d+)?)rpx/g, function (_, n) {
    return n / 2 + 'px';
  })
  .replace(/\bpage\b(?=\s*[{,])/g, 'body')
  .replace(/env\(safe-area-inset-bottom\)/g, '0px');
if (dark) css = css.replace(/@media \(prefers-color-scheme: dark\)\s*\{([\s\S]*?\})\s*\}/, '$1');
else css = css.replace(/@media \(prefers-color-scheme: dark\)\s*\{[\s\S]*?\}\s*\}/, '');

const tree = loadWxml(pagePath + '.wxml');
const body = renderChildren(tree.children, page.data);
const html =
  '<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}html,body{margin:0}body{width:375px;font-family:"PingFang SC","Hiragino Sans GB",sans-serif;background:var(--bg)}' +
  'div{display:block}button{all:unset;display:block;text-align:center}' +
  css +
  '</style><body>' +
  body +
  '</body>';
fs.writeFileSync(outFile, html);
origLog('rendered', pagePath, '→', outFile, '(' + Math.round(html.length / 1024) + 'KB)');
