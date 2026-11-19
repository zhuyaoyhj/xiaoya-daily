// pages/guide/guide.js —— 月龄建议
// 结构：月龄段切换条 → 本段要点（每类 1 条主建议）→ 分类详情（主建议 + 可展开细项）→ 要留意 → 下一阶段预告
const guideUtil = require('../../utils/guide.js');
const dateUtil = require('../../utils/date.js');
const store = require('../../utils/store.js');
const foodUtil = require('../../utils/food.js');
const vaccineUtil = require('../../utils/vaccine.js');

/** 每类默认露出几条细项，其余折叠 */
const PREVIEW = 2;

Page({
  data: {
    month: 0,
    label: '',
    tag: '',
    tab: 'all',
    tabs: [],
    visible: [],
    alerts: null,
    segments: [],
    segIndex: 0,
    isCurrent: true,
    currentMonth: 0,
    hasBaby: false,
    babyName: '',
    foodCard: null,
    showFood: false,
    nextSeg: null
  },

  onLoad(options) {
    const baby = store.getActiveBaby();
    const age = baby ? dateUtil.babyAge(baby) : null;
    const currentMonth = age && age.valid ? age.months : 0;
    let month = Number(options && options.month);
    if (options && options.month === undefined) month = currentMonth;
    if (isNaN(month) || month < 0) month = currentMonth;

    const segments = guideUtil.listSegments().map(function (s, i) {
      return { i: i, min: s.min, max: s.max, short: shortLabel(s), tag: s.tag };
    });

    this.setData({
      currentMonth: currentMonth,
      hasBaby: !!baby,
      babyName: baby ? baby.name : '',
      segments: segments
    });
    this.loadFoodCard();
    this.render(month, (options && options.tab) || 'all');
  },

  onShow() {
    // 从辅食页返回后，摘要要跟着更新
    this.loadFoodCard();
  },

  /** 辅食摘要：按宝宝真实月龄算，不跟页面的月龄切换 */
  loadFoodCard() {
    const baby = store.getActiveBaby();
    if (!baby) {
      this.setData({ foodCard: null });
      return;
    }

    const today = dateUtil.todayStr();
    const age = dateUtil.babyAge(baby);
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
    this.updateShowFood();
  },

  /** 辅食卡只在「全部 / 吃」且看的是宝宝自己的月龄段时出现，避免翻到 2 个月时还提示加肉泥 */
  updateShowFood() {
    const d = this.data;
    const sameSeg =
      guideUtil.getGuideByMonth(d.month).min === guideUtil.getGuideByMonth(d.currentMonth).min;
    this.setData({ showFood: !!d.foodCard && sameSeg && (d.tab === 'all' || d.tab === 'eat') });
  },

  render(month, tab) {
    const m = guideUtil.clampMonth(month);
    const guide = guideUtil.getGuideByMonth(m);
    const all = guideUtil.getSections(m);

    const toView = function (s) {
      const items = s.items || [];
      return Object.assign({}, s, {
        lead: items[0] || '',
        rows: items.slice(1).map(function (t, i) {
          return { k: s.key + '-' + i, t: t, color: s.color, show: i < PREVIEW };
        }),
        open: false,
        more: Math.max(0, items.length - 1 - PREVIEW)
      });
    };

    const sections = all
      .filter(function (s) {
        return s.key !== 'alerts';
      })
      .map(toView);
    const alertSec = all.filter(function (s) {
      return s.key === 'alerts';
    })[0];

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

    // 下一阶段预告：提前准备不慌张
    const segs = guideUtil.listSegments();
    let segIndex = 0;
    for (let i = 0; i < segs.length; i++) {
      if (segs[i].min === guide.min) segIndex = i;
    }
    let nextSeg = null;
    if (segIndex < segs.length - 1) {
      const ng = guideUtil.getGuideByMonth(segs[segIndex + 1].min);
      nextSeg = {
        month: ng.min,
        label: ng.label,
        tag: ng.tag,
        points: ['eat', 'move']
          .map(function (k) {
            return ng[k] && ng[k].title ? ng[k].title : '';
          })
          .filter(Boolean)
      };
    }

    this.setData({
      month: m,
      label: guide.label,
      tag: guide.tag,
      tab: tab,
      tabs: tabs,
      visible: visible,
      alerts: alertSec && alertSec.items.length && tab === 'all' ? alertSec : null,
      segIndex: segIndex,
      nextSeg: nextSeg,
      isCurrent: guide.min === guideUtil.getGuideByMonth(this.data.currentMonth).min,
    });
    this.updateShowFood();
  },

  /* ---------- 切换 ---------- */

  /** 箭头按「段」走：段内逐月切换内容不变，会让人以为没点上 */
  prevMonth() {
    const i = this.data.segIndex;
    if (i <= 0) return;
    this.render(this.data.segments[i - 1].min, this.data.tab);
  },

  nextMonth() {
    const i = this.data.segIndex;
    if (i >= this.data.segments.length - 1) return;
    this.render(this.data.segments[i + 1].min, this.data.tab);
  },

  pickSeg(e) {
    const i = Number(e.currentTarget.dataset.i);
    const s = this.data.segments[i];
    if (!s) return;
    // 选回宝宝所在的段时，落在宝宝的真实月龄上
    const cur = this.data.currentMonth;
    this.render(cur >= s.min && cur <= s.max ? cur : s.min, this.data.tab);
  },

  goNext() {
    if (this.data.nextSeg) this.render(this.data.nextSeg.month, this.data.tab);
  },

  switchTab(e) {
    const key = e.currentTarget.dataset.key;
    this.render(this.data.month, key);
  },

  /** 展开 / 收起某一类的细项：只改这一类，不影响其他已展开的 */
  toggleMore(e) {
    const key = e.currentTarget.dataset.key;
    const visible = this.data.visible.map(function (s) {
      if (s.key !== key) return s;
      const open = !s.open;
      return Object.assign({}, s, {
        open: open,
        rows: s.rows.map(function (r, i) {
          return Object.assign({}, r, { show: open || i < PREVIEW });
        })
      });
    });
    this.setData({ visible: visible });
  },

  backToCurrent() {
    this.render(this.data.currentMonth, this.data.tab);
  },

  /* ---------- 跳转 ---------- */

  goFood() {
    wx.navigateTo({ url: '/pages/food/food' });
  },

  goAddBaby() {
    wx.navigateTo({ url: '/pages/baby-edit/baby-edit' });
  },

  goShare() {
    wx.navigateTo({ url: '/pages/share/share?month=' + this.data.month });
  },

  /** 分享落到这一页、这个月龄段，家人点开就是同一份建议 */
  onShareAppMessage() {
    return {
      title: this.data.label + '（' + this.data.tag + '）宝宝怎么吃、怎么动、怎么睡',
      path: '/pages/guide/guide?month=' + this.data.month + '&tab=all'
    };
  },

  onShareTimeline() {
    return {
      title: this.data.label + '宝宝照护要点 · 小芽日常',
      query: 'month=' + this.data.month
    };
  }
});

/** 段切换条上的短标签：「0-1 个月」→「0-1月」 */
function shortLabel(s) {
  return s.min === s.max ? s.min + '月' : s.min + '-' + s.max + '月';
}
