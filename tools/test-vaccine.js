#!/usr/bin/env node
/**
 * tools/test-vaccine.js —— 疫苗护理引擎冒烟测试（纯 Node，store 部分 stub 掉 wx）
 * 用法：node tools/test-vaccine.js
 * 覆盖：疫苗库完整性 / 阶段划分 / 护理清单 / 免疫规划对照 / 存储读写 / 时间解析
 */

const path = require('path');

/* ---------- stub wx（store.js 依赖） ---------- */
const mem = {};
global.wx = {
  getStorageSync: function (k) {
    return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : '';
  },
  setStorageSync: function (k, v) {
    mem[k] = JSON.parse(JSON.stringify(v));
  }
};

const vaccine = require('../utils/vaccine.js');
const store = require('../utils/store.js');
const { VACCINES, PLAN, PHASES } = require('../data/vaccines.js');

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

function contains(arr, re, label) {
  const hit = (arr || []).some(function (x) {
    return re.test(typeof x === 'string' ? x : JSON.stringify(x));
  });
  ok(hit, label);
}

const NOW = new Date(2026, 10, 8, 15, 0).getTime(); // 2026-11-08 15:00

/* ================= 1. 疫苗库完整性 ================= */
console.log('\n[1] 疫苗库完整性');
ok(VACCINES.length >= 16, '疫苗条目 ≥16 种（实际 ' + VACCINES.length + '）');

const ids = {};
let dupes = 0;
VACCINES.forEach(function (v) {
  if (ids[v.id]) dupes++;
  ids[v.id] = true;
});
eq(dupes, 0, 'id 无重复');

const broken = VACCINES.filter(function (v) {
  return !v.id || !v.name || !v.short || !v.emoji || !v.route || !v.site;
});
eq(broken.length, 0, '每种疫苗都有名称/图标/途径/部位');

const noDose = VACCINES.filter(function (v) {
  return !v.doses || !v.doses.length || v.doses.some(function (d) {
    return !d.n || typeof d.month !== 'number' || !d.label;
  });
});
eq(noDose.length, 0, '剂次都有编号/月龄/说明');

const noRed = VACCINES.filter(function (v) {
  return !v.redFlags || !v.redFlags.length;
});
eq(noRed.length, 0, '每种疫苗都有「什么情况要去医院」');

const noReaction = VACCINES.filter(function (v) {
  return !v.reactions || !v.reactions.length;
});
eq(noReaction.length, 0, '每种疫苗都有常见反应说明');

// PLAN 里引用的疫苗必须存在，剂次也必须在范围内
const badPlan = PLAN.filter(function (p) {
  const v = vaccine.getVaccine(p.vaccine);
  if (!v) return true;
  return !vaccine.doseInfo(v, p.dose);
});
eq(badPlan.length, 0, '免疫规划表引用的疫苗与剂次都存在');

const sorted = PLAN.slice().sort(function (a, b) {
  return a.month - b.month;
});
eq(sorted[0].month, 0, '程序表第一针是出生时（月龄 0）');

/* ================= 2. 阶段划分 ================= */
console.log('\n[2] 接种后阶段划分');
eq(PHASES.length, 5, '共 5 个阶段');
eq(vaccine.phaseFor(0.2).key, 'observe', '0.2 小时 → 留观中');
eq(vaccine.phaseFor(0.6).key, 'day0', '0.6 小时 → 接种当天');
eq(vaccine.phaseFor(12).key, 'day0', '12 小时 → 接种当天');
eq(vaccine.phaseFor(30).key, 'day3', '30 小时 → 1-3 天');
eq(vaccine.phaseFor(100).key, 'week2', '100 小时 → 3-14 天');
eq(vaccine.phaseFor(400).key, 'later', '400 小时 → 观察期已过');

/* ================= 3. 时间解析 ================= */
console.log('\n[3] 时间解析');
eq(vaccine.toTs('2026-11-08') === new Date(2026, 10, 8, 9, 0).getTime(), true, '只给日期默认 09:00');
eq(vaccine.toTs('2026-11-08 10:30') === new Date(2026, 10, 8, 10, 30).getTime(), true, '带时间精确到分');
eq(vaccine.toTs('') === 0, true, '空字符串返回 0');
eq(vaccine.tsOf({ date: '2026-11-08', time: '14:20' }) === new Date(2026, 10, 8, 14, 20).getTime(), true, 'tsOf 读记录对象');
eq(Math.round(vaccine.hoursSince({ date: '2026-11-08', time: '10:30' }, NOW)), 5, '15:00 距 10:30 是 4.5 小时（四舍五入 5）');
eq(vaccine.sinceText(4.5), '接种后 5 小时', '小时文案');
eq(vaccine.sinceText(72), '接种后 3 天', '天数文案');

