#!/usr/bin/env node
/**
 * tools/test-care.js —— 喂奶 / 睡眠 / 尿布记录的冒烟测试
 * 用法：node tools/test-care.js
 * 覆盖：按月分片存储、跨月搬迁、跨夜睡眠统计、计时与换边、误触不记、忘了点结束、
 *       便便颜色就医提醒、月龄参考提示、首页状态卡、记录页、补记页校验、删宝宝清理、备份往返
 */

const path = require('path');
const fs = require('fs');

const mem = {};
let lastToast = '';
let lastModal = '';
let modalConfirm = true;
let lastNav = '';

global.getApp = function () {
  return { globalData: {} };
};
global.getCurrentPages = function () {
  return [{}, {}];
};
global.wx = {
  getStorageSync: function (k) {
    return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : '';
  },
  setStorageSync: function (k, v) {
    mem[k] = v === '' ? '' : JSON.parse(JSON.stringify(v));
  },
  navigateTo: function (o) {
    lastNav = o.url;
  },
  navigateBack: function () {
    lastNav = 'back';
  },
  switchTab: function (o) {
    lastNav = 'tab:' + o.url;
  },
  showToast: function (o) {
    lastToast = o.title;
  },
  showModal: function (o) {
    lastModal = (o.title || '') + '|' + (o.content || '');
    if (o.success) o.success({ confirm: modalConfirm });
  },
  setNavigationBarTitle: function () {},
  stopPullDownRefresh: function () {},
  request: function (o) {
    if (o.fail) o.fail(new Error('NET'));
  }
};

let captured = null;
global.Page = function (cfg) {
  captured = cfg;
};
const ROOT = path.resolve(__dirname, '..');
function mount(rel) {
  captured = null;
  const full = path.join(ROOT, rel);
  delete require.cache[require.resolve(full)];
  require(full);
  return captured;
}
function instance(cfg) {
  const inst = Object.assign({}, cfg);
  inst.data = JSON.parse(JSON.stringify(cfg.data || {}));
  inst.setData = function (patch) {
    const self = this;
    Object.keys(patch).forEach(function (k) {
      if (k.indexOf('.') > -1) {
        const parts = k.split('.');
        let t = self.data;
        for (let i = 0; i < parts.length - 1; i++) t = t[parts[i]];
        t[parts[parts.length - 1]] = patch[k];
      } else self.data[k] = patch[k];
    });
  };
  return inst;
}
function ev(d) {
  return { currentTarget: { dataset: d || {} }, detail: {} };
}

const store = require(path.join(ROOT, 'utils/store.js'));
const care = require(path.join(ROOT, 'utils/care.js'));

let pass = 0;
let fail = 0;
function ok(c, l) {
  if (c) {
    pass++;
    console.log('  ✓ ' + l);
  } else {
    fail++;
    console.log('  ✗ ' + l);
  }
}
function eq(a, b, l) {
  const x = JSON.stringify(a);
  const y = JSON.stringify(b);
  ok(x === y, l + (x === y ? '' : '\n      期望 ' + y + '\n      实际 ' + x));
}
function clear() {
  Object.keys(mem).forEach(function (k) {
    delete mem[k];
  });
}
function ts(date, time) {
  const p = time.split(':').map(Number);
  return care.dayStart(date) + p[0] * care.HOUR + p[1] * care.MIN;
}

const MIN = care.MIN;
const HOUR = care.HOUR;
const TODAY = care.dateOf(Date.now());
const YEST = care.dateOf(Date.now() - care.DAY);

const fixtures = require('./fixtures.js');
// 相对今天构造生日（月末安全，口径同 calcAge）。不要写死生日：今天在走，月龄会跟着变
function birthdayMonthsAgo(n, days) {
  return fixtures.birthdayForAge(n, days || 0);
}

/* ================= 1. 存储分片 ================= */
console.log('\n[1] 按月分片存储');
clear();
store.saveBabies([{ id: 'b1', name: '小芽', birthday: birthdayMonthsAgo(1) }]);
store.updateSettings({ activeBabyId: 'b1' });

