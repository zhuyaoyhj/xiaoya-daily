#!/usr/bin/env node
/**
 * tools/gen-theme.js —— 从 app.wxss 的 token 块生成 utils/theme.js
 * canvas 读不到 CSS 变量，画图要用真实色值；为了不在 JS 里再写一遍色值，统一从这里生成。
 * 改了 app.wxss 的 token 后跑：node tools/gen-theme.js（check.js 会校验两边一致）
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

function parse(src) {
  const block = src.match(/\/\* ==== design tokens[\s\S]*?\/\* ==== \/design tokens ==== \*\//);
  if (!block) throw new Error('app.wxss 里没找到 design tokens 块');
  const light = {};
  const dark = {};
  // 浅色：第一个 page { ... }；深色：@media (prefers-color-scheme: dark) { page { ... } }
  const darkPart = block[0].match(/@media \(prefers-color-scheme: dark\)\s*\{\s*page\s*\{([\s\S]*?)\}\s*\}/);
  const lightPart = block[0].replace(darkPart ? darkPart[0] : '', '');
  lightPart.replace(/--([a-z0-9-]+)\s*:\s*(#[0-9A-Fa-f]{6})/g, function (_, n, v) {
    light[n] = v.toUpperCase();
  });
  if (darkPart) {
    darkPart[1].replace(/--([a-z0-9-]+)\s*:\s*(#[0-9A-Fa-f]{6})/g, function (_, n, v) {
      dark[n] = v.toUpperCase();
    });
  }
  return { light: light, dark: dark };
}

function render(t) {
  return (
    '// utils/theme.js —— 由 tools/gen-theme.js 从 app.wxss 生成，不要手改\n' +
    '// 给 canvas 用（canvas 读不到 CSS 变量）。dark 只列出深色模式下不同的值。\n' +
    'const light = ' + JSON.stringify(t.light, null, 2) + ';\n\n' +
    'const dark = ' + JSON.stringify(t.dark, null, 2) + ';\n\n' +
    '/** 当前主题的色值表：深色模式下用 dark 覆盖 light */\n' +
    'function colors(theme) {\n' +
    "  let mode = theme;\n" +
    "  if (!mode && typeof wx !== 'undefined') {\n" +
    '    try {\n' +
    "      const info = wx.getAppBaseInfo ? wx.getAppBaseInfo() : wx.getSystemInfoSync();\n" +
    "      mode = info && info.theme;\n" +
    '    } catch (e) {\n' +
    "      mode = 'light';\n" +
    '    }\n' +
    '  }\n' +
    "  return mode === 'dark' ? Object.assign({}, light, dark) : light;\n" +
    '}\n\n' +
    'module.exports = { light: light, dark: dark, colors: colors };\n'
  );
}

const src = fs.readFileSync(path.join(ROOT, 'app.wxss'), 'utf8');
const out = render(parse(src));
const target = path.join(ROOT, 'utils/theme.js');
if (process.argv[2] === '--check') {
  const cur = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
  process.exit(cur === out ? 0 : 1);
}
fs.writeFileSync(target, out);
console.log('utils/theme.js 已生成');
module.exports = { parse: parse, render: render };