/* ================= 4. 护理清单 ================= */
console.log('\n[4] 护理清单随阶段变化');
const justNow = vaccine.careFor({ vaccineId: 'hepb', dose: 1, date: '2026-11-08', time: '14:45' }, NOW);
eq(justNow.phaseKey, 'observe', '15 分钟前接种 → 留观中');
contains(justNow.items.map(function (i) { return i.t; }), /留观满 30 分钟/, '留观阶段提示留观 30 分钟');
ok(justNow.done === false, '还没过观察期');

const sameDay = vaccine.careFor({ vaccineId: 'dtap', dose: 1, date: '2026-11-08', time: '10:00' }, NOW);
eq(sameDay.phaseKey, 'day0', '5 小时前接种 → 当天');
contains(sameDay.items.map(function (i) { return i.t; }), /测一次体温/, '当天要测体温');
contains(sameDay.items.map(function (i) { return i.t; }), /针眼别揉/, '当天别揉针眼');
console.log('    ' + sameDay.phaseLabel + ' · ' + sameDay.sinceText + ' · ' + sameDay.items.length + ' 条');

// 疫苗特异性：百白破当天要说明反应比例
contains(sameDay.items.map(function (i) { return i.t; }), /三成宝宝|反应相对明显|硬结/, '百白破带自己的特异提示');

const bcg10d = vaccine.careFor({ vaccineId: 'bcg', dose: 1, date: '2026-10-29', time: '10:00' }, NOW);
eq(bcg10d.phaseKey, 'week2', '10 天前接种 → 3-14 天阶段');
contains(bcg10d.items.map(function (i) { return i.t; }), /卡疤|结痂|化脓/, '卡介苗在 2 周档提示卡疤形成');
ok(bcg10d.reactionsNow.length > 0, '卡介苗此时有「正可能发生」的局部反应');
contains(bcg10d.reactionsNow.map(function (i) { return i.name + i.tip; }), /脓|结痂/, '反应说明含化脓结痂');

// 麻腮风：第 2 天时迟发反应应该出现在「接下来可能出现」
const mmrDay2 = vaccine.careFor({ vaccineId: 'mmr', dose: 1, date: '2026-11-06', time: '10:00' }, NOW);
eq(mmrDay2.phaseKey, 'day3', '2 天前接种 → 1-3 天阶段');
ok(mmrDay2.reactionsSoon.length > 0, '麻腮风的迟发反应在「接下来」里预告');
contains(mmrDay2.reactionsSoon.map(function (i) { return i.name + '|' + i.fromText; }), /天后/, '预告里带「几天后」的时间提示');
console.log('    ' + mmrDay2.reactionsSoon.map(function (r) { return r.name + '（' + r.fromText + '）'; }).join('；'));

// 轮状：口服，必须提醒洗手
const rota = vaccine.careFor({ vaccineId: 'rota', dose: 1, date: '2026-11-06', time: '10:00' }, NOW);
contains(rota.items.map(function (i) { return i.t; }), /洗手/, '轮状疫苗提示换尿布后洗手');
contains(rota.redFlags, /肠套叠/, '轮状疫苗的肠套叠警示在列');

// 观察期结束
const old = vaccine.careFor({ vaccineId: 'hepb', dose: 3, date: '2026-09-01', time: '10:00' }, NOW);
eq(old.phaseKey, 'later', '两个多月前接种 → 观察期已过');
ok(old.done === true, 'done 标记为 true');
contains(old.items.map(function (i) { return i.t; }), /下一针|免疫规划/, '结束后引导看下一针');

// 未知疫苗不崩
const unknown = vaccine.careFor({ vaccineId: 'not-exist', dose: 1, date: '2026-11-08' }, NOW);
eq(unknown.ok, false, '未知疫苗返回 ok:false 而不是抛错');

/* ================= 5. 下一剂 ================= */
console.log('\n[5] 下一剂推算');
eq(vaccine.nextDose('hepb', 1).label, '1 月龄', '乙肝第 1 剂之后是 1 月龄');
eq(vaccine.nextDose('hepb', 3), null, '乙肝第 3 剂之后没有下一剂');
eq(vaccine.doseText(2), '第二剂', '剂次文案');
eq(dtapNext(), '18 月龄加强', '百白破第 3 剂之后是 18 月龄加强');
function dtapNext() {
  return vaccine.nextDose('dtap', 3).label;
}

