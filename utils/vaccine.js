// utils/vaccine.js —— 疫苗护理引擎
// 输入：疫苗条目 + 接种时间；输出：当前阶段该做什么、可能出现什么反应、什么情况要去医院

const { VACCINES, PHASES, COMMON, PLAN } = require('../data/vaccines.js');
const dateUtil = require('./date.js');
const store = require('./store.js');

const HOUR = 3600000;
const DAY = 86400000;

/* ---------------- 基础查询 ---------------- */

/** 用户自己加的二类疫苗，归一化成内置结构（没有专属知识，只给通用护理） */
function normalizeCustom(c) {
  const total = Math.max(1, Math.min(6, Number(c.doses) || 1));
  const doses = [];
  for (let i = 1; i <= total; i++) {
    doses.push({ n: i, label: '第 ' + i + ' 剂', month: null });
  }
  return {
    id: c.id,
    name: c.name,
    short: c.short || c.name,
    category: 'paid',
    emoji: '💧',
    route: '以说明书 / 门诊告知为准',
    site: '以门诊告知为准',
    doses: doses,
    before: c.note ? [c.note] : [],
    special: [],
    reactions: [
      { name: '发热、接种部位红肿', window: [4, 72], tip: '通用接种反应，按下面的事项护理即可' }
    ],
    redFlags: [],
    custom: true,
    note: c.note || ''
  };
}

function customVaccines() {
  try {
    return store.getCustomVaccines().map(normalizeCustom);
  } catch (e) {
    return [];
  }
}

/** 内置 + 自定义 */
function allVaccines() {
  return VACCINES.concat(customVaccines());
}

function listVaccines(category) {
  const list = allVaccines();
  if (!category || category === 'all') return list;
  return list.filter(function (v) {
    return v.category === category;
  });
}

function getVaccine(id) {
  if (!id) return null;
  const list = allVaccines();
  for (let i = 0; i < list.length; i++) {
    if (list[i].id === id) return list[i];
  }
  return null;
}

function doseCount(vaccine) {
  return vaccine && vaccine.doses ? vaccine.doses.length : 1;
}

function doseInfo(vaccine, n) {
  if (!vaccine || !vaccine.doses) return null;
  for (let i = 0; i < vaccine.doses.length; i++) {
    if (vaccine.doses[i].n === n) return vaccine.doses[i];
  }
  return vaccine.doses[vaccine.doses.length - 1];
}

function doseText(n) {
  const idx = ['一', '二', '三', '四', '五'];
  return '第' + (idx[n - 1] || n) + '剂';
}

/** 下一剂（同一疫苗里 n 更大的第一剂） */
function nextDose(vaccineId, currentN) {
  const v = getVaccine(vaccineId);
  if (!v || !v.doses) return null;
  for (let i = 0; i < v.doses.length; i++) {
    if (v.doses[i].n > currentN) {
      return {
        name: v.name,
        short: v.short,
        dose: v.doses[i].n,
        doseText: doseText(v.doses[i].n),
        label: v.doses[i].label,
        month: v.doses[i].month
      };
    }
  }
  return null;
}

/* ---------------- 时间 ---------------- */

/**
 * 接种时间 → 毫秒时间戳
 * 支持 'YYYY-MM-DD'、'YYYY-MM-DD HH:mm'、毫秒数
 * 只给日期时按当天 09:00 算（接种门诊基本都在上午开诊）
 */
function toTs(input) {
  if (typeof input === 'number') return input;
  const s = String(input == null ? '' : input).trim();
  if (!s) return 0;
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{1,2}))?/);
  if (!m) return 0;
  const hh = m[4] === undefined ? 9 : Number(m[4]);
  const mm = m[5] === undefined ? 0 : Number(m[5]);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), hh, mm).getTime();
}

/** 记录对象 → 时间戳 */
function tsOf(record) {
  const r = record || {};
  return toTs(r.date + (r.time ? ' ' + r.time : ''));
}

function hoursSince(record, now) {
  const ts = tsOf(record);
  if (!ts) return 0;
  const n = typeof now === 'number' ? now : Date.now();
  return Math.max(0, (n - ts) / HOUR);
}

/** 已过多久的文案：小时 / 天 */
function sinceText(hours) {
  if (hours < 1) return '刚接种 ' + Math.max(1, Math.round(hours * 60)) + ' 分钟';
  if (hours < 24) return '接种后 ' + Math.round(hours) + ' 小时';
  const days = Math.floor(hours / 24);
  if (days === 1) return '接种后 1 天';
  return '接种后 ' + days + ' 天';
}