const t1 = ts('2026-10-31', '23:00');
const t2 = ts('2026-11-01', '01:00');
store.upsertCare({ babyId: 'b1', type: 'feed', side: 'bottle', ml: 90, start: t1, end: t1 });
store.upsertCare({ babyId: 'b1', type: 'diaper', kind: 'wet', start: t2 });
eq(store.getCareIndex(), ['202610', '202611'], '两条记录落在两个月份分片');
eq(store.getCareShard('202610').length, 1, '10 月分片 1 条');
ok(mem['xyd_care_202611'] && mem['xyd_care_202611'].length === 1, '分片 key 形如 xyd_care_YYYYMM');

let threw = false;
try {
  store.upsertCare({ babyId: 'b1', type: 'nap', start: t1 });
} catch (e) {
  threw = true;
}
ok(threw, '未知类型被拒绝');

// 改开始时间跨月：要搬分片，旧分片清空后从索引里移除
const moved = store.getCareShard('202610')[0];
store.upsertCare({ id: moved.id, type: 'feed', start: ts('2026-11-02', '08:00') });
eq(store.getCareIndex(), ['202611'], '跨月修改后旧分片从索引移除');
eq(store.getCareShard('202611').length, 2, '记录搬到新分片');
eq(store.getCareEntry(moved.id).ml, 90, '搬迁时保留原字段');

ok(store.removeCare(moved.id), '删除记录');
eq(store.getCareEntry(moved.id), null, '删除后查不到');
ok(!store.removeCare('nope'), '删不存在的返回 false');

/* ================= 2. 汇总 ================= */
console.log('\n[2] 一天的汇总');
clear();
store.saveBabies([{ id: 'b1', name: '小芽', birthday: birthdayMonthsAgo(1) }]);
store.updateSettings({ activeBabyId: 'b1' });
const D = '2026-11-10';
// 跨夜睡眠：前一天 22:00 → 当天 02:00，只算当天的 2 小时
store.upsertCare({ babyId: 'b1', type: 'sleep', start: ts('2026-11-09', '22:00'), end: ts(D, '02:00') });
store.upsertCare({ babyId: 'b1', type: 'sleep', start: ts(D, '13:00'), end: ts(D, '14:30') });
store.upsertCare({ babyId: 'b1', type: 'feed', side: 'left', leftMin: 10, rightMin: 8, start: ts(D, '06:00'), end: ts(D, '06:18') });
store.upsertCare({ babyId: 'b1', type: 'feed', side: 'bottle', ml: 120, start: ts(D, '09:00'), end: ts(D, '09:00') });
store.upsertCare({ babyId: 'b1', type: 'diaper', kind: 'wet', start: ts(D, '07:00') });
store.upsertCare({ babyId: 'b1', type: 'diaper', kind: 'both', color: 'yellow', start: ts(D, '10:00') });
store.upsertCare({ babyId: 'b1', type: 'diaper', kind: 'dirty', color: 'pale', start: ts(D, '15:00') });
// 别的宝宝的记录不该混进来
store.upsertCare({ babyId: 'b2', type: 'feed', side: 'bottle', ml: 60, start: ts(D, '11:00'), end: ts(D, '11:00') });

const from = care.dayStart(D);
const entries = store.getCareRange('b1', from, from + care.DAY);
eq(entries.length, 7, '取当天有交集的记录（含跨夜睡眠，不含别的宝宝）');
ok(entries[0].start >= entries[entries.length - 1].start, '按开始时间倒序');

const sum = care.summarize(entries, D, 1, from + care.DAY + HOUR);
eq(sum.feeds, 2, '喂奶 2 次');
eq(sum.bottleMl, 120, '瓶喂合计');
eq(sum.breastMin, 18, '亲喂合计');
eq(Math.round(sum.sleepMs / MIN), 210, '睡眠只算落在当天的部分（2h + 1.5h）');
eq(sum.sleepText, '3小时30分', '睡眠时长文案');
eq([sum.diapers, sum.wet, sum.dirty], [3, 2, 2], '「都有」算 1 片，同时计入尿和便');
eq(sum.hints[0].level, 'doctor', '灰白便便放在提示第一条');
ok(/灰白/.test(sum.hints[0].text), '提示说明是哪种颜色');
ok(
  sum.hints.some(function (h) {
    return /喂了 2 次/.test(h.text);
  }),
  '1 月龄一天只喂 2 次 → 提示偏少'
);
ok(
  sum.hints.some(function (h) {
    return /湿尿布 2 片/.test(h.text);
  }),
  '湿尿布偏少提示'
);

