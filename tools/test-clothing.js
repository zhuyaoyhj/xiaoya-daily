#!/usr/bin/env node
/**
 * tools/test-clothing.js —— 穿衣引擎冒烟测试（纯 Node，不需要 wx）
 * 用法：node tools/test-clothing.js
 * 覆盖：月龄阶段划分、双维（温度×月龄）衣物匹配、睡袋温度区间表、山区修正
 */

const clothing = require('../utils/clothing.js');

let pass = 0;
let fail = 0;

function eq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a === b) {
    pass++;
    console.log('  ✓ ' + label);
  } else {
    fail++;
    console.log('  ✗ ' + label + '\n      期望 ' + b + '\n      实际 ' + a);
  }
}

function ok(cond, label) {
  if (cond) {
    pass++;
    console.log('  ✓ ' + label);
  } else {
    fail++;
    console.log('  ✗ ' + label);
  }
}

function w(feelsLike) {
  return { temp: feelsLike, feelsLike: feelsLike, code: 2, wind: 5, humidity: 50, tempMax: feelsLike + 3, tempMin: feelsLike - 4, uv: 3 };
}

console.log('\n[1] 月龄阶段划分');
eq(clothing.getStage(0).key, 'newborn', '0 月 → 新生儿');
eq(clothing.getStage(2).key, 'newborn', '2 月 → 新生儿');
eq(clothing.getStage(3).key, 'young', '3 月 → 小婴儿');
eq(clothing.getStage(5).key, 'young', '5 月 → 小婴儿');
eq(clothing.getStage(6).key, 'crawler', '6 月 → 爬行期');
eq(clothing.getStage(8).key, 'crawler', '8 月 → 爬行期');
eq(clothing.getStage(11).key, 'crawler', '11 月 → 爬行期');
eq(clothing.getStage(12).key, 'toddler', '12 月 → 学步期');
eq(clothing.getStage(23).key, 'toddler', '23 月 → 学步期');
eq(clothing.getStage(24).key, 'kid', '24 月 → 幼儿期');
eq(clothing.getStage(36).key, 'kid', '36 月 → 幼儿期');
eq(clothing.getStage(60).key, 'kid', '超范围按最大阶段兜底');

console.log('\n[2] 8 月龄：同温度下应是婴儿款式（连体衣 / 夹棉连体衣）');
const m8cool = clothing.recommend(w(22), { ageMonths: 8 });
console.log('    22℃ → ' + m8cool.headline);
ok(/连体衣/.test(m8cool.headline), '22℃ 用「连体衣」而不是开衫/衬衫');
ok(/春秋连体衣/.test(m8cool.headline), '22℃ 命中「春秋连体衣」');

const m8cold = clothing.recommend(w(16), { ageMonths: 8 });
console.log('    16℃ → ' + m8cold.headline);
ok(/夹棉连体衣/.test(m8cold.headline), '16℃ 命中「夹棉连体衣」');

const m8hot = clothing.recommend(w(31), { ageMonths: 8 });
console.log('    31℃ → ' + m8hot.headline);
ok(/包屁衣|纱布连体衣/.test(m8hot.headline), '31℃ 用短袖包屁衣 / 纱布连体衣');

console.log('\n[3] 同温度、不同月龄 → 款式不同');
[2, 4, 8, 15, 28].forEach(function (m) {
  const r = clothing.recommend(w(18), { ageMonths: m });
  console.log('    ' + m + ' 月龄 18℃ → ' + r.headline);
});
const newborn = clothing.recommend(w(18), { ageMonths: 1 });
const crawler = clothing.recommend(w(18), { ageMonths: 8 });
const kid = clothing.recommend(w(18), { ageMonths: 30 });
ok(/和尚服|包被/.test(newborn.headline), '1 月龄出现和尚服/抱被');
ok(/连体衣/.test(crawler.headline), '8 月龄出现连体衣');
ok(/卫衣|T 恤|长裤/.test(kid.headline), '30 月龄用分体（卫衣/T恤 + 长裤）');
ok(newborn.headline !== crawler.headline && crawler.headline !== kid.headline, '三档文案确实不同');

console.log('\n[4] 睡袋温度区间表');
const s22 = clothing.recommend(w(22), { ageMonths: 8 }).sleep;
eq(s22.rows.length, 7, '表格 7 行（≥28 / 26 / 24 / 21 / 18 / 15 / <15）');
eq(s22.indoor, 23, '室外 22℃ 估算室内 23℃');
eq(s22.tog, '1.5 TOG', '23℃ → 1.5 TOG');
eq(s22.rows.filter(function (r) { return r.active; }).length, 1, '只有一行是当前档');

const s26 = clothing.recommend(w(26), { ageMonths: 8 }).sleep;
eq(s26.indoor, 25, '室外 26℃ 估算室内 25℃');
eq(s26.tog, '1.0 TOG', '25℃ → 1.0 TOG');

