// utils/stats.js —— 记录的回报：近 7 天趋势 + 上周小结（纯计算，不碰 wx）
const store = require('./store.js');
const care = require('./care.js');
const ref = require('../data/care.js');

const DAY = 86400000;
const WEEK_CN = ['日', '一', '二', '三', '四', '五', '六'];

function refFor(months) {
  const list = ref.DAILY_REF || [];
  for (let i = 0; i < list.length; i++) {
    if (months >= list[i].min && months <= list[i].max) return list[i];
  }
  return list[list.length - 1] || null;
}

/**
 * 某天的三项数字
 * @return { date, feeds, sleepMin, diapers, meals }
 */
function dayNumbers(babyId, date, months, now) {
  const from = care.dayStart(date);
  const entries = store.getCareRange(babyId, from, from + DAY);
  const s = care.summarize(entries, date, months, now);
  return {
    date: date,
    feeds: s.feeds,
    sleepMin: Math.round((s.sleepMs || 0) / 60000),
    diapers: s.diapers,
    meals: store.getMealLogsByDate(babyId, date).length
  };
}

/**
 * 截止 endDate（含）往前 7 天
 * @return { days: [...7 天], metric 视图 }
 */
function lastDays(babyId, endDate, months, n, now) {
  const count = n || 7;
  const out = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = care.dateOf(care.dayStart(endDate) - i * DAY + 12 * 3600000);
    out.push(dayNumbers(babyId, d, months, now));
  }
  return out;
}

/** 柱状图的数据：label 显示「周几」，今天高亮 */
function bars(days, metric, today) {
  return days.map(function (d) {
    const dt = new Date(care.dayStart(d.date));
    let value = d[metric];
    let text = String(value || '');
    if (metric === 'sleepMin') {
      value = Math.round((d.sleepMin / 60) * 10) / 10;
      text = value ? String(value) : '';
    }
    return {
      label: d.date === today ? '今天' : '周' + WEEK_CN[dt.getDay()],
      value: value,
      text: text,
      highlight: d.date === today
    };
  });
}

/** 参考区间（柱状图背景带）：喂奶次数、睡眠小时、湿尿布片数 */
function refBand(metric, months) {
  const r = refFor(months);
  if (!r) return null;
  if (metric === 'feeds' && r.feeds) return [r.feeds[0], r.feeds[1]];
  if (metric === 'sleepMin' && r.sleepH) return [r.sleepH[0], r.sleepH[1]];
  if (metric === 'diapers' && r.wet && r.wet[0]) return [r.wet[0], r.wet[0]];
  return null;
}

function avg(list, key, onlyDone) {
  const xs = list.filter(function (d) {
    return !onlyDone || d[key] > 0;
  });
  if (!xs.length) return 0;
  let s = 0;
  xs.forEach(function (d) {
    s += d[key];
  });
  return s / xs.length;
}

function hText(min) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? h + ' 小时' + (m ? m + ' 分' : '') : m + ' 分钟';
}

/** 上周一（YYYY-MM-DD） */
function lastMonday(today) {
  const t = care.dayStart(today);
  const dow = new Date(t).getDay() || 7; // 周日算 7
  return care.dateOf(t - (dow - 1 + 7) * DAY + 12 * 3600000);
}

/**
 * 上周小结：周一到周日。至少有 3 天有记录才出，避免「平均每天喂 1 次」这种误导
 * @return null 或 { range, lines: [{emoji, text}], highlights, newFoods, babyName }
 */
function weekly(baby, today, months, now) {
  const mon = lastMonday(today);
  const days = [];
  for (let i = 0; i < 7; i++) days.push(dayNumbers(baby.id, care.dateOf(care.dayStart(mon) + i * DAY + 12 * 3600000), months, now));
  const active = days.filter(function (d) {
    return d.feeds + d.diapers + d.sleepMin + d.meals > 0;
  });
  if (active.length < 3) return null;
  const sun = days[6].date;
  const lines = [];
  const feeds = avg(active, 'feeds', true);
  const sleep = avg(active, 'sleepMin', true);
  const diapers = avg(active, 'diapers', true);
  if (feeds) lines.push({ emoji: '🍼', text: '平均每天喂奶 ' + Math.round(feeds * 10) / 10 + ' 次' });
  if (sleep) lines.push({ emoji: '😴', text: '平均每天睡 ' + hText(sleep) });
  if (diapers) lines.push({ emoji: '🧷', text: '平均每天 ' + Math.round(diapers * 10) / 10 + ' 片尿布' });

  const newFoods = store.getFoodRecords(baby.id).filter(function (r) {
    return r.date >= mon && r.date <= sun;
  });
  const meals = days.reduce(function (s, d) {
    return s + d.meals;
  }, 0);
  if (newFoods.length) lines.push({ emoji: '🥕', text: '试了 ' + newFoods.length + ' 种新食材' });
  else if (meals) lines.push({ emoji: '🥣', text: '记了 ' + meals + ' 餐辅食' });
  const vax = store.getVaccineRecords(baby.id).filter(function (r) {
    return r.date >= mon && r.date <= sun;
  });
  if (vax.length) lines.push({ emoji: '💉', text: '打了 ' + vax.length + ' 针疫苗' });

  const range = mon.slice(5).replace('-', '/') + '–' + sun.slice(5).replace('-', '/');
  return {
    key: mon,
    range: range,
    activeDays: active.length,
    lines: lines,
    babyName: baby.name || '宝宝',
    title: (baby.name || '宝宝') + '的一周 · ' + range
  };
}

module.exports = {
  dayNumbers: dayNumbers,
  lastDays: lastDays,
  bars: bars,
  refBand: refBand,
  weekly: weekly,
  lastMonday: lastMonday
};