function phaseFor(hours) {
  for (let i = 0; i < PHASES.length; i++) {
    if (hours >= PHASES[i].from && hours < PHASES[i].to) return PHASES[i];
  }
  return PHASES[PHASES.length - 1];
}

/* ---------------- 已接种 / 待安排 ---------------- */

/**
 * 日期晚于今天 = 待安排（还没打），不算已接种
 * 用字符串比较即可，'YYYY-MM-DD' 天然可比
 */
function isPlanned(record, today) {
  const t = today || dateUtil.todayStr();
  const d = String((record && record.date) || '');
  return !!d && d > t;
}

/** 拆分：已接种（不含今天之后） / 待安排 */
function splitRecords(records, today) {
  const t = today || dateUtil.todayStr();
  const past = [];
  const planned = [];
  (records || []).forEach(function (r) {
    if (isPlanned(r, t)) planned.push(r);
    else past.push(r);
  });
  return { past: past, planned: planned };
}

/** 待安排的接种计划：按日期从近到远 */
function plannedFor(records, now, today) {
  const t = today || dateUtil.todayStr();
  const n = typeof now === 'number' ? now : Date.now();

  return (records || [])
    .filter(function (r) {
      return isPlanned(r, t);
    })
    .sort(function (a, b) {
      return tsOf(a) - tsOf(b);
    })
    .map(function (r) {
      const care = careFor(r, n);
      const days = Math.round((tsOf(r) - n) / DAY);
      return {
        record: r,
        care: care,
        days: days,
        whenText: days <= 0 ? '就是今天' : days === 1 ? '明天' : days + ' 天后'
      };
    });
}

/* ---------------- 护理建议 ---------------- */

/**
 * 一次接种的护理方案
 * @param {Object} record  { vaccineId, dose, date }
 * @param {Number} now     可选，毫秒时间戳（测试用）
 */
function careFor(record, now) {
  const rec = record || {};
  const vaccine = getVaccine(rec.vaccineId);

  if (!vaccine) {
    return { ok: false, reason: 'UNKNOWN_VACCINE' };
  }

  const hours = hoursSince(rec, now);
  const phase = phaseFor(hours);

  // 阶段通用事项 + 该疫苗在这个阶段的特异事项
  const items = phase.items.map(function (it) {
    return { when: it.when, t: it.t, tag: it.tag };
  });
  (vaccine.special || []).forEach(function (s) {
    if (s.phase === phase.key) items.push({ when: '这一步', t: s.text, tag: '重点' });
  });

  // 把该疫苗的接种前提醒也带一条（补种或下一剂时用得上）
  if ((vaccine.before || []).length && phase.key === 'observe') {
    items.push({ when: '下次', t: vaccine.before[0], tag: '准备' });
  }

  // 自定义疫苗没有专属知识库，明确说清楚，别让家长以为漏了内容
  if (vaccine.custom) {
    items.push({
      when: '说明',
      t: '这是你自己添加的疫苗，App 没有它的专属护理知识，按下面通用事项护理，具体看说明书或门诊告知',
      tag: '提示'
    });
  }

  // 反应：分「现在可能出现」和「接下来可能出现」
  const now2 = [];
  const soon = [];
  (vaccine.reactions || []).forEach(function (r) {
    const w = r.window || [0, 48];
    const item = { name: r.name, tip: r.tip, urgent: !!r.urgent };
    if (hours >= w[0] && hours <= w[1]) now2.push(item);
    else if (hours < w[0]) {
      item.fromText = w[0] < 24 ? Math.round(w[0]) + ' 小时后' : Math.floor(w[0] / 24) + ' 天后';
      soon.push(item);
    }
  });

  const redFlags = (vaccine.redFlags || []).concat(COMMON.redFlags);
  const d = dateUtil.parseDate(rec.date);

  return {
    ok: true,
    vaccine: {
      id: vaccine.id,
      name: vaccine.name,
      short: vaccine.short,
      category: vaccine.category,
      emoji: vaccine.emoji,
      route: vaccine.route,
      site: vaccine.site,
      custom: !!vaccine.custom
    },
    dose: rec.dose || 1,
    doseText: doseText(rec.dose || 1),
    date: rec.date,
    time: rec.time || '',
    dateText: d ? d.getMonth() + 1 + ' 月 ' + d.getDate() + ' 日' + (rec.time ? ' ' + rec.time : '') : '',
    place: rec.place || '',
    hours: hours,
    days: Math.floor(hours / 24),
    sinceText: sinceText(hours),
    phaseKey: phase.key,
    phaseLabel: phase.label,
    phaseTip: phase.tip,
    tone: phase.tone,
    items: items,
    reactionsNow: now2,
    reactionsSoon: soon,
    redFlags: redFlags.slice(0, 6),
    emergency: COMMON.emergency,
    done: phase.key === 'later',
    next: nextDose(rec.vaccineId, rec.dose || 1)
  };
}