const s20 = clothing.recommend(w(18), { ageMonths: 8 }).sleep;
eq(s20.indoor, 22, '室外 18℃ 估算室内 22℃');
eq(s20.tog, '1.5 TOG', '22℃ → 1.5 TOG');

// 室外再冷，室温也被暖气锚在 21℃，所以最冷那行只能靠手动改室温到达
const sCold = clothing.buildSleep(12, clothing.getStage(8));
eq(sCold.tog, '3.5 TOG', '室温 12℃ → 3.5 TOG（＜15℃ 那一行）');
ok(sCold.rows[6].active, '最冷一行被高亮');

const sHot = clothing.recommend(w(34), { ageMonths: 8 }).sleep;
eq(sHot.tog, '0.2-0.5 TOG', '34℃ → 最热一行');

console.log('\n[5] 睡袋款式随月龄变化');
ok(/一体式|襁褓/.test(clothing.recommend(w(22), { ageMonths: 2 }).sleep.style), '2 月龄用一体式/襁褓');
ok(/分腿/.test(clothing.recommend(w(22), { ageMonths: 8 }).sleep.style), '8 月龄用分腿睡袋');
ok(/分腿/.test(clothing.recommend(w(22), { ageMonths: 30 }).sleep.style), '30 月龄用分腿睡袋');

console.log('\n[6] 山区修正仍然生效');
const plain = clothing.recommend(w(20), { ageMonths: 8 });
const mountain = clothing.recommend(w(20), { ageMonths: 8, mountain: true, mountainOffset: -2 });
ok(mountain.basis !== plain.basis, '山区修正写进了依据行');
ok(/山区 -2℃/.test(mountain.basis), '依据行含「山区 -2℃」');
ok(mountain.alerts.some(function (a) { return a.indexOf('山区') > -1; }), '有山区提示');
console.log('    城区: ' + plain.basis);
console.log('    山区: ' + mountain.basis);

console.log('\n[7] 结构完整性');
const r = clothing.recommend(w(20), { ageMonths: 8 });
eq(r.items.length, 3, '三层结构（内层/外层/头部）');
ok(!!r.stageLabel && !!r.stageTip, '带月龄阶段标签与提示');
ok(r.sleep.rows.every(function (x) { return x.label && x.tog && x.text; }), '每行都有温度/TOG/穿盖');

console.log('\n[8] 室内温度估算（暖气房不能被当成冰窖）');
eq(clothing.estimateIndoor(-8), 21, '室外 -8℃ → 室内 21℃（供暖）');
eq(clothing.estimateIndoor(0), 21, '室外 0℃ → 室内 21℃');
eq(clothing.estimateIndoor(8), 21, '室外 8℃ → 室内 21℃');
eq(clothing.estimateIndoor(15), 22, '室外 15℃ → 室内 22℃（停暖过渡季）');
eq(clothing.estimateIndoor(23), 23, '室外 23℃ → 室内 23℃（开窗，与室外拉平）');
eq(clothing.estimateIndoor(30), 29, '室外 30℃ → 室内 29℃（开窗仍热）');
ok(clothing.estimateIndoor(0) >= clothing.estimateIndoor(-20), '极寒不继续压低室温');
let monotonic = true;
for (let t = -10; t <= 38; t++) {
  if (clothing.estimateIndoor(t) < clothing.estimateIndoor(t - 1)) monotonic = false;
}
ok(monotonic, '室内温度随室外单调不降（无断点）');

// 最关键的一条：腊月里不能被推荐 3.5 TOG 睡袋
const winter = clothing.recommend(w(-5), { ageMonths: 8 });
ok(winter.sleep.indoor === 21, '室外 -5℃ 时室温仍判 21℃');
ok(winter.sleep.tog === '1.5 TOG', '此时睡袋是 1.5 TOG 而不是 3.5 TOG');
console.log('    室外 -5℃ → 室温 ' + winter.sleep.indoor + '℃ → ' + winter.sleep.tog + '（' + winter.sleep.label + '）');

console.log('\n[9] 手动改室温后整张表跟着重算');
const stage8 = clothing.getStage(8);
const t26 = clothing.buildSleep(26, stage8);
const t18 = clothing.buildSleep(18, stage8);
eq(t26.tog, '0.5 TOG', '室温 26℃ → 0.5 TOG');
eq(t18.tog, '2.5 TOG', '室温 18℃ → 2.5 TOG');
ok(t26.rows.filter(function (x) { return x.active; }).length === 1, '26℃ 只高亮一行');
ok(t18.rows.filter(function (x) { return x.active; })[0].label === '18-20℃', '18℃ 高亮「18-20℃」');
eq(clothing.buildSleep(9, stage8).tog, '3.5 TOG', '室温 9℃ → 3.5 TOG（末行可命中）');
eq(clothing.buildSleep(35, stage8).tog, '0.2-0.5 TOG', '室温 35℃ → 0.2-0.5 TOG（首行可命中）');
ok(t26.style.indexOf('分腿') > -1, '8 月龄睡袋是分腿款');

console.log('\n========================================');
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
console.log('========================================\n');
process.exit(fail ? 1 : 0);
