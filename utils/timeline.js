// utils/timeline.js —— 统一时间线：喂奶 / 睡眠 / 尿布 / 辅食进食 / 新食材 / 接种 / 身高体重 合成一条
// 「记录」tab 的时间线、首页「最近记的」都从这里取，一个口径。
//
// 没有具体时刻的记录（一餐只有餐次、新食材 / 接种 / 测量只有日期）给一个「排序用时刻」，
// 页面上不显示假的几点几分：餐次显示「午餐」，其余显示「当天」。

const store = require('./store.js');
const care = require('./care.js');
const foodUtil = require('./food.js');
const vaccine = require('./vaccine.js');

const DAY = 86400000;

/** 餐次 → 排序用的钟点（只参与排序，不显示） */
const SLOT_HOUR = { am: 8, noon: 12, pm: 15.5, eve: 18, other: 20 };

const FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'feed', label: '喂奶' },
  { key: 'sleep', label: '睡眠' },
  { key: 'diaper', label: '尿布' },
  { key: 'food', label: '辅食' },
  { key: 'other', label: '接种·测量' }
];

function dayStart(date) {
  return care.dayStart(date);
}

function at(date, hour) {
  return dayStart(date) + Math.round(hour * 3600000);
}

/** 照护记录 → 时间线行 */
function fromCare(e, viewDate) {
  const d = care.describe(e, viewDate);
  return Object.assign(d, {
    key: 'care-' + e.id,
    kind: e.type,
    group: e.type,
    sort: e.start,
    by: e.by || '',
    open: '/pages/care-edit/care-edit?id=' + e.id
  });
}

function fromMeal(l) {
  const names = (l.foods || [])
    .map(function (id) {
      const f = foodUtil.foodById(id);
      return f ? f.name : '';
    })
    .filter(Boolean);
  const slot = foodUtil.slotLabelOf(l.slot);
  return {
    key: 'meal-' + l.id,
    id: l.id,
    kind: 'meal',
    group: 'food',
    type: 'meal',
    time: slot,
    sort: at(l.date, SLOT_HOUR[l.slot] || 20) + ((l.createdAt || 0) % 1000),
    emoji: '🥣',
    title: slot + (l.recipeName ? ' · ' + l.recipeName : ''),
    detail: names.length ? names.slice(0, 4).join('、') : l.note || '',
    level: 'ok',
    by: l.by || '',
    date: l.date,
    open: '/pages/meal-log/meal-log?id=' + l.id
  };
}

function fromFood(r) {
  const f = foodUtil.foodById(r.foodId);
  const re = foodUtil.reactionOf(r.reaction);
  const bad = r.reaction && r.reaction !== 'none';
  return {
    key: 'food-' + r.id,
    id: r.id,
    kind: 'foodtry',
    group: 'food',
    type: 'foodtry',
    time: '当天',
    sort: at(r.date, 11.9),
    emoji: '🥕',
    title: '新食材 · ' + (f ? f.name : '未知食材'),
    detail: re && re.label ? re.label + (r.reactionNote ? ' · ' + r.reactionNote : '') : '',
    level: bad ? 'watch' : 'ok',
    by: r.by || '',
    date: r.date,
    open: '/pages/food-edit/food-edit?id=' + r.id
  };
}

function fromVax(r) {
  const v = vaccine.getVaccine(r.vaccineId);
  const hasTime = /^\d{2}:\d{2}$/.test(String(r.time || ''));
  const hm = hasTime ? r.time.split(':').map(Number) : [10, 0];
  return {
    key: 'vax-' + r.id,
    id: r.id,
    kind: 'vax',
    group: 'other',
    type: 'vax',
    time: hasTime ? r.time : '当天',
    sort: at(r.date, hm[0] + hm[1] / 60),
    emoji: '💉',
    title: (v ? v.name : '疫苗') + (r.dose ? ' 第 ' + r.dose + ' 剂' : ''),
    detail: r.place || '',
    level: 'ok',
    by: r.by || '',
    date: r.date,
    open: '/pages/vaccine-edit/vaccine-edit?id=' + r.id
  };
}

function fromGrowth(g) {
  const parts = [];
  if (g.weight !== null && g.weight !== undefined) parts.push(g.weight + ' kg');
  if (g.height !== null && g.height !== undefined) parts.push(g.height + ' cm');
  return {
    key: 'growth-' + g.id,
    id: g.id,
    kind: 'growth',
    group: 'other',
    type: 'growth',
    time: '当天',
    sort: at(g.date, 9),
    emoji: '📏',
    title: '身高体重 · ' + parts.join(' · '),
    detail: g.note || '',
    level: 'ok',
    by: g.by || '',
    date: g.date,
    open: '/pages/growth/growth'
  };
}

/** 某一天的完整时间线（倒序：最近的在上） */
function day(babyId, date) {
  const from = dayStart(date);
  const rows = [];
  store.getCareRange(babyId, from, from + DAY).forEach(function (e) {
    rows.push(fromCare(e, date));
  });
  store.getMealLogsByDate(babyId, date).forEach(function (l) {
    rows.push(fromMeal(l));
  });
  store.getFoodRecords(babyId).forEach(function (r) {
    if (r.date === date) rows.push(fromFood(r));
  });
  store.getVaccineRecords(babyId).forEach(function (r) {
    // 未来日期是「待安排」，不进时间线
    if (r.date === date && r.date <= care.dateOf(Date.now())) rows.push(fromVax(r));
  });
  store.getGrowth(babyId).forEach(function (g) {
    if (g.date === date) rows.push(fromGrowth(g));
  });
  return rows.sort(function (a, b) {
    return b.sort - a.sort;
  });
}

function filter(rows, key) {
  if (!key || key === 'all') return rows;
  return rows.filter(function (r) {
    return r.group === key;
  });
}

/** 每类有几条（筛选标签上显示） */
function counts(rows) {
  const out = { all: rows.length };
  rows.forEach(function (r) {
    out[r.group] = (out[r.group] || 0) + 1;
  });
  return out;
}

/**
 * 首页「最近记的」：跨天取最近 limit 条，含全部类型
 * 照护记录只看最近 2 天就够（一天十几条，再往前翻没意义）
 */
function recent(babyId, limit, now) {
  const t = now || Date.now();
  const today = care.dateOf(t);
  const rows = [];
  store.getCareRange(babyId, t - 2 * DAY, t + 60000).forEach(function (e) {
    rows.push(fromCare(e));
  });
  store.getMealLogs(babyId).forEach(function (l) {
    rows.push(fromMeal(l));
  });
  store.getFoodRecords(babyId).forEach(function (r) {
    rows.push(fromFood(r));
  });
  store.getVaccineRecords(babyId).forEach(function (r) {
    if (r.date <= today) rows.push(fromVax(r));
  });
  store.getGrowth(babyId).forEach(function (g) {
    rows.push(fromGrowth(g));
  });
  rows.sort(function (a, b) {
    return b.sort - a.sort;
  });
  const yest = care.dateOf(t - DAY);
  return rows.slice(0, limit).map(function (r) {
    const d = r.date || care.dateOf(r.sort);
    let when = d === today ? '今天' : d === yest ? '昨天' : d.slice(5).replace('-', '/');
    if (r.kind === 'feed' || r.kind === 'sleep' || r.kind === 'diaper') when += ' ' + care.hm(r.sort);
    return Object.assign({}, r, { when: when });
  });
}

module.exports = {
  FILTERS: FILTERS,
  day: day,
  filter: filter,
  counts: counts,
  recent: recent,
  _from: { care: fromCare, meal: fromMeal, food: fromFood, vax: fromVax, growth: fromGrowth }
};