/* ---------------- 覆盖规则（联合疫苗替代单苗） ---------------- */

// 打了左边这个，右边规划表里的对应剂次就不再单独提醒
// 只写有明确替代关系的；13 价肺炎、流感、水痘这些不替代任何免费苗
const COVER_RULES = [
  {
    from: 'penta',
    name: '五联疫苗',
    covers: [
      // 五联 4 剂 = 百白破 4 剂 + 脊灰前 3 剂 + Hib 4 剂
      // 脊灰第 4 剂（4 岁 bOPV）不在五联里，仍需单独服
      { vaccine: 'dtap', doses: [1, 2, 3, 4] },
      { vaccine: 'polio', doses: [1, 2, 3] }
    ]
  },
  {
    from: 'hepai',
    name: '甲肝灭活疫苗',
    covers: [{ vaccine: 'hepa', doses: [1] }] // 甲肝灭活与减毒活二选一
  }
];

/**
 * 根据已记录，算出哪些规划表项被联合疫苗覆盖
 * @returns {Object} { 'polio#2': { by: '五联疫苗', dose: 2 } }
 */
function coverageFor(records) {
  const done = {};
  (records || []).forEach(function (r) {
    if (!done[r.vaccineId]) done[r.vaccineId] = {};
    done[r.vaccineId][r.dose] = true;
  });

  const map = {};
  COVER_RULES.forEach(function (rule) {
    const myDoses = done[rule.from];
    if (!myDoses) return;
    rule.covers.forEach(function (c) {
      c.doses.forEach(function (n) {
        if (!myDoses[n]) return;
        const key = c.vaccine + '#' + n;
        if (!map[key]) map[key] = { by: rule.name, from: rule.from, dose: n };
      });
    });
  });
  return map;
}

/* ---------------- 免疫规划对照 ---------------- */

/**
 * 按宝宝月龄对照免疫规划表
 * status:
 *   done 已记录 / covered 被联合疫苗覆盖 / hidden 手动移除
 *   overdue 过了建议月龄 / due 该打了 / soon 一个月内 / later 还早
 * @param {Array} hidden 可选，手动移除的 key 列表；不传则读本地存储
 * @param {String} today 可选，判断「待安排」的基准日
 */
function planFor(months, records, hidden, today) {
  const m = typeof months === 'number' && isFinite(months) ? months : 0;
  const t = today || dateUtil.todayStr();

  // 未来日期的记录只是计划，不能算已接种
  const real = (records || []).filter(function (r) {
    return !isPlanned(r, t);
  });

  const doneSet = {};
  real.forEach(function (r) {
    doneSet[r.vaccineId + '#' + r.dose] = true;
  });

  const hiddenList = hidden === undefined ? safeHidden() : hidden || [];
  const hiddenSet = {};
  hiddenList.forEach(function (k) {
    hiddenSet[k] = true;
  });

  const cover = coverageFor(real);

  // 一次读完疫苗表，避免 22 行各读一次存储
  const byId = {};
  allVaccines().forEach(function (v) {
    byId[v.id] = v;
  });

  return PLAN.map(function (p) {
    const v = byId[p.vaccine];
    const key = p.vaccine + '#' + p.dose;
    const done = !!doneSet[key];
    const covered = !!cover[key];
    const isHidden = !!hiddenSet[key];

    let status = 'later';
    if (done) status = 'done';
    else if (covered) status = 'covered';
    else if (isHidden) status = 'hidden';
    else if (m >= p.month) status = m - p.month >= 2 ? 'overdue' : 'due';
    else if (p.month - m <= 1) status = 'soon';

    return {
      key: key,
      vaccineId: p.vaccine,
      name: v ? v.name : p.vaccine,
      short: v ? v.short : p.vaccine,
      emoji: v ? v.emoji : '💉',
      dose: p.dose,
      doseText: doseText(p.dose),
      month: p.month,
      label: p.label,
      status: status,
      done: done,
      coveredBy: covered ? cover[key].by : '',
      hidden: isHidden
    };
  });
}

function safeHidden() {
  try {
    return store.getPlanHidden();
  } catch (e) {
    return [];
  }
}

