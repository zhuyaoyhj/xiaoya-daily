// pages/record/record.js —— 「记录」tab：按天看喂奶 / 睡眠 / 尿布，外加辅食与接种入口
const store = require('../../utils/store.js');
const dateUtil = require('../../utils/date.js');
const care = require('../../utils/care.js');
const careActions = require('../../utils/care-actions.js');
const foodUtil = require('../../utils/food.js');
const timeline = require('../../utils/timeline.js');
const stats = require('../../utils/stats.js');
const chart = require('../../utils/chart.js');
const theme = require('../../utils/theme.js');
const sync = require('../../utils/sync.js');
const track = require('../../utils/track.js').track;

/** 7 天趋势可切换的指标 */
const METRICS = [
  { key: 'feeds', label: '喂奶', unit: '次' },
  { key: 'sleepMin', label: '睡眠', unit: '小时' },
  { key: 'diapers', label: '尿布', unit: '片' }
];

/** 5 个月起显示辅食入口：提前一个月让家长准备 */
const FOOD_ENTRY_FROM = 5;

Page(Object.assign({}, careActions.methods, {
  data: Object.assign({}, careActions.data, {
    hasBaby: false,
    babyName: '',
    months: 0,
    date: '',
    today: '',
    isToday: true,
    dateLabel: '',
    sum: null,
    filters: timeline.FILTERS,
    filter: 'all',
    counts: {},
    rows: [],
    total: 0,
    metrics: METRICS,
    metric: 'feeds',
    trendEmpty: true,
    weekly: null,
    showFood: false,
    foodText: ''
  }),

  onLoad(options) {
    this._date = (options && options.date) || '';
  },

  onShow() {
    this.load();
    this.startTick();
    // 加入了家庭同步就顺手拉一次，回来有新记录再刷新
    const that = this;
    sync.autoSync().then(function (r) {
      if (r && (r.added || r.updated || r.removed)) that.load();
    });
  },

  onReady() {
    this._ready = true;
    this.drawTrend();
  },

  onHide() {
    this.stopTick();
  },

  onUnload() {
    this.stopTick();
  },

  onPullDownRefresh() {
    this.load();
    wx.stopPullDownRefresh();
  },

  startTick() {
    this.stopTick();
    const that = this;
    this._timer = setInterval(function () {
      const a = that.data.careActive;
      if (a && (a.feed || a.sleep)) that.refreshCare();
    }, 30000);
  },

  stopTick() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  },

  load() {
    const baby = store.getActiveBaby();
    const today = dateUtil.todayStr();
    if (!baby) {
      this.setData({ hasBaby: false, today: today });
      return;
    }
    const age = dateUtil.babyAge(baby);
    const months = age.valid ? age.months : 0;
    const date = this._date && this._date <= today ? this._date : today;
    this._baby = baby;
    this.setData({
      hasBaby: true,
      babyName: baby.name || '宝宝',
      months: months,
      today: today,
      date: date
    });
    this.loadFood(baby, months);
    this.refreshCare();
    this.loadTrend();
  },

  /* ---------- 7 天趋势 + 上周小结 ---------- */

  loadTrend() {
    const baby = this._baby;
    if (!baby) return;
    const today = this.data.today;
    const now = Date.now();
    this._days = stats.lastDays(baby.id, today, this.data.months, 7, now);
    const any = this._days.some(function (d) {
      return d.feeds + d.sleepMin + d.diapers > 0;
    });
    const wk = stats.weekly(baby, today, this.data.months, now);
    const seen = store.getSettings().weeklySeen;
    this.setData({
      trendEmpty: !any,
      weekly: wk ? Object.assign({}, wk, { fresh: seen !== wk.key }) : null
    });
    this.drawTrend();
  },

  drawTrend() {
    if (!this._ready || !this._days || this.data.trendEmpty) return;
    const metric = this.data.metric;
    const data = stats.bars(this._days, metric, this.data.today);
    const band = stats.refBand(metric, this.data.months);
    const t = theme.colors();
    chart.withCanvas(this, '#trend-chart', function (ctx, size) {
      chart.drawBars(ctx, size, data, { bar: t['peach-soft'], barOn: t.brand, text: t['text-3'], grid: t.line, ref: t['ok-soft'] }, band);
    });
  },

  switchMetric(e) {
    this.setData({ metric: e.currentTarget.dataset.key });
    this.drawTrend();
  },

  /** 上周小结：点开后标记已看，生成卡片发家庭群 */
  openWeekly() {
    const wk = this.data.weekly;
    if (!wk) return;
    store.updateSettings({ weeklySeen: wk.key });
    this.setData({ 'weekly.fresh': false });
    track('weekly_open', {});
    wx.navigateTo({ url: '/pages/share/share?weekly=' + wk.key });
  },

  /** care-actions 回调 + 日期切换后都走这里 */
  refreshCare() {
    const baby = this._baby || store.getActiveBaby();
    if (!baby) return;
    const now = Date.now();
    const date = this.data.date;
    const from = care.dayStart(date);
    const entries = store.getCareRange(baby.id, from, from + care.DAY);
    const sum = care.summarize(entries, date, this.data.months, now);
    // 时间线：喂睡尿 + 辅食 + 接种 + 测量，一个口径
    const all = timeline.day(baby.id, date);
    const rows = timeline.filter(all, this.data.filter);

    this.setData({
      sum: sum,
      rows: rows,
      counts: timeline.counts(all),
      total: all.length,
      isToday: date === this.data.today,
      dateLabel: dayLabel(date, this.data.today),
      careActive: care.activeView(store.getCareActive(baby.id), now)
    });
  },

  loadFood(baby, months) {
    if (months < FOOD_ENTRY_FROM) {
      this.setData({ showFood: false });
      return;
    }
    let text = '';
    try {
      const today = dateUtil.todayStr();
      const brief = foodUtil.brief(store.getFoodRecords(baby.id), months, today, store.getFoodHidden(baby.id));
      text = brief.title;
    } catch (e) {
      text = '';
    }
    this.setData({
      showFood: true,
      foodText: months < 6 ? '下个月就能开始加辅食了，先看看怎么准备' : text || '今天吃什么、排敏进度'
    });
  },

  /* ---------- 交互 ---------- */

  prevDay() {
    this.setData({ date: dateUtil.shiftDate(this.data.date, -1) });
    this.refreshCare();
  },

  nextDay() {
    if (this.data.date >= this.data.today) return;
    this.setData({ date: dateUtil.shiftDate(this.data.date, 1) });
    this.refreshCare();
  },

  onPickDate(e) {
    this.setData({ date: e.detail.value });
    this.refreshCare();
  },

  backToday() {
    this.setData({ date: this.data.today });
    this.refreshCare();
  },

  switchFilter(e) {
    this.setData({ filter: e.currentTarget.dataset.key });
    this.refreshCare();
  },

  openRow(e) {
    const url = e.currentTarget.dataset.open;
    if (url) wx.navigateTo({ url: url });
  },

  /** 看过去某天时，补记默认落在那一天 */
  addPast(e) {
    const type = e.currentTarget.dataset.type;
    wx.navigateTo({ url: '/pages/care-edit/care-edit?type=' + type + '&date=' + this.data.date });
  },

  goFood() {
    wx.navigateTo({ url: '/pages/food/food' });
  },

  goMealLog() {
    wx.navigateTo({ url: '/pages/meal-log/meal-log' });
  },

  goVaccineEdit() {
    wx.navigateTo({ url: '/pages/vaccine-edit/vaccine-edit' });
  },

  goGrowth() {
    wx.navigateTo({ url: '/pages/growth/growth' });
  },

  goAddBaby() {
    wx.navigateTo({ url: '/pages/baby-edit/baby-edit' });
  }
}));

function dayLabel(date, today) {
  if (date === today) return '今天';
  if (date === dateUtil.shiftDate(today, -1)) return '昨天';
  const d = dateUtil.parseDate(date);
  return d.getMonth() + 1 + '月' + d.getDate() + '日 ' + dateUtil.weekdayCN(d);
}
