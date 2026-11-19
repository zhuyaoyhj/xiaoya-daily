// pages/record/record.js —— 「记录」tab：按天看喂奶 / 睡眠 / 尿布，外加辅食与接种入口
const store = require('../../utils/store.js');
const dateUtil = require('../../utils/date.js');
const care = require('../../utils/care.js');
const careActions = require('../../utils/care-actions.js');
const foodUtil = require('../../utils/food.js');

/** 时间线筛选 */
const FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'feed', label: '喂奶' },
  { key: 'sleep', label: '睡眠' },
  { key: 'diaper', label: '尿布' }
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
    filters: FILTERS,
    filter: 'all',
    rows: [],
    total: 0,
    showFood: false,
    foodText: ''
  }),

  onLoad(options) {
    this._date = (options && options.date) || '';
  },

  onShow() {
    this.load();
    this.startTick();
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
    const filter = this.data.filter;

    const rows = entries
      .filter(function (e) {
        return filter === 'all' || e.type === filter;
      })
      .map(function (e) {
        return care.describe(e, date);
      });

    this.setData({
      sum: sum,
      rows: rows,
      total: entries.length,
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
    wx.navigateTo({ url: '/pages/care-edit/care-edit?id=' + e.currentTarget.dataset.id });
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
