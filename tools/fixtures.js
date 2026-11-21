/**
 * tools/fixtures.js —— 测试用的日期构造，保证「什么时候跑都一样」
 *
 * 规则：测试里的「今天」用真实时间时，所有数据日期都必须相对今天构造，不能写死。
 * 反过来，写死日期的测试必须连「今天」一起固定（如 test-food 的 TODAY、test-vaccine 的 NOW）。
 * 用 `node tools/time-travel.js` 可以在多个日期下跑全部测试，验证没有日期依赖。
 */

function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

function fmt(d) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function todayMidnight() {
  const t = new Date();
  return new Date(t.getFullYear(), t.getMonth(), t.getDate());
}

/** 今天 + n 天（n 可为负） */
function daysFromToday(n) {
  const t = todayMidnight();
  t.setDate(t.getDate() + n);
  return fmt(t);
}

/**
 * 让宝宝「今天是 months 个月 days 天」的生日 —— 直接用产品里的 calcAge 反推，口径永远一致。
 * 月末附近有些「X 月 Y 天」本来就凑不出来（例如 3 月 1 日那天没有人是「1 个月 30 天」），
 * 这时取「月数对、天数最接近」的生日；测试只依赖月数时这样足够稳定。
 */
function birthdayForAge(months, days) {
  const calcAge = require('../utils/date.js').calcAge;
  const want = days || 0;
  const t = todayMidnight();
  let best = null;
  let bestGap = Infinity;
  // months 个月大约是 months*30.44 天，前后各留 40 天搜索
  const center = Math.round(months * 30.44) + want;
  for (let back = Math.max(0, center - 40); back <= center + 40; back++) {
    const d = new Date(t.getFullYear(), t.getMonth(), t.getDate() - back);
    const a = calcAge(fmt(d));
    if (!a.valid || a.months !== months) continue;
    const gap = Math.abs(a.days - want);
    if (gap < bestGap) {
      best = fmt(d);
      bestGap = gap;
      if (!gap) break;
    }
  }
  if (!best) throw new Error('birthdayForAge 找不到 ' + months + ' 个月的生日');
  return best;
}

/**
 * 校验用：按 utils/date.js 的口径算出来确实是 months 个月（days 天）。
 * 如果 days 太大跨进上一个月，直接报错，防止测试本身写错。
 */
function assertAge(calcAge, birthday, months, days) {
  const a = calcAge(birthday);
  if (a.months !== months || (days !== undefined && a.days !== days)) {
    throw new Error(
      'fixtures.birthdayForAge 构造失败：期望 ' + months + ' 个月 ' + days + ' 天，实际 ' + a.months + ' 个月 ' + a.days + ' 天'
    );
  }
  return birthday;
}

/**
 * app.json 里的全部页面：主包 pages + 各分包 root/pages。
 * 测试和静态检查都要用它，只读 app.pages 会漏掉分包页面
 */
function allPages(appJson) {
  const out = (appJson.pages || []).slice();
  (appJson.subPackages || appJson.subpackages || []).forEach(function (sp) {
    (sp.pages || []).forEach(function (p) {
      out.push(sp.root.replace(/\/$/, '') + '/' + p);
    });
  });
  return out;
}

module.exports = {
  allPages: allPages,
  pad: pad,
  fmt: fmt,
  daysFromToday: daysFromToday,
  birthdayForAge: birthdayForAge,
  assertAge: assertAge
};
