/**
 * tools/clock.js —— 把「现在」挪到指定时间，用来检查测试是否依赖运行日期
 * 用法：XYD_NOW=2027-03-01T09:30 node -r ./tools/clock.js tools/test-pages.js
 *
 * 只平移不冻结：时间仍然正常流逝（setTimeout、耗时计算不受影响），只是起点换了。
 * 不设 XYD_NOW 时什么都不做。
 */
const target = process.env.XYD_NOW;

if (target) {
  const RealDate = Date;
  const parsed = new RealDate(target).getTime();
  if (isNaN(parsed)) throw new Error('XYD_NOW 不是合法时间：' + target);
  const offset = parsed - RealDate.now();

  class ShiftedDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(RealDate.now() + offset);
      else super(...args);
    }
    static now() {
      return RealDate.now() + offset;
    }
  }
  ShiftedDate.parse = RealDate.parse;
  ShiftedDate.UTC = RealDate.UTC;
  global.Date = ShiftedDate;
}