// 当天上午不提示「偏少」
const morning = care.summarize(entries, D, 1, ts(D, '10:30'));
ok(
  !morning.hints.some(function (h) {
    return h.level === 'watch';
  }),
  '一天没过完时不提示「偏少」'
);
const big = care.summarize(entries, D, 30, from + care.DAY + HOUR);
ok(
  !big.hints.some(function (h) {
    return /湿尿布/.test(h.text);
  }),
  '2 岁以上不比湿尿布'
);

/* ================= 3. 计时 ================= */
console.log('\n[3] 计时与换边');
const T0 = ts(D, '08:00');
let f = { side: 'left', start: T0, sideStart: T0, leftMs: 0, rightMs: 0 };
f = care.switchSide(f, T0 + 10 * MIN);
eq(f.side, 'right', '换到右侧');
eq(f.leftMs, 10 * MIN, '左侧累计 10 分钟');
const rec = care.finishFeed(f, T0 + 17 * MIN, 'b1');
eq([rec.leftMin, rec.rightMin], [10, 7], '结束时两侧分别 10 / 7 分钟');
eq(rec.side, 'left', '主侧取时间长的一侧');
eq(rec.end - rec.start, 17 * MIN, '总时长 17 分钟');

const av = care.activeView({ feed: f, sleep: { start: T0 - 9 * HOUR } }, T0 + 12 * MIN);
eq(av.feed.leftText, '10 分钟', '计时中显示左侧累计');
eq(av.feed.rightText, '2 分钟', '计时中显示右侧进行中的时长');
ok(!av.feed.stale, '12 分钟不算超时');
ok(av.sleep.stale, '睡了 9 小时视为可能忘了点「醒了」');
ok(care.activeView({ feed: { side: 'left', start: T0, sideStart: T0 } }, T0 + 2 * HOUR).feed.stale, '喂奶 2 小时视为可能忘了点结束');

/* ================= 4. 文案 ================= */
console.log('\n[4] 文案');
eq(care.durText(45 * MIN), '45 分钟', '分钟');
eq(care.durText(80 * MIN), '1小时20分', '小时+分钟');
eq(care.durText(2 * HOUR), '2小时', '整小时');
const NOW = ts(D, '15:00');
eq(care.agoText(NOW - 30 * 1000, NOW), '刚刚', '1 分钟内');
eq(care.agoText(NOW - 135 * MIN, NOW), '2小时15分前', '几小时前');
eq(care.agoText(ts('2026-11-09', '21:30'), NOW), '昨天 21:30', '跨天显示昨天');
eq(care.describe({ id: 'x', type: 'diaper', kind: 'dirty', color: 'red', start: NOW }).level, 'doctor', '带红便便标记为就医级');
eq(care.describe({ id: 'x', type: 'feed', side: 'bottle', bottleType: 'breast', ml: 90, start: NOW }).title, '瓶喂 90ml', '瓶喂标题');
ok(/（次日）/.test(care.describe({ id: 'x', type: 'sleep', start: ts(D, '22:00'), end: ts('2026-11-11', '05:00') }).detail), '跨夜睡眠标注次日');
eq(care.describe({ id: 'x', type: 'sleep', start: ts(D, '22:00'), end: ts('2026-11-11', '05:00') }, '2026-11-11').time, '昨 22:00', '在次日的时间线里标「昨」');
const live = care.summarize(entries, D, 1, ts(D, '21:30'));
ok(
  !live.hints.some(function (h) {
    return h.level === 'watch';
  }),
  '当天晚上也不提示「偏少」（夜里还会再喂）'
);

/* ================= 5. 首页：记录动作 ================= */
console.log('\n[5] 首页记录动作');
clear();
store.saveBabies([{ id: 'b1', name: '小芽', birthday: birthdayMonthsAgo(1) }]);
store.updateSettings({ activeBabyId: 'b1' });
const ip = instance(mount('pages/index/index.js'));
ip.refresh();
eq(ip.data.careLines.length, 3, '状态卡三行：喂奶 / 睡眠 / 尿布');
ok(ip.data.careLines[0].empty, '没记录时显示「还没记过」');

