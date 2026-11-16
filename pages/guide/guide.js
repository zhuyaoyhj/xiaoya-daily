// pages/guide/guide.js
const guideUtil = require('../../utils/guide.js');
const dateUtil = require('../../utils/date.js');
const store = require('../../utils/store.js');
const foodUtil = require('../../utils/food.js');
const vaccineUtil = require('../../utils/vaccine.js');

Page({
  data: {
    month: 0,
    label: '',
    tag: '',
    tab: 'all',
    tabs: [],
    visible: [],
    isCurrent: true,
    currentMonth: 0,
    babyName: '',
    foodCard: null
  },

  onLoad(options) {
    const baby = store.getActiveBaby();
    const currentMonth = baby ? dateUtil.calcAge(baby.birthday).months : 0;
    let month = Number(options && options.month);
    if (isNaN(month) || month < 0) month = currentMonth;

    this.setData({
      currentMonth: currentMonth,
      babyName: baby ? baby.name : ''
    });
    this.loadFoodCard();
    this.render(month, (options && options.tab) || 'all');
  },

  /** 吃 tab 顶部的辅食摘要，按宝宝真实月龄算，不跟页面的月龄切换 */
  loadFoodCard() {
    const baby = store.getActiveBaby();
    if (!baby) {
      this.setData({ foodCard: null });
      return;
    }

    const today = dateUtil.todayStr();
    const age = dateUtil.calcAge(baby.birthday);
    const months = age.valid ? age.months : 0;
    const records = store.getFoodRecords(baby.id);
    const hidden = store.getFoodHidden(baby.id);
    const brief = foodUtil.brief(records, months, today, hidden);
    const stats = foodUtil.stats(records, months, today);
    const focus = months >= 6 ? foodUtil.focusFor(months) : null;

    let todayText = '';
    if (months >= 6) {
      const swaps = store.getMenuSwap(baby.id);
      // 接种期约束与辅食页同口径，否则首页摘要和辅食页会今天两样菜
      const dietFlag = vaccineUtil.dietFlagFor(store.getVaccineRecords(baby.id), Date.now(), today);
      const opts = foodUtil.normalizeOpts({ diet: dietFlag.active ? dietFlag.level : 'none' });
      const day = foodUtil.dayMenuFor(months, baby.id, today, swaps, today, records, opts);
      const names = [];
      day.meals.forEach(function (m) {
        if (m.recipe) names.push(m.recipe.name);
      });
      todayText = names.slice(0, 2).join('、');
    }

    this.setData({
      foodCard: {
        tone: brief.tone,
        title: brief.title,
        desc: brief.desc,
        stageLabel: foodUtil.monthLabel(months),
        focusTitle: focus ? focus.title : '',
        focusKey: focus ? focus.key : '',
        tried: stats.tried,
        todayText: todayText
      }
    });
  },

  goFood() {
    wx.navigateTo({ url: '/pages/food/food' });
  },

  onShow() {
    // 从辅食页返回后，摘要要跟着更新
    this.loadFoodCard();
  },

  render(month, tab) {
    const m = guideUtil.clampMonth(month);
    const guide = guideUtil.getGuideByMonth(m);
    const sections = guideUtil.getSections(m).map(function (s) {
      const rows = (s.items || []).map(function (t, i) {
        return { k: s.key + '-' + i, t: t };
      });
      return Object.assign({}, s, { rows: rows });
    });

    const tabs = [{ key: 'all', title: '全部', emoji: '✨' }].concat(
      sections.map(function (s) {
        return { key: s.key, title: s.title, emoji: s.emoji };
      })
    );

    let visible = sections;
    if (tab !== 'all') {
      visible = sections.filter(function (s) {
        return s.key === tab;
      });
      if (!visible.length) {
        visible = sections;
        tab = 'all';
      }
    }

    this.setData({
      month: m,
      label: guide.label,
      tag: guide.tag,
      tab: tab,
      tabs: tabs,
      visible: visible,
      isCurrent: m === this.data.currentMonth
    });
  },

  prevMonth() {
    if (this.data.month <= 0) return;
    this.render(this.data.month - 1, this.data.tab);
  },

  nextMonth() {
    if (this.data.month >= 36) return;
    this.render(this.data.month + 1, this.data.tab);
  },

  switchTab(e) {
    const key = e.currentTarget.dataset.key;
    this.render(this.data.month, key);
  },

  backToCurrent() {
    this.render(this.data.currentMonth, this.data.tab);
  },

  goShare() {
    wx.navigateTo({ url: '/pages/share/share?month=' + this.data.month });
  },

  onShareAppMessage() {
    return {
      title: this.data.label + '宝宝的日常照护建议',
      path: '/pages/index/index'
    };
  }
});
