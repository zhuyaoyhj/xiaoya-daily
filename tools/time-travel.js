#!/usr/bin/env node
/**
 * tools/time-travel.js —— 在多个「今天」下跑全部测试，找出依赖运行日期的写法
 * 用法：node tools/time-travel.js            # 默认一组刁钻日期
 *       node tools/time-travel.js 2027-02-28  # 只跑指定日期（可多个）
 *
 * 日期选取：月末（31 号、2 月底、闰日）、跨年、月初 —— 月龄计算和「X 天后」文案最容易在这些天出错。
 * 原理：tools/clock.js 把 Date 平移到指定时间（只平移起点，时间照常流逝）。
 */
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DATES = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      '2026-12-31T23:30', // 年末深夜
      '2027-01-01T00:10', // 跨年刚过
      '2027-01-31T10:00', // 大月末
      '2027-02-28T10:00', // 平年 2 月底
      '2027-03-01T09:00', // 2 月底的次日
      '2027-03-31T10:00', // 前一个月只有 28 天的月末
      '2027-06-30T12:00', // 小月末
      '2027-11-20T07:00', // 一年后
      '2028-02-29T10:00', // 闰日
      '2028-03-30T10:00'
    ];

const tests = fs
  .readdirSync(__dirname)
  .filter(function (f) {
    return /^test-.*\.js$/.test(f);
  })
  .sort();

/* 静态守卫：用真实「今天」的测试里，生日不许写死（写死的生日会让月龄每个月都变）。
   固定了「今天」的测试（test-food 的 TODAY、test-vaccine 的 NOW）可以写死，用 FROZEN 标出来。 */
const FROZEN = ['test-food.js', 'test-vaccine.js', 'test-clothing.js', 'test-place.js'];
let broken = 0;
let staticBad = 0;
tests.forEach(function (t) {
  if (FROZEN.indexOf(t) > -1) return;
  const src = fs.readFileSync(path.join(__dirname, t), 'utf8');
  // 同一行显式传了固定时钟（如 babyAge(x, NOW)）的不算
  const hits = src.split('\n').filter(function (line) {
    return /birthday:\s*'\d{4}-\d{2}-\d{2}'/.test(line) && !/,\s*NOW\)/.test(line);
  });
  if (hits.length) {
    staticBad++;
    console.log('✗ ' + t + ' 写死了生日：' + hits[0].trim() + '  → 请用 fixtures.birthdayForAge');
  }
});

DATES.forEach(function (d) {
  const fails = [];
  tests.forEach(function (t) {
    const r = spawnSync(process.execPath, ['-r', path.join(__dirname, 'clock.js'), path.join(__dirname, t)], {
      cwd: ROOT,
      env: Object.assign({}, process.env, { XYD_NOW: d }),
      encoding: 'utf8'
    });
    if (r.status !== 0) {
      const lines = (r.stdout + r.stderr).split('\n').filter(function (l) {
        return /^\s+✗|Error/.test(l);
      });
      fails.push(t + '：' + (lines.slice(0, 3).join(' / ').trim() || 'exit ' + r.status));
    }
  });
  if (fails.length) {
    broken++;
    console.log('✗ ' + d);
    fails.forEach(function (f) {
      console.log('    ' + f);
    });
  } else {
    console.log('✓ ' + d + '  ' + tests.length + ' 个测试全过');
  }
});
const msg = [];
if (staticBad) msg.push(staticBad + ' 个测试写死了生日');
if (broken) msg.push(broken + ' 个日期有失败');
console.log('\n' + (msg.length ? msg.join('，') : '所有日期都通过：测试不依赖运行日期'));
process.exit(broken || staticBad ? 1 : 0);