ip.openCarePanel(ev({ type: 'feed' }));
eq(ip.data.carePanel, 'feed', '点喂奶打开面板');
ip.startFeed(ev({ side: 'right' }));
eq(ip.data.carePanel, '', '选边后面板关闭');
ok(!!ip.data.careActive.feed, '开始计时');
eq(ip.data.careActive.feed.sideLabel, '右侧', '从右侧开始');
ok(ip.data.careLines[0].live, '状态卡显示「正在喂」');

// 误触：不到 1 分钟就结束
ip.openCarePanel(ev({ type: 'feed' }));
ok(!ip.data.careActive.feed, '计时中再点喂奶 = 结束');
ok(/不到 1 分钟/.test(lastToast), '不到 1 分钟不留记录');
eq(store.getCareIndex().length, 0, '确实没有写入');

// 正常喂 15 分钟
ip.startFeed(ev({ side: 'left' }));
let act = store.getCareActive('b1').feed;
act.start -= 15 * MIN;
act.sideStart -= 15 * MIN;
store.setCareActive('b1', 'feed', act);
ip.endFeed();
ok(/15 分钟/.test(lastToast), '结束后提示时长');
const fed = store.getLatestCare('b1', 'feed');
eq([fed.leftMin, fed.rightMin], [15, 0], '记录左侧 15 分钟');
ok(/上次喂奶/.test(ip.data.careLines[0].text), '状态卡切到「上次喂奶」');

// 忘了点结束：选「按建议时间」
ip.startFeed(ev({ side: 'left' }));
act = store.getCareActive('b1').feed;
act.start -= 3 * HOUR;
act.sideStart -= 3 * HOUR;
store.setCareActive('b1', 'feed', act);
modalConfirm = true;
const forgotStart = act.start;
ip.endFeed();
ok(/忘了点结束/.test(lastModal), '超时时先问一下');
const fixed = store.getCareRange('b1', 0, Date.now() + HOUR).filter(function (e) {
  return e.type === 'feed' && e.start === forgotStart;
})[0];
eq(fixed.end - fixed.start, 20 * MIN, '按建议时间（20 分钟）结束');

// 瓶喂
ip.openCarePanel(ev({ type: 'feed' }));
ip.logBottle(ev({ ml: 120 }));
eq(store.getLatestCare('b1', 'feed').ml, 120, '瓶喂选量直接记');
ip.setData({ carePanel: 'feed', careBottleInput: '999' });
ip.logBottle(ev({}));
ok(/5~400/.test(lastToast), '奶量超范围被拦下');
ip.setData({ careBottleInput: '75' });
ip.logBottle(ev({}));
eq(store.getLatestCare('b1', 'feed').ml, 75, '自填奶量');

// 睡眠
ip.openCarePanel(ev({ type: 'sleep' }));
ok(!!ip.data.careActive.sleep, '点睡觉直接开始计时（不弹面板）');
eq(ip.data.carePanel, '', '睡觉不弹面板');
const sl = store.getCareActive('b1').sleep;
sl.start -= 50 * MIN;
store.setCareActive('b1', 'sleep', sl);
ip.openCarePanel(ev({ type: 'sleep' }));
ok(!ip.data.careActive.sleep, '再点 = 醒了');
eq(Math.round((store.getLatestCare('b1', 'sleep').end - store.getLatestCare('b1', 'sleep').start) / MIN), 50, '记录睡了 50 分钟');

// 睡了很久忘了点：选「不记了」
ip.startSleep();
const sl2 = store.getCareActive('b1').sleep;
sl2.start -= 10 * HOUR;
store.setCareActive('b1', 'sleep', sl2);
modalConfirm = false;
const before = store.getCareRange('b1', 0, Date.now() + HOUR).length;
ip.endSleep();
eq(store.getCareRange('b1', 0, Date.now() + HOUR).length, before, '选「不记了」不写入');
ok(!store.getCareActive('b1').sleep, '计时也清掉');
modalConfirm = true;

