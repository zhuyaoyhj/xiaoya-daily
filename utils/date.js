// utils/date.js —— 日期与月龄计算

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

function parseDate(str) {
  if (!str) return null;
  const parts = String(str).split('-').map(Number);
  if (parts.length < 3 || !parts[0] || !parts[1] || !parts[2]) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

/**
 * 计算月龄：返回 { totalDays, months, days, weeks }
 * 以「生日当天」为整月锚点，处理月末天数差异
 */
function calcAge(birthdayStr, nowDate) {
  const b = parseDate(birthdayStr);
  if (!b) return { totalDays: 0, months: 0, days: 0, weeks: 0, valid: false };

  const now = nowDate ? new Date(nowDate) : new Date();
  const bDay = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  const tDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const totalDays = Math.round((tDay.getTime() - bDay.getTime()) / 86400000);
  if (totalDays < 0) {
    return { totalDays: 0, months: 0, days: 0, weeks: 0, valid: false, future: true };
  }

  let months = (tDay.getFullYear() - bDay.getFullYear()) * 12 + (tDay.getMonth() - bDay.getMonth());
  if (tDay.getDate() < bDay.getDate()) months -= 1;
  months = Math.max(months, 0);

  let anchor = new Date(bDay.getFullYear(), bDay.getMonth() + months, bDay.getDate());
  if (anchor.getTime() > tDay.getTime()) {
    months = Math.max(months - 1, 0);
    anchor = new Date(bDay.getFullYear(), bDay.getMonth() + months, bDay.getDate());
  }
  const days = Math.round((tDay.getTime() - anchor.getTime()) / 86400000);

  return { totalDays, months, days, weeks: Math.floor(totalDays / 7), valid: true };
}

/** 月龄文案：0 个月显示天数，满月后显示「X 个月 Y 天」 */
function ageText(age) {
  if (!age || !age.valid) return age && age.future ? '还没出生' : '';
  if (age.months === 0) return age.totalDays + ' 天';
  if (age.days === 0) return age.months + ' 个月';
  return age.months + ' 个月 ' + age.days + ' 天';
}

/** 「11 月 8 日 周六」 */
function formatCN(date) {
  const d = date ? new Date(date) : new Date();
  return d.getMonth() + 1 + ' 月 ' + d.getDate() + ' 日 ' + WEEK[d.getDay()];
}

function weekdayCN(date) {
  const d = date ? new Date(date) : new Date();
  return WEEK[d.getDay()];
}

/** 根据小时返回问候语 */
function greeting() {
  const h = new Date().getHours();
  if (h < 6) return '夜深了';
  if (h < 9) return '早上好';
  if (h < 12) return '上午好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

/**
 * 两个日期相差的天数（to 缺省为今天），正数表示 to 在 from 之后
 * 按 Y/M/D 归零后相减，避免夏令时与时分秒影响
 * 任一日期非法返回 0
 */
function diffDays(fromStr, toStr) {
  const a = parseDate(fromStr);
  if (!a) return 0;
  const b = toStr ? parseDate(toStr) : new Date();
  if (!b) return 0;
  const a0 = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const b0 = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((b0.getTime() - a0.getTime()) / 86400000);
}

/** 往日期上加/减天数，返回 'YYYY-MM-DD' */
function shiftDate(dateStr, delta) {
  const d = dateStr ? parseDate(dateStr) : new Date();
  if (!d) return '';
  d.setDate(d.getDate() + Number(delta || 0));
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

/** 本周周一（weekStart=1 表示周一），返回 'YYYY-MM-DD' */
function weekStartStr(dateStr) {
  const d = dateStr ? parseDate(dateStr) : new Date();
  if (!d) return '';
  const base = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = base.getDay(); // 0=周日
  const back = day === 0 ? 6 : day - 1; // 回退到周一
  base.setDate(base.getDate() - back);
  return base.getFullYear() + '-' + pad(base.getMonth() + 1) + '-' + pad(base.getDate());
}

/** 日期所在的自然月 1-12；非法输入返回 0。只认数字，不带季节语义 */
function monthNumber(dateStr) {
  const d = parseDate(dateStr);
  if (!d) return 0;
  return d.getMonth() + 1;
}

module.exports = {
  pad,
  parseDate,
  todayStr,
  calcAge,
  ageText,
  formatCN,
  weekdayCN,
  greeting,
  diffDays,
  shiftDate,
  weekStartStr,
  monthNumber
};
