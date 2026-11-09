// pages/guide/guide.js
const guideUtil = require('../../utils/guide.js');
const dateUtil = require('../../utils/date.js');
const store = require('../../utils/store.js');

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
    babyName: ''
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
    this.render(month, (options && options.tab) || 'all');
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