// 尿布
ip.openCarePanel(ev({ type: 'diaper' }));
ip.pickDiaper(ev({ key: 'wet' }));
eq(ip.data.carePanel, '', '尿：一步记完');
ip.openCarePanel(ev({ type: 'diaper' }));
ip.pickDiaper(ev({ key: 'dirty' }));
eq(ip.data.carePanel, 'poop', '便：进入选颜色');
ip.pickPoopTexture(ev({ key: 'watery' }));
lastModal = '';
ip.pickPoopColor(ev({ key: 'yellow' }));
ok(!/就医/.test(lastModal), '正常颜色不弹就医提示');
const dp = store.getLatestCare('b1', 'diaper');
eq([dp.kind, dp.color, dp.texture], ['dirty', 'yellow', 'watery'], '颜色与性状都记下');

ip.openCarePanel(ev({ type: 'diaper' }));
ip.pickDiaper(ev({ key: 'both' }));
ip.pickPoopColor(ev({ key: 'pale' }));
ok(/建议就医/.test(lastModal) && /胆道/.test(lastModal), '灰白便便立即提示就医');
ok(!!ip.data.careAlert, '首页出现就医提醒条');

ip.openCarePanel(ev({ type: 'diaper' }));
ip.pickDiaper(ev({ key: 'dirty' }));
ip.pickPoopColor(ev({ key: '' }));
eq(store.getLatestCare('b1', 'diaper').color, '', '可以不记颜色');
ok(/今天 4 片/.test(ip.data.careLines[2].text), '状态卡统计今天尿布片数');

ip.goCareEdit(ev({ type: 'feed' }));
eq(lastNav, '/pages/care-edit/care-edit?type=feed', '面板里可去补记');

// 没有宝宝
clear();
const ip2 = instance(mount('pages/index/index.js'));
ip2.openCarePanel(ev({ type: 'feed' }));
ok(/先添加宝宝/.test(lastToast), '没有宝宝时提示先添加');

/* ================= 6. 记录 tab ================= */
console.log('\n[6] 记录页');
clear();
store.saveBabies([{ id: 'b1', name: '小芽', birthday: birthdayMonthsAgo(2) }]);
store.updateSettings({ activeBabyId: 'b1' });
store.upsertCare({ babyId: 'b1', type: 'feed', side: 'bottle', ml: 100, start: ts(YEST, '09:00'), end: ts(YEST, '09:00') });
store.upsertCare({ babyId: 'b1', type: 'diaper', kind: 'wet', start: ts(YEST, '10:00') });

const rp = instance(mount('pages/record/record.js'));
rp.onLoad({});
rp.onShow();
ok(rp.data.hasBaby, '识别宝宝');
eq(rp.data.date, TODAY, '默认看今天');
ok(rp.data.isToday, '今天显示记录按钮');
eq(rp.data.dateLabel, '今天', '日期标签');
eq(rp.data.rows.length, 0, '今天没有记录');
ok(!rp.data.showFood, '2 月龄不显示辅食入口');

rp.prevDay();
eq(rp.data.dateLabel, '昨天', '切到昨天');
ok(!rp.data.isToday, '过去的日子显示补记');
eq(rp.data.rows.length, 2, '昨天 2 条');
eq(rp.data.sum.bottleMl, 100, '昨天汇总');
rp.switchFilter(ev({ key: 'diaper' }));
eq(rp.data.rows.length, 1, '按类型筛选');
eq(rp.data.total, 2, '筛选不影响总数');
rp.switchFilter(ev({ key: 'all' }));

rp.addPast(ev({ type: 'sleep' }));
eq(lastNav, '/pages/care-edit/care-edit?type=sleep&date=' + YEST, '补记带上正在看的日期');
rp.openRow(ev({ open: rp.data.rows[0].open }));
ok(lastNav.indexOf('/pages/care-edit/care-edit?id=') === 0, '点时间线进入编辑');

rp.nextDay();
eq(rp.data.date, TODAY, '前进到今天');
rp.nextDay();
eq(rp.data.date, TODAY, '不能翻到未来');

rp.onPickDate({ detail: { value: YEST } });
rp.backToday();
eq(rp.data.date, TODAY, '回到今天');

rp.openCarePanel(ev({ type: 'sleep' }));
ok(!!rp.data.careActive.sleep, '记录页也能直接开始计时');
store.setCareActive('b1', 'sleep', null);

