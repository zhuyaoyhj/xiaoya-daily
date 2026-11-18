// utils/care.js —— 照护记录（喂奶 / 睡眠 / 尿布）的纯函数
// 不读写存储：调用方把记录和「现在」传进来，方便测试与复用

const {
  DAILY_REF,
  FEED_KINDS,
  BOTTLE_TYPES,
  DIAPER_KINDS,
  POOP_COLORS,
  POOP_TEXTURES,
  STALE_MIN,
  STALE_DEFAULT_MIN
} = require('../data/care.js');

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

/** 'YYYY-MM-DD' → 当天 0 点时间戳（本地时区） */
function dayStart(dateStr) {
  const p = String(dateStr).split('-').map(Number);
  return new Date(p[0], p[1] - 1, p[2]).getTime();
}

function dateOf(ts) {
  const d = new Date(ts);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function hm(ts) {
  const d = new Date(ts);
  return pad(d.getHours()) + ':' + pad(d.getMinutes());
}

/** 时长文案：45 分钟 / 1小时20分 / 2小时 */
function durText(ms) {
  const m = Math.max(0, Math.round(ms / MIN));
  if (m < 60) return m + ' 分钟';
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? h + '小时' + r + '分' : h + '小时';
}

/** 「距上次」文案：刚刚 / 25 分钟前 / 2小时15分前 / 昨天 21:30 */
function agoText(ts, now) {
  const diff = now - ts;
  if (diff < MIN) return '刚刚';
  if (diff < 12 * HOUR) return durText(diff) + '前';
  const today = dayStart(dateOf(now));
  if (ts >= today - DAY && ts < today) return '昨天 ' + hm(ts);
  return dateOf(ts).slice(5).replace('-', '/') + ' ' + hm(ts);
}

function labelOf(list, key) {
  for (let i = 0; i < list.length; i++) if (list[i].key === key) return list[i];
  return null;
}

function poopColor(key) {
  return labelOf(POOP_COLORS, key);
}

function refFor(months) {
  const m = Math.max(0, Math.min(36, Math.floor(Number(months) || 0)));
  for (let i = 0; i < DAILY_REF.length; i++) {
    if (m >= DAILY_REF[i].min && m <= DAILY_REF[i].max) return DAILY_REF[i];
  }
  return DAILY_REF[DAILY_REF.length - 1];
}

/* ---------------- 单条记录的展示 ---------------- */

/**
 * 一条记录 → 时间线上的一行
 * @param {String} viewDate 可选，正在看的那一天；从前一天开始的（跨夜睡眠）时间前标「昨」
 */
function describe(e, viewDate) {
  const prevDay = viewDate && dateOf(e.start) < viewDate;
  const out = {
    id: e.id,
    type: e.type,
    time: (prevDay ? '昨 ' : '') + hm(e.start),
    start: e.start,
    title: '',
    detail: '',
    emoji: '',
    level: 'ok'
  };

  if (e.type === 'feed') {
    const k = labelOf(FEED_KINDS, e.side) || FEED_KINDS[0];
    out.emoji = '🍼';
    if (e.side === 'bottle') {
      const bt = labelOf(BOTTLE_TYPES, e.bottleType);
      out.title = '瓶喂' + (e.ml ? ' ' + e.ml + 'ml' : '');
      out.detail = bt ? bt.label : '';
    } else {
      const parts = [];
      const left = Number(e.leftMin) || 0;
      const right = Number(e.rightMin) || 0;
      if (left) parts.push('左 ' + left + ' 分');
      if (right) parts.push('右 ' + right + ' 分');
      out.title = '亲喂' + (parts.length ? ' · ' + parts.join(' / ') : ' · ' + k.label);
      if (e.end) out.detail = hm(e.start) + '–' + hm(e.end);
    }
  } else if (e.type === 'sleep') {
    out.emoji = '😴';
    out.title = e.end ? '睡了 ' + durText(e.end - e.start) : '正在睡';
    out.detail = e.end ? hm(e.start) + '–' + hm(e.end) + (dateOf(e.end) !== dateOf(e.start) ? '（次日）' : '') : '';
  } else if (e.type === 'diaper') {
    const k = labelOf(DIAPER_KINDS, e.kind) || DIAPER_KINDS[0];
    out.emoji = k.key === 'wet' ? '💧' : '💩';
    out.title = '尿布 · ' + k.label;
    const bits = [];
    const c = poopColor(e.color);
    if (c) {
      bits.push(c.label);
      out.level = c.level;
      out.colorHex = c.hex;
    }
    const tx = labelOf(POOP_TEXTURES, e.texture);
    if (tx) bits.push(tx.label);
    out.detail = bits.join(' · ');
  }
  if (e.note) out.detail = out.detail ? out.detail + ' · ' + e.note : e.note;
  return out;
}

/* ---------------- 一天的汇总 ---------------- */

/**
 * @param {Array} entries 与这一天有交集的记录（store.getCareRange 的结果）
 * @param {String} date   'YYYY-MM-DD'
 * @param {Number} months 月龄，用于对照参考
 * @param {Number} now    现在（进行中的睡眠算到 now）
 */
function summarize(entries, date, months, now) {
  const from = dayStart(date);
  const to = from + DAY;
  const list = entries || [];

  let feeds = 0;
  let bottleMl = 0;
  let breastMin = 0;
  let sleepMs = 0;
  let wet = 0;
  let dirty = 0;
  let diapers = 0;
  let worstPoop = null;

  list.forEach(function (e) {
    if (e.type === 'feed') {
      if (e.start < from || e.start >= to) return;
      feeds++;
      if (e.side === 'bottle') bottleMl += Number(e.ml) || 0;
      else breastMin += (Number(e.leftMin) || 0) + (Number(e.rightMin) || 0);
    } else if (e.type === 'sleep') {
      // 跨夜的睡眠只算落在这一天里的那一段
      const end = e.end || Math.min(now || to, to);
      const s = Math.max(e.start, from);
      const t = Math.min(end, to);
      if (t > s) sleepMs += t - s;
    } else if (e.type === 'diaper') {
      if (e.start < from || e.start >= to) return;
      diapers++;
      if (e.kind === 'wet' || e.kind === 'both') wet++;
      if (e.kind === 'dirty' || e.kind === 'both') {
        dirty++;
        const c = poopColor(e.color);
        if (c && c.level === 'doctor') worstPoop = c;
      }
    }
  });

  const ref = refFor(months);
  const hints = [];
  // 只对已经过完的日子比「偏少」：小月龄夜里还要喂好几次，当天任何时刻比都会误报
  const dayDone = !now || now >= to;
  if (dayDone && feeds > 0 && feeds < ref.feeds[0]) {
    hints.push({ level: 'watch', text: '喂了 ' + feeds + ' 次，这个月龄一般一天 ' + ref.feeds[0] + '–' + ref.feeds[1] + ' 次' });
  }
  if (dayDone && wet > 0 && ref.wet[0] > 0 && wet < ref.wet[0]) {
    hints.push({ level: 'watch', text: '湿尿布 ' + wet + ' 片，这个月龄一般 ' + ref.wet[0] + ' 片以上，留意是否吃够、喝够' });
  }
  if (worstPoop) {
    hints.unshift({ level: 'doctor', text: '记录到「' + worstPoop.label + '」便便：' + worstPoop.tip });
  }

  return {
    date: date,
    feeds: feeds,
    bottleMl: bottleMl,
    breastMin: breastMin,
    sleepMs: sleepMs,
    sleepText: sleepMs ? durText(sleepMs) : '0',
    wet: wet,
    dirty: dirty,
    diapers: diapers,
    ref: {
      feeds: ref.feeds[0] + '–' + ref.feeds[1] + ' 次',
      sleep: ref.sleepH[0] + '–' + ref.sleepH[1] + ' 小时'
    },
    hints: hints
  };
}

/* ---------------- 计时 ---------------- */

/** 进行中的计时 → 展示用：已经多久、是否可能忘了点结束 */
function activeView(active, now) {
  const out = {};
  if (active && active.feed) {
    const f = active.feed;
    const total = now - f.start;
    // 当前这一侧从 sideStart 开始算，换边前的累计在 leftMs/rightMs 里
    const curMs = now - (f.sideStart || f.start);
    const leftMs = (f.leftMs || 0) + (f.side === 'left' ? curMs : 0);
    const rightMs = (f.rightMs || 0) + (f.side === 'right' ? curMs : 0);
    out.feed = {
      side: f.side,
      sideLabel: f.side === 'left' ? '左侧' : '右侧',
      elapsed: durText(total),
      leftText: leftMs ? durText(leftMs) : '',
      rightText: rightMs ? durText(rightMs) : '',
      stale: total > STALE_MIN.feed * MIN
    };
  }
  if (active && active.sleep) {
    const total = now - active.sleep.start;
    out.sleep = {
      since: hm(active.sleep.start),
      elapsed: durText(total),
      stale: total > STALE_MIN.sleep * MIN
    };
  }
  return out;
}

/** 结束亲喂：把两侧累计时长折算成分钟，生成一条记录 */
function finishFeed(active, now, babyId) {
  const f = active;
  const curMs = now - (f.sideStart || f.start);
  const leftMs = (f.leftMs || 0) + (f.side === 'left' ? curMs : 0);
  const rightMs = (f.rightMs || 0) + (f.side === 'right' ? curMs : 0);
  return {
    babyId: babyId,
    type: 'feed',
    side: leftMs >= rightMs ? 'left' : 'right',
    start: f.start,
    end: now,
    leftMin: Math.round(leftMs / MIN),
    rightMin: Math.round(rightMs / MIN)
  };
}

/** 亲喂换边：累计上一侧时长，从现在开始算另一侧 */
function switchSide(active, now) {
  const f = Object.assign({}, active);
  const curMs = now - (f.sideStart || f.start);
  if (f.side === 'left') f.leftMs = (f.leftMs || 0) + curMs;
  else f.rightMs = (f.rightMs || 0) + curMs;
  f.side = f.side === 'left' ? 'right' : 'left';
  f.sideStart = now;
  return f;
}

/** 忘了点结束时，给一个合理的结束时间（开始 + 默认时长） */
function suggestEnd(type, start) {
  return start + (STALE_DEFAULT_MIN[type] || 30) * MIN;
}

/* ---------------- 首页状态卡 ---------------- */

/**
 * @param {Object} latest { feed, sleep, diaper } 各自最近一条
 * @param {Object} active 进行中的计时
 * @param {Object} today  summarize() 的结果
 */
function status(latest, active, today, now) {
  const av = activeView(active, now);
  const lines = [];

  if (av.feed) {
    lines.push({ key: 'feed', emoji: '🍼', text: '正在喂 · ' + av.feed.sideLabel + ' ' + av.feed.elapsed, live: true });
  } else if (latest.feed) {
    const f = latest.feed;
    const d = describe(f);
    // 喂奶间隔按「开始到开始」算，和医生说的「2-3 小时一次」同一口径
    lines.push({ key: 'feed', emoji: '🍼', text: '上次喂奶 ' + agoText(f.start, now), sub: hm(f.start) + ' 开始 · ' + d.title });
  } else {
    lines.push({ key: 'feed', emoji: '🍼', text: '还没记过喂奶', empty: true });
  }

  if (av.sleep) {
    lines.push({ key: 'sleep', emoji: '😴', text: '正在睡 · 已睡 ' + av.sleep.elapsed, live: true });
  } else if (latest.sleep && latest.sleep.end) {
    lines.push({ key: 'sleep', emoji: '😴', text: '醒了 ' + agoText(latest.sleep.end, now), sub: '上一觉 ' + durText(latest.sleep.end - latest.sleep.start) });
  } else {
    lines.push({ key: 'sleep', emoji: '😴', text: '还没记过睡觉', empty: true });
  }

  const diaperText =
    today.diapers > 0
      ? '今天 ' + today.diapers + ' 片（尿 ' + today.wet + ' · 便 ' + today.dirty + '）'
      : latest.diaper
      ? '上次换尿布 ' + agoText(latest.diaper.start, now)
      : '还没记过尿布';
  lines.push({ key: 'diaper', emoji: '🧷', text: diaperText, empty: !latest.diaper });

  return { lines: lines, active: av, alert: today.hints.filter(function (h) { return h.level === 'doctor'; })[0] || null };
}

module.exports = {
  MIN: MIN,
  HOUR: HOUR,
  DAY: DAY,
  FEED_KINDS: FEED_KINDS,
  BOTTLE_TYPES: BOTTLE_TYPES,
  DIAPER_KINDS: DIAPER_KINDS,
  POOP_COLORS: POOP_COLORS,
  POOP_TEXTURES: POOP_TEXTURES,
  dayStart: dayStart,
  dateOf: dateOf,
  hm: hm,
  durText: durText,
  agoText: agoText,
  poopColor: poopColor,
  refFor: refFor,
  describe: describe,
  summarize: summarize,
  activeView: activeView,
  finishFeed: finishFeed,
  switchSide: switchSide,
  suggestEnd: suggestEnd,
  status: status
};
