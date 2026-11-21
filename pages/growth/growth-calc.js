// pages/growth/growth-calc.js —— 生长曲线：百分位计算与曲线数据（纯函数）
const W = require('./who-lms.js');
const dateUtil = require('../../utils/date.js');

const CORRECT_UNTIL = 24; // 和 dateUtil.babyAge 同一口径：实际满 24 个月后不再矫正

/**
 * 某次测量对应的「画图月龄」：早产宝宝在实际 24 月龄前用矫正月龄（从预产期算），
 * 否则用实际月龄。全站发育类口径一致，避免早产宝宝被画成「偏小」
 */
function plotMonths(baby, date) {
  const actual = monthsBetween(baby.birthday, date);
  if (dateUtil.pretermDays(baby) && actual < CORRECT_UNTIL) {
    return Math.max(0, monthsBetween(baby.dueDate, date));
  }
  return actual;
}

const DAY_PER_MONTH = 30.4375;

/** 标准正态分布累积函数（Abramowitz-Stegun 7.1.26，误差 < 1.5e-7） */
function normCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  if (z > 0) p = 1 - p;
  return p;
}

function tableOf(sex, kind) {
  return W[(sex === 'girl' ? 'girl' : 'boy') + '_' + (kind === 'height' ? 'length' : 'weight')];
}

/** 某月龄（可带小数）的 LMS，在相邻整月之间线性插值 */
function lmsAt(sex, kind, months) {
  const t = tableOf(sex, kind);
  const m = Math.max(0, Math.min(W.maxMonth, months));
  const i = Math.floor(m);
  if (i >= W.maxMonth) return t[W.maxMonth];
  const f = m - i;
  return [0, 1, 2].map(function (k) {
    return t[i][k] + (t[i + 1][k] - t[i][k]) * f;
  });
}

function zScore(x, lms) {
  const L = lms[0];
  const M = lms[1];
  const S = lms[2];
  if (Math.abs(L) < 1e-6) return Math.log(x / M) / S;
  return (Math.pow(x / M, L) - 1) / (L * S);
}

/** 给定 Z 反推测量值（画曲线用） */
function valueAtZ(z, lms) {
  const L = lms[0];
  const M = lms[1];
  const S = lms[2];
  if (Math.abs(L) < 1e-6) return M * Math.exp(S * z);
  return M * Math.pow(1 + L * S * z, 1 / L);
}

/** 出生到测量日的月龄（带小数），按天算，口径同 WHO */
function monthsBetween(birthday, date) {
  const p = function (s) {
    const a = String(s).split('-').map(Number);
    return Date.UTC(a[0], a[1] - 1, a[2]);
  };
  return (p(date) - p(birthday)) / 86400000 / DAY_PER_MONTH;
}

/**
 * 一次测量的百分位
 * @return { z, pct: 0-100 的整数, band: 'low'|'mid'|'high', text } 或 null（超出 0-36 月）
 */
function percentile(sex, kind, months, value) {
  if (!(value > 0) || months < 0 || months > W.maxMonth) return null;
  const z = zScore(value, lmsAt(sex, kind, months));
  const raw = normCdf(z) * 100;
  const pct = raw < 1 ? '<1' : raw > 99 ? '>99' : Math.round(raw);
  // 只描述位置，不下结论；P3 以下 / P97 以上建议带着曲线问儿保医生
  let band = 'mid';
  if (raw < 3) band = 'low';
  else if (raw > 97) band = 'high';
  const name = kind === 'height' ? '身高' : '体重';
  let text = name + '大约在同龄宝宝的第 ' + pct + ' 百分位';
  if (band === 'low') text += '，偏小一些，下次体检可以带着曲线问问医生';
  else if (band === 'high') text += '，偏大一些，下次体检可以带着曲线问问医生';
  return { z: z, pct: pct, raw: raw, band: band, text: text };
}

const CURVE_PCTS = [3, 15, 50, 85, 97];
const Z_OF = { 3: -1.8808, 15: -1.0364, 50: 0, 85: 1.0364, 97: 1.8808 };

/** 参考曲线：fromMonth 到 toMonth 每月一个点 */
function curves(sex, kind, fromMonth, toMonth) {
  const out = {};
  CURVE_PCTS.forEach(function (p) {
    const pts = [];
    for (let m = Math.max(0, fromMonth); m <= Math.min(W.maxMonth, toMonth); m++) {
      pts.push({ m: m, v: valueAtZ(Z_OF[p], lmsAt(sex, kind, m)) });
    }
    out[p] = pts;
  });
  return out;
}

/**
 * 页面要的一切：曲线、宝宝的点、最新一次的百分位、窗口范围
 * 窗口：从 0 开始，到「最大测量月龄 + 3」与 12 取大，最多 36
 */
function chartData(baby, records, kind) {
  const sex = baby.gender === 'girl' ? 'girl' : 'boy';
  const pts = [];
  (records || []).forEach(function (r) {
    const v = kind === 'height' ? r.height : r.weight;
    if (v === null || v === undefined || v === '') return;
    if (monthsBetween(baby.birthday, r.date) < 0) return;
    const m = plotMonths(baby, r.date);
    if (m > W.maxMonth) return;
    pts.push({ id: r.id, m: m, v: Number(v), date: r.date, by: r.by || '' });
  });
  pts.sort(function (a, b) {
    return a.m - b.m;
  });
  const maxM = pts.length ? pts[pts.length - 1].m : 0;
  const to = Math.min(W.maxMonth, Math.max(12, Math.ceil(maxM) + 3));
  const cv = curves(sex, kind, 0, to);
  let lo = Infinity;
  let hi = -Infinity;
  cv[3].concat(cv[97], pts).forEach(function (p) {
    lo = Math.min(lo, p.v);
    hi = Math.max(hi, p.v);
  });
  const last = pts.length ? pts[pts.length - 1] : null;
  return {
    sex: sex,
    // 没填性别时按男孩曲线画（男女差异在 0-3 岁不大，但要让用户知道）
    sexAssumed: baby.gender !== 'girl' && baby.gender !== 'boy',
    corrected: !!dateUtil.pretermDays(baby),
    kind: kind,
    unit: kind === 'height' ? 'cm' : 'kg',
    fromMonth: 0,
    toMonth: to,
    min: Math.floor(lo),
    max: Math.ceil(hi),
    curves: cv,
    points: pts,
    latest: last ? Object.assign({}, last, percentile(sex, kind, last.m, last.v)) : null
  };
}

module.exports = {
  CURVE_PCTS: CURVE_PCTS,
  normCdf: normCdf,
  lmsAt: lmsAt,
  zScore: zScore,
  valueAtZ: valueAtZ,
  monthsBetween: monthsBetween,
  plotMonths: plotMonths,
  percentile: percentile,
  curves: curves,
  chartData: chartData
};