// 5 月龄起出辅食入口
store.saveBabies([{ id: 'b1', name: '小芽', birthday: birthdayMonthsAgo(5) }]);
rp.onShow();
ok(rp.data.showFood, '5 月龄显示辅食入口');
ok(/下个月/.test(rp.data.foodText), '5 月龄提示提前准备');
rp.goFood();
eq(lastNav, '/pages/food/food', '辅食本 navigateTo');

clear();
const rp2 = instance(mount('pages/record/record.js'));
rp2.onLoad({});
rp2.onShow();
ok(!rp2.data.hasBaby, '没有宝宝时显示引导');

/* ================= 7. 补记 / 编辑页 ================= */
console.log('\n[7] 补记与编辑');
clear();
store.saveBabies([{ id: 'b1', name: '小芽', birthday: birthdayMonthsAgo(2) }]);
store.updateSettings({ activeBabyId: 'b1' });

let ce = instance(mount('pages/care-edit/care-edit.js'));
ce.onLoad({ type: 'feed', date: YEST });
eq(ce.data.date, YEST, '补记落在指定日期');
eq(ce.data.time, '12:00', '补记过去默认中午');
ce.save();
ok(/至少填一侧/.test(lastToast), '亲喂两侧都没填被拦下');
ce.setData({ leftMin: '12', rightMin: '6', time: '07:30' });
ce.save();
eq(lastToast, '已补记', '保存成功提示');
let saved = store.getLatestCare('b1', 'feed');
eq([saved.leftMin, saved.rightMin, care.hm(saved.start)], [12, 6, '07:30'], '亲喂补记写入');
eq(saved.end - saved.start, 18 * MIN, '结束时间按时长推算');

ce = instance(mount('pages/care-edit/care-edit.js'));
ce.onLoad({ id: saved.id });
ok(ce.data.isEdit, '编辑模式');
eq(ce.data.leftMin, '12', '回填亲喂时长');
ce.setData({ feedMode: 'bottle', ml: '150' });
ce.save();
saved = store.getCareEntry(saved.id);
eq([saved.side, saved.ml, saved.leftMin], ['bottle', 150, 0], '改成瓶喂，亲喂字段清零');

// 跨夜补记放在「前天晚上 → 昨天早上」：如果用「昨晚 → 今早 5 点」，凌晨跑测试时 5 点还没到，
// 产品会正确地拦下「醒来时间不能晚于现在」，测试就误报了
const DAY2 = care.dateOf(Date.now() - 2 * care.DAY);
ce = instance(mount('pages/care-edit/care-edit.js'));
ce.onLoad({ type: 'sleep', date: DAY2 });
ce.setData({ time: '22:00', endDate: DAY2, endTime: '21:00' });
ce.save();
ok(/晚于入睡/.test(lastToast), '醒来早于入睡被拦下');
ce.setData({ endDate: YEST, endTime: '05:00' });
ce.save();
const night = store.getLatestCare('b1', 'sleep');
eq(Math.round((night.end - night.start) / HOUR), 7, '跨夜睡眠补记');
ce.setData({ time: '20:00', endDate: YEST, endTime: '18:00' });
ce.save();
ok(/16 小时/.test(lastToast), '一觉超过 16 小时被拦下');

ce = instance(mount('pages/care-edit/care-edit.js'));
ce.onLoad({ type: 'diaper' });
ce.pickKind(ev({ key: 'dirty' }));
ce.pickColor(ev({ key: 'black' }));
eq(ce.data.colorTip.level, 'doctor', '选黑色时页面内就提示');
lastModal = '';
ce.save();
ok(/建议就医/.test(lastModal), '补记就医级颜色也弹提醒');
ce.pickColor(ev({ key: 'black' }));
eq(ce.data.color, '', '再点一次取消颜色');
ce.pickKind(ev({ key: 'wet' }));
eq(ce.data.colorTip, null, '切回「尿」清掉颜色');