/* ================= 6. 免疫规划对照 ================= */
console.log('\n[6] 免疫规划对照');
const plan8 = vaccine.planFor(8, []);
const due8 = plan8.filter(function (x) { return x.status === 'due' || x.status === 'overdue'; });
ok(due8.length >= 8, '8 月龄且无记录时，有一批疫苗显示该打了（' + due8.length + ' 项）');
ok(due8.some(function (x) { return x.vaccineId === 'mmr'; }), '含麻腮风');
ok(due8.some(function (x) { return x.status === 'overdue'; }), '更早的针标为已过建议月龄');

const plan8b = vaccine.planFor(8, [
  { vaccineId: 'hepb', dose: 1 },
  { vaccineId: 'hepb', dose: 2 },
  { vaccineId: 'hepb', dose: 3 }
]);
const hepbLeft = plan8b.filter(function (x) { return x.vaccineId === 'hepb' && !x.done; });
eq(hepbLeft.length, 0, '记录齐全后乙肝不再提醒');

const plan5 = vaccine.planFor(5, []);
ok(plan5.some(function (x) { return x.vaccineId === 'mmr' && x.status === 'later'; }), '5 月龄时麻腮风还是「还早」');
ok(plan5.some(function (x) { return x.vaccineId === 'mena' && x.status === 'soon'; }), '5 月龄时 6 月龄的流脑是「快到了」');

const pending = vaccine.pendingFor(8, []);
ok(pending.due.length > 0 && pending.soon.length >= 0, 'pendingFor 返回待接种与即将到期两组');

/* ================= 7. 顶部结论（brief） ================= */
console.log('\n[7] 顶部结论');
const b1 = vaccine.brief([{ vaccineId: 'dtap', dose: 2, date: '2026-11-08', time: '10:00' }], 8, NOW);
eq(b1.type, 'care', '有观察期内的记录 → 展示护理');
contains([b1.title], /百白破/, '标题带疫苗名');
ok(b1.desc.indexOf('接种后') > -1, '描述带已过时间');

const b2 = vaccine.brief([{ vaccineId: 'dtap', dose: 2, date: '2026-10-01', time: '10:00' }], 8, NOW);
eq(b2.type, 'due', '观察期已过且有漏种 → 提醒该打');

const b3 = vaccine.brief([], 0, NOW);
eq(b3.type, 'due', '新生儿没有记录 → 提醒出生时要打的两针');
contains([b3.title], /乙肝|卡介苗/, '新生儿提醒含乙肝或卡介苗');

const b4 = vaccine.brief([], 30, NOW);
ok(b4.type === 'due' || b4.type === 'soon', '30 月龄无记录 → 有待接种提醒');

/* ================= 8. 存储读写 ================= */
console.log('\n[8] 接种记录存储');
const babyId = 'b001';
eq(store.getVaccineRecords(babyId).length, 0, '初始没有记录');

const r1 = store.upsertVaccineRecord({
  babyId: babyId,
  vaccineId: 'hepb',
  dose: 1,
  date: '2026-03-01',
  time: '10:30',
  place: '朝阳区某社区门诊'
});
ok(!!r1.id, '新增后自动生成 id');
eq(store.getVaccineRecords(babyId).length, 1, '写入 1 条');

const r2 = store.upsertVaccineRecord({ babyId: babyId, vaccineId: 'bcg', dose: 1, date: '2026-03-01' });
eq(store.getVaccineRecords(babyId).length, 2, '再写 1 条共 2 条');

store.upsertVaccineRecord(Object.assign({}, r1, { note: '改过备注' }));
const reread = store.getVaccineRecords(babyId)[0];
eq(reread.note, '改过备注', '同 id 更新而不是新增');
eq(store.getVaccineRecords(babyId).length, 2, '更新后总数不变');

eq(store.getVaccineRecords('b999').length, 0, '其他宝宝的记录不会串');

const doseMap = store.getDoseMap(babyId);
ok(!!doseMap['hepb#1'], 'getDoseMap 能查到 hepb 第 1 剂');
ok(!doseMap['hepb#2'], '未打的剂次查不到');

store.removeVaccineRecord(r2.id);
eq(store.getVaccineRecords(babyId).length, 1, '删除后剩 1 条');