/** 待接种 / 即将到期的（用于提醒卡片）；被覆盖和手动移除的不再提醒 */
function pendingFor(months, records, hidden, today) {
  const all = planFor(months, records, hidden, today);
  const due = all.filter(function (x) {
    return x.status === 'due' || x.status === 'overdue';
  });
  const soon = all.filter(function (x) {
    return x.status === 'soon';
  });
  // 同一月龄的合并展示，按建议月龄排序
  due.sort(function (a, b) {
    return a.month - b.month;
  });
  return { due: due, soon: soon, all: all };
}

/* ---------------- 列表摘要 ---------------- */

/** 接种记录按时间倒序，并附上护理摘要 */
function decorate(records, now) {
  return (records || [])
    .slice()
    .sort(function (a, b) {
      return tsOf(b) - tsOf(a);
    })
    .map(function (r) {
      const care = careFor(r, now);
      return {
        record: r,
        care: care
      };
    });
}

/** 最近一次接种（用于首页卡片） */
function latest(records, now) {
  const list = decorate(records, now);
  return list.length ? list[0] : null;
}

/**
 * 首页/疫苗页顶部要展示的一句话结论
 * 优先：正在观察期 → 展示护理；否则 → 提醒该打什么
 * 未来日期的「待安排」记录不参与护理判断
 */
function brief(records, months, now, today) {
  const t = today || dateUtil.todayStr();
  const real = (records || []).filter(function (r) {
    return !isPlanned(r, t);
  });

  const items = decorate(real, now);
  const active = items.filter(function (x) {
    return x.care.ok && !x.care.done;
  });

  if (active.length) {
    const c = active[0].care;
    return {
      type: 'care',
      tone: c.tone,
      title: c.vaccine.short + ' ' + c.doseText + ' · ' + c.phaseLabel,
      desc: c.sinceText + '，' + c.phaseTip,
      care: c,
      plan: pendingFor(months, real, undefined, t)
    };
  }

  const plan = pendingFor(months, real, undefined, t);
  if (plan.due.length) {
    // 最该关注的是「当前月龄刚到期」那一针，不是最早漏掉的那一针
    const latest = plan.due[plan.due.length - 1];
    const names = plan.due
      .slice(-3)
      .map(function (d) {
        return d.short;
      })
      .join('、');

    if (plan.due.length <= 3) {
      return {
        type: 'due',
        tone: 'due',
        title: '该打 ' + names + ' 了',
        desc:
          plan.due.length === 1
            ? latest.doseText + '，建议 ' + latest.label + '接种' + (latest.status === 'overdue' ? '（已过建议月龄）' : '')
            : '共 ' + plan.due.length + ' 针待接种，最近一针建议 ' + latest.label + '前完成',
        plan: plan,
        care: items.length ? items[0].care : null
      };
    }

    return {
      type: 'due',
      tone: 'due',
      title: '还有 ' + plan.due.length + ' 针没记录',
      desc: '按免疫规划表，' + names + ' 等该打了；以前打过的针可以回填，记录越全提醒越准',
      plan: plan,
      care: items.length ? items[0].care : null
    };
  }

  if (plan.soon.length) {
    const s = plan.soon[0];
    return {
      type: 'soon',
      tone: 'soon',
      title: '下个月要打 ' + s.short,
      desc: s.doseText + '，' + s.label + '接种',
      plan: plan,
      care: items.length ? items[0].care : null
    };
  }

  return {
    type: 'clear',
    tone: 'done',
    title: items.length ? '近期没有要打的疫苗' : '还没有接种记录',
    desc: items.length ? '对照免疫规划表，下一针还早' : '记录一次接种，之后会自动提醒护理要点',
    plan: plan,
    care: items.length ? items[0].care : null
  };
}

/** 已接种记录的汇总统计（待安排的不算） */
function stats(records, today) {
  const t = today || dateUtil.todayStr();
  const list = (records || []).filter(function (r) {
    return !isPlanned(r, t);
  });
  const freeCount = list.filter(function (r) {
    const v = getVaccine(r.vaccineId);
    return v && v.category === 'free';
  }).length;
  return {
    total: list.length,
    free: freeCount,
    paid: list.length - freeCount
  };
}

module.exports = {
  HOUR,
  DAY,
  listVaccines,
  getVaccine,
  allVaccines,
  normalizeCustom,
  doseCount,
  doseInfo,
  doseText,
  nextDose,
  toTs,
  tsOf,
  hoursSince,
  sinceText,
  phaseFor,
  isPlanned,
  splitRecords,
  plannedFor,
  careFor,
  COVER_RULES,
  coverageFor,
  planFor,
  pendingFor,
  decorate,
  latest,
  brief,
  stats
};