ce = instance(mount('pages/care-edit/care-edit.js'));
ce.onLoad({ type: 'diaper' });
const future = new Date(Date.now() + 2 * HOUR);
if (care.dateOf(future.getTime()) === TODAY) {
  ce.setData({ time: care.hm(future.getTime()) });
  ce.save();
  ok(/晚于现在/.test(lastToast), '不能记未来的时间');
} else {
  ok(true, '（临近午夜，跳过未来时间用例）');
}

const toDel = store.getLatestCare('b1', 'diaper');
ce = instance(mount('pages/care-edit/care-edit.js'));
ce.onLoad({ id: toDel.id });
ce.remove();
eq(store.getCareEntry(toDel.id), null, '编辑页可删除');

/* ================= 8. 删宝宝 & 备份 ================= */
console.log('\n[8] 删宝宝与备份');
clear();
store.saveBabies([
  { id: 'b1', name: '小芽', birthday: birthdayMonthsAgo(2) },
  { id: 'b2', name: '小禾', birthday: birthdayMonthsAgo(2) }
]);
store.updateSettings({ activeBabyId: 'b1' });
store.upsertCare({ babyId: 'b1', type: 'diaper', kind: 'wet', start: ts('2026-09-15', '10:00') });
store.upsertCare({ babyId: 'b1', type: 'diaper', kind: 'wet', start: ts('2026-10-15', '10:00') });
store.upsertCare({ babyId: 'b2', type: 'diaper', kind: 'wet', start: ts('2026-10-16', '10:00') });
store.setCareActive('b1', 'sleep', { start: Date.now() });

eq(store.localStats().care, 3, '本机统计包含照护记录');
const text = store.exportBackup();
ok(/careShards/.test(text), '备份包含照护分片');
ok(!/xyd_care_active|careActive/.test(text), '进行中的计时不进备份');

store.removeBaby('b1');
eq(store.getCareIndex(), ['202610'], '删宝宝后只剩另一个宝宝所在的月份');
eq(store.getCareShard('202610').length, 1, '另一个宝宝的记录保留');
ok(!store.getCareActive('b1').sleep, '计时一并清掉');

clear();
store.upsertCare({ babyId: 'zz', type: 'diaper', kind: 'wet', start: ts('2026-08-01', '10:00') });
// 合并（默认）：本机那条 8 月的记录保留，备份里的 3 条加进来
let parsed = store.importBackup(text);
eq(parsed.mode, 'merge', '默认是合并');
eq(parsed.stats.care, 3, '导入返回照护条数');
eq(store.getCareIndex(), ['202608', '202609', '202610'], '合并：本机原有月份保留，备份的月份加进来');
eq(parsed.result.added, 3 + 2, '合并：新增 3 条照护 + 2 个宝宝');
// 替换：本机多出来的月份被清掉
parsed = store.importBackup(text, 'replace');
eq(parsed.mode, 'replace', '指定替换');
eq(store.getCareIndex(), ['202609', '202610'], '替换后索引与备份一致（本机多出来的月份被清掉）');
eq(store.getCareShard('202608').length, 0, '旧分片已清空');
eq(store.getCareRange('b1', ts('2026-09-01', '00:00'), ts('2026-11-01', '00:00')).length, 2, '导入后可按宝宝查询');

/* ================= 9. 静态 ================= */
console.log('\n[9] 结构');
const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
const tabPages = app.tabBar.list.map(function (t) {
  return t.pagePath;
});
ok(tabPages[1] === 'pages/record/record', '「记录」tab 指向记录页');
ok(require('./fixtures.js').allPages(app).indexOf('pages/care-edit/care-edit') > -1, '补记页已注册');
const careData = require(path.join(ROOT, 'data/care.js'));
['black', 'red', 'pale'].forEach(function (k) {
  const c = careData.POOP_COLORS.filter(function (x) {
    return x.key === k;
  })[0];
  ok(c && c.level === 'doctor', k + ' 为就医级颜色');
});
ok(
  careData.DAILY_REF[0].min === 0 &&
    careData.DAILY_REF[careData.DAILY_REF.length - 1].max === 36 &&
    careData.DAILY_REF.every(function (r, i, arr) {
      return i === 0 || r.min === arr[i - 1].max + 1;
    }),
  '月龄参考 0-36 连续无缺口'
);

console.log('\n========================================');
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
console.log('========================================\n');
process.exit(fail ? 1 : 0);