// 删宝宝要连带清记录
store.saveBabies([{ id: babyId, name: '小芽', birthday: '2026-03-01' }]);
store.removeBaby(babyId);
eq(store.getVaccineRecords(babyId).length, 0, '删宝宝时接种记录一并清掉');

/* ================= 9. 汇总统计 ================= */
console.log('\n[9] 汇总');
const st = vaccine.stats([
  { vaccineId: 'hepb', dose: 1 },
  { vaccineId: 'bcg', dose: 1 },
  { vaccineId: 'pcv13', dose: 1 }
]);
eq(st.total, 3, '总记录数');
eq(st.free, 2, '一类疫苗计数');
eq(st.paid, 1, '二类疫苗计数');

const deco = vaccine.decorate([
  { vaccineId: 'hepb', dose: 1, date: '2026-03-01' },
  { vaccineId: 'bcg', dose: 1, date: '2026-05-01' }
], NOW);
eq(deco[0].record.vaccineId, 'bcg', 'decorate 按时间倒序');
ok(!!deco[0].care.vaccine.name, '每条记录都附护理摘要');

/* ================= 10. 联合疫苗覆盖 ================= */
console.log('\n[10] 联合疫苗覆盖单苗');
const pentaAll = [1, 2, 3, 4].map(function (n) {
  return { vaccineId: 'penta', dose: n, date: '2026-09-01' };
});
const planPenta = vaccine.planFor(8, pentaAll, []);
const dtaps = planPenta.filter(function (p) { return p.vaccineId === 'dtap'; });
const polios = planPenta.filter(function (p) { return p.vaccineId === 'polio'; });

ok(dtaps.length === 4 && dtaps.every(function (p) { return p.status === 'covered'; }), '百白破 4 剂全部标记为被覆盖');
ok(polios.slice(0, 3).every(function (p) { return p.status === 'covered'; }), '脊灰前 3 剂被覆盖');
eq(polios[3].status, 'later', '脊灰第 4 剂（4 岁）不被覆盖，仍在提醒');
eq(dtaps[0].coveredBy, '五联疫苗', '覆盖来源写的是五联疫苗');
ok(!planPenta.some(function (p) { return p.vaccineId === 'pcv13'; }), '13 价肺炎本就不在规划表里');

// 只打了 1 剂五联，只覆盖对应那一剂
const once = vaccine.planFor(8, [{ vaccineId: 'penta', dose: 1, date: '2026-09-01' }], []);
eq(once.filter(function (p) { return p.status === 'covered'; }).length, 2, '打 1 剂五联只覆盖 2 项（百白破 1 + 脊灰 1）');

// 甲肝灭活替代甲肝减毒活
const hepaiPlan = vaccine.planFor(24, [{ vaccineId: 'hepai', dose: 1, date: '2026-01-01' }], []);
ok(hepaiPlan.some(function (p) { return p.key === 'hepa#1' && p.status === 'covered'; }), '甲肝灭活覆盖甲肝减毒活');

// 不替代的疫苗不能乱覆盖
const pcvPlan = vaccine.planFor(24, [{ vaccineId: 'pcv13', dose: 1, date: '2026-01-01' }], []);
eq(pcvPlan.filter(function (p) { return p.status === 'covered'; }).length, 0, '13 价肺炎不覆盖任何免费苗');

const cov = vaccine.coverageFor(pentaAll);
eq(Object.keys(cov).length, 7, 'coverageFor 算出 7 个被覆盖的 key');
eq(vaccine.COVER_RULES.length >= 2, true, '覆盖规则表不是空的');

/* ================= 11. 手动移除规划项 ================= */
console.log('\n[11] 手动移除规划项');
const base8 = vaccine.planFor(8, [], []);
ok(base8.some(function (p) { return p.key === 'mmr#1' && p.status === 'due'; }), '未处理前麻腮风是「该打了」');

const hiddenPlan = vaccine.planFor(8, [], ['mmr#1']);
ok(hiddenPlan.some(function (p) { return p.key === 'mmr#1' && p.status === 'hidden'; }), '移除后状态变 hidden');
ok(!vaccine.pendingFor(8, [], ['mmr#1']).due.some(function (p) { return p.key === 'mmr#1'; }), '移除后不再出现在待接种里');

