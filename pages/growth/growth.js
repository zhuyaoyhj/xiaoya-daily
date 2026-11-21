// pages/growth/growth.js —— 生长曲线：记录每次测量，对照 WHO 百分位
const store = require('../../utils/store.js');
const dateUtil = require('../../utils/date.js');
const growth = require('./growth-calc.js'); // 生长曲线计算与 WHO 数据只这一页用，放在分包里
const chart = require('../../utils/chart.js');
const theme = require('../../utils/theme.js');

const KINDS = [
  { key: 'weight', label: '体重' },
  { key: 'height', label: '身高' }
];

Page({
  data: {
    hasBaby: false,
    babyName: '',
    kinds: KINDS,
    kind: 'weight',
    latest: null,
    list: [],
    empty: true,
    outOfRange: false,
    sexAssumed: false,
    corrected: false,
    // 录入浮层
    sheet: false,
    editId: '',
    form: { date: '', weight: '', height: '', note: '' },
    today: '',
    minDate: ''
  },

  onShow() {
    this.load();
  },

  onReady() {
    this._ready = true;
    this.draw();
  },

  load() {
    const baby = store.getActiveBaby();
    if (!baby) {
      this.setData({ hasBaby: false });
      return;
    }
    store.migrateGrowth(baby.id);
    this._baby = baby;
    const records = store.getGrowth(baby.id);
    const d = growth.chartData(baby, records, this.data.kind);
    this._chart = d;
    const age = dateUtil.calcAge(baby.birthday);
    const list = records
      .slice()
      .reverse()
      .map(function (r) {
        const m = growth.monthsBetween(baby.birthday, r.date);
        const parts = [];
        if (r.weight !== null && r.weight !== undefined) parts.push(r.weight + ' kg');
        if (r.height !== null && r.height !== undefined) parts.push(r.height + ' cm');
        return {
          id: r.id,
          date: r.date,
          ageText: m < 1 ? Math.round(m * 30.4) + ' 天' : Math.floor(m) + ' 个月',
          value: parts.join(' · '),
          by: r.by || '',
          note: r.note || ''
        };
      });
    this.setData({
      hasBaby: true,
      babyName: baby.name || '宝宝',
      latest: d.latest
        ? { text: d.latest.text, band: d.latest.band, value: d.latest.v + ' ' + d.unit, date: d.latest.date }
        : null,
      list: list,
      empty: !d.points.length,
      outOfRange: age.valid && age.months > 36,
      sexAssumed: d.sexAssumed,
      corrected: d.corrected,
      today: dateUtil.todayStr(),
      minDate: baby.birthday
    });
    this.draw();
  },

  draw() {
    if (!this._ready || !this._chart) return;
    const d = this._chart;
    const t = theme.colors();
    chart.withCanvas(this, '#growth-chart', function (ctx, size) {
      chart.drawGrowth(ctx, size, d, {
        band: t['ok-soft'],
        mid: t.ok,
        line: t['line-strong'],
        grid: t.line,
        text: t['text-4'],
        dot: t.brand,
        dotStroke: t.card
      });
    });
  },

  goBaby() {
    wx.navigateTo({ url: '/pages/baby-edit/baby-edit?id=' + this._baby.id });
  },

  switchKind(e) {
    this.setData({ kind: e.currentTarget.dataset.key });
    this.load();
  },

  /* ---------- 录入 ---------- */

  openAdd() {
    this.setData({
      sheet: true,
      editId: '',
      form: { date: dateUtil.todayStr(), weight: '', height: '', note: '' }
    });
  },

  openEdit(e) {
    const id = e.currentTarget.dataset.id;
    const r = store.getAllGrowth().filter(function (g) {
      return g.id === id;
    })[0];
    if (!r) return;
    this.setData({
      sheet: true,
      editId: id,
      form: {
        date: r.date,
        weight: r.weight === null || r.weight === undefined ? '' : String(r.weight),
        height: r.height === null || r.height === undefined ? '' : String(r.height),
        note: r.note || ''
      }
    });
  },

  closeSheet() {
    this.setData({ sheet: false });
  },

  onDate(e) {
    this.setData({ 'form.date': e.detail.value });
  },
  onWeight(e) {
    this.setData({ 'form.weight': e.detail.value });
  },
  onHeight(e) {
    this.setData({ 'form.height': e.detail.value });
  },
  onNote(e) {
    this.setData({ 'form.note': e.detail.value });
  },

  save() {
    const f = this.data.form;
    try {
      store.upsertGrowth({
        id: this.data.editId || undefined,
        babyId: this._baby.id,
        date: f.date,
        weight: String(f.weight || '').trim(),
        height: String(f.height || '').trim(),
        note: f.note
      });
    } catch (e) {
      const msg = {
        EMPTY: '体重和身高至少填一个',
        BAD_WEIGHT: '体重填 1~40 kg 之间',
        BAD_HEIGHT: '身高填 30~130 cm 之间',
        BAD_DATE: '选一下测量日期'
      }[e.message];
      wx.showToast({ title: msg || '没保存成功', icon: 'none' });
      return;
    }
    this.setData({ sheet: false });
    wx.showToast({ title: this.data.editId ? '已更新' : '已记录', icon: 'success' });
    this.load();
  },

  remove() {
    const that = this;
    wx.showModal({
      title: '删除这次测量？',
      confirmText: '删除',
      confirmColor: '#C43C2A',
      success: function (r) {
        if (!r.confirm) return;
        store.removeGrowth(that.data.editId);
        that.setData({ sheet: false });
        that.load();
      }
    });
  },

  noop() {}
});
