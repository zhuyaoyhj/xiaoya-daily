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

module.exports = {
  pad,
  parseDate,
  todayStr,
  calcAge,
  ageText,
  formatCN,
  weekdayCN,
  greeting
};