// done 优先于 hidden
const doneAndHidden = vaccine.planFor(8, [{ vaccineId: 'mmr', dose: 1, date: '2026-11-01' }], ['mmr#1']);
eq(doneAndHidden.filter(function (p) { return p.key === 'mmr#1'; })[0].status, 'done', '既打了又移除过，以「已接种」为准');

// covered 优先于 hidden
const covAndHidden = vaccine.planFor(8, pentaAll, ['dtap#1']);
eq(covAndHidden.filter(function (p) { return p.key === 'dtap#1'; })[0].status, 'covered', '既被覆盖又移除过，以「已覆盖」为准');

// 存储层
eq(store.getPlanHidden().length, 0, '初始没有移除项');
store.hidePlanItem('mmr#1');
store.hidePlanItem('je#1');
eq(store.getPlanHidden().length, 2, '移除 2 项');
store.hidePlanItem('mmr#1');
eq(store.getPlanHidden().length, 2, '重复移除不会加重复条目');
store.unhidePlanItem('mmr#1');
eq(store.getPlanHidden(), ['je#1'], '恢复后只剩另一项');
store.clearPlanHidden();
eq(store.getPlanHidden().length, 0, '可以一键全部恢复');

// 不传 hidden 时读存储
store.hidePlanItem('bcg#1');
ok(vaccine.planFor(8, []).some(function (p) { return p.key === 'bcg#1' && p.status === 'hidden'; }), '不传 hidden 参数时自动读本地设置');
store.clearPlanHidden();

/* ================= 12. 自定义疫苗 ================= */
console.log('\n[12] 自定义疫苗');
eq(store.getCustomVaccines().length, 0, '初始没有自定义疫苗');
eq(store.addCustomVaccine({ name: '   ' }), null, '空名字不创建');
eq(store.addCustomVaccine({ name: '测试苗', doses: 99 }).doses, 6, '剂次数上限夹到 6');
eq(store.addCustomVaccine({ name: '测试苗2', doses: 0 }).doses, 1, '剂次数下限夹到 1');

const custom = store.addCustomVaccine({
  name: '手足口病疫苗（中国生物）',
  doses: 2,
  note: '第 2 剂间隔 1 个月'
});
ok(!!custom.id, '自定义疫苗有 id');
eq(custom.category, 'paid', '自定义疫苗归为自费');
eq(custom.short, '手足口病疫苗', '没填简称时自动截取前 6 个字');
eq(store.getCustomVaccines().length, 3, '共 3 条自定义');

const paidList = vaccine.listVaccines('paid');
eq(paidList.length, 8 + 3, '二类列表 = 内置 8 + 自定义 3');
eq(vaccine.listVaccines('free').length, 10, '一类列表不受影响');

const found = vaccine.getVaccine(custom.id);
ok(!!found, 'getVaccine 能查到自定义疫苗');
eq(found.doses.length, 2, '剂次数归一化成 2 个剂次');
eq(found.doses[1].n, 2, '剂次从 1 开始编号');
eq(found.custom, true, '带 custom 标记');
ok(!!found.reactions.length, '自定义疫苗也有通用反应说明');

const customCare = vaccine.careFor({ vaccineId: custom.id, dose: 1, date: '2026-11-08', time: '10:00' }, NOW);
eq(customCare.ok, true, '自定义疫苗能出护理方案');
eq(customCare.vaccine.custom, true, '护理方案里标了 custom');
contains(customCare.items.map(function (i) { return i.t; }), /没有它的专属护理知识/, '明确说明没有专属知识库');
contains(customCare.items.map(function (i) { return i.t; }), /测一次体温/, '通用护理事项照常给');

// 自定义疫苗不进免疫规划表
ok(!vaccine.planFor(8, []).some(function (p) { return p.vaccineId === custom.id; }), '自定义疫苗不进免疫规划表');

// 删自定义疫苗连带删记录
store.upsertVaccineRecord({ babyId: 'bx', vaccineId: custom.id, dose: 1, date: '2026-11-01' });
eq(store.getVaccineRecords('bx').length, 1, '先给自定义疫苗记一条');
const del = store.removeCustomVaccine(custom.id);
eq(del.records, 1, '删除时报告清掉 1 条记录');
eq(store.getVaccineRecords('bx').length, 0, '记录一并删除');
eq(store.getVaccineRecords('b999').length, 0, '其他宝宝的记录不受影响');
eq(vaccine.getVaccine(custom.id), null, '删除后查不到了');

console.log('\n========================================');
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
console.log('========================================\n');
process.exit(fail ? 1 : 0);
