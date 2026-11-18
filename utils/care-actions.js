// utils/care-actions.js —— 喂奶 / 睡眠 / 尿布的记录动作，首页和「记录」页共用
// 用法：Page(Object.assign({}, careActions.methods, { data: Object.assign({}, careActions.data, {...}), ... }))
// 页面需要实现 refreshCare()：动作完成后刷新自己的展示
//
// 设计约束：
// - 只存开始时间，时长每次打开现算 —— 切后台、锁屏、杀进程都不丢
// - 同一时间只允许一个喂奶、一个睡眠在计时
// - 计时过久（喂奶 90 分钟 / 睡眠 8 小时）视为忘了点结束，结束时让用户确认时间

const store = require('./store.js');
const care = require('./care.js');

const BOTTLE_ML = require('../data/care.js').BOTTLE_ML;

const data = {
  // 记录面板：'' | 'feed' | 'bottle' | 'diaper' | 'poop'
  carePanel: '',
  careBottleMl: BOTTLE_ML,
  careBottleTypes: care.BOTTLE_TYPES,
  careBottleType: 'formula',
  careBottleInput: '',
  careDiaperKinds: care.DIAPER_KINDS,
  carePoopColors: care.POOP_COLORS,
  carePoopTextures: care.POOP_TEXTURES,
  carePendingDiaper: null,
  careActive: {}
};

function babyIdOf(page) {
  const b = store.getActiveBaby();
  if (!b) {
    wx.showToast({ title: '先添加宝宝', icon: 'none' });
    return '';
  }
  return b.id;
}

function now() {
  return Date.now();
}

const methods = {
  /* ---------- 面板开关 ---------- */

  openCarePanel(e) {
    const type = e.currentTarget.dataset.type;
    if (!babyIdOf(this)) return;
    // 正在喂 / 正在睡时，点同一个按钮就是「结束」，不再弹面板
    const active = store.getCareActive(store.getActiveBaby().id);
    if (type === 'feed' && active.feed) return this.endFeed();
    if (type === 'sleep') return active.sleep ? this.endSleep() : this.startSleep();
    this.setData({ carePanel: type, carePendingDiaper: null, careBottleInput: '' });
  },

  closeCarePanel() {
    this.setData({ carePanel: '', carePendingDiaper: null });
  },

  /** 面板内部点击不冒泡到遮罩 */
  careNoop() {},

  /* ---------- 喂奶 ---------- */

  startFeed(e) {
    const babyId = babyIdOf(this);
    if (!babyId) return;
    const side = e.currentTarget.dataset.side;
    const t = now();
    store.setCareActive(babyId, 'feed', { side: side, start: t, sideStart: t, leftMs: 0, rightMs: 0 });
    this.setData({ carePanel: '' });
    wx.showToast({ title: '开始计时 · ' + (side === 'left' ? '左侧' : '右侧'), icon: 'none' });
    this.refreshCare();
  },

  switchFeedSide() {
    const babyId = babyIdOf(this);
    const active = babyId && store.getCareActive(babyId).feed;
    if (!active) return;
    const next = care.switchSide(active, now());
    store.setCareActive(babyId, 'feed', next);
    wx.showToast({ title: '换到' + (next.side === 'left' ? '左侧' : '右侧'), icon: 'none' });
    this.refreshCare();
  },

  endFeed() {
    const babyId = babyIdOf(this);
    const active = babyId && store.getCareActive(babyId).feed;
    if (!active) return;
    const that = this;
    const finish = function (endTs) {
      const rec = care.finishFeed(active, endTs, babyId);
      store.setCareActive(babyId, 'feed', null);
      // 不到 1 分钟多半是误点，不留记录
      if (rec.leftMin + rec.rightMin < 1) {
        wx.showToast({ title: '不到 1 分钟，没有记录', icon: 'none' });
      } else {
        store.upsertCare(rec);
        wx.showToast({ title: '已记录 · ' + (rec.leftMin + rec.rightMin) + ' 分钟', icon: 'none' });
      }
      that.refreshCare();
    };
    const t = now();
    if (care.activeView({ feed: active }, t).feed.stale) {
      const guess = care.suggestEnd('feed', active.start);
      wx.showModal({
        title: '是不是忘了点结束？',
        content: '从 ' + care.hm(active.start) + ' 开始已经 ' + care.durText(t - active.start) + '。按 ' + care.hm(guess) + ' 结束记录吗？',
        confirmText: '按' + care.hm(guess),
        cancelText: '按现在',
        confirmColor: '#E0795A',
        success: function (r) {
          finish(r.confirm ? guess : t);
        }
      });
      return;
    }
    finish(t);
  },

  cancelFeed() {
    const babyId = babyIdOf(this);
    if (!babyId) return;
    store.setCareActive(babyId, 'feed', null);
    this.refreshCare();
  },

  /* 瓶喂：选量就记，一步到位 */

  pickBottleType(e) {
    this.setData({ careBottleType: e.currentTarget.dataset.key });
  },

  onBottleInput(e) {
    this.setData({ careBottleInput: e.detail.value });
  },

  logBottle(e) {
    const babyId = babyIdOf(this);
    if (!babyId) return;
    const raw = e.currentTarget.dataset.ml !== undefined ? e.currentTarget.dataset.ml : this.data.careBottleInput;
    const ml = Math.round(Number(raw));
    if (!(ml >= 5 && ml <= 400)) {
      wx.showToast({ title: '奶量填 5~400 ml', icon: 'none' });
      return;
    }
    const t = now();
    store.upsertCare({ babyId: babyId, type: 'feed', side: 'bottle', bottleType: this.data.careBottleType, ml: ml, start: t, end: t });
    this.setData({ carePanel: '' });
    wx.showToast({ title: '已记录 ' + ml + 'ml', icon: 'none' });
    this.refreshCare();
  },

  /* ---------- 睡眠 ---------- */

  startSleep() {
    const babyId = babyIdOf(this);
    if (!babyId) return;
    store.setCareActive(babyId, 'sleep', { start: now() });
    wx.showToast({ title: '开始记睡眠', icon: 'none' });
    this.refreshCare();
  },

  endSleep() {
    const babyId = babyIdOf(this);
    const active = babyId && store.getCareActive(babyId).sleep;
    if (!active) return;
    const that = this;
    const finish = function (endTs) {
      store.setCareActive(babyId, 'sleep', null);
      if (endTs - active.start < care.MIN) {
        wx.showToast({ title: '不到 1 分钟，没有记录', icon: 'none' });
      } else {
        store.upsertCare({ babyId: babyId, type: 'sleep', start: active.start, end: endTs });
        wx.showToast({ title: '睡了 ' + care.durText(endTs - active.start), icon: 'none' });
      }
      that.refreshCare();
    };
    const t = now();
    if (care.activeView({ sleep: active }, t).sleep.stale) {
      wx.showModal({
        title: '是不是忘了点「醒了」？',
        content: '从 ' + care.hm(active.start) + ' 开始已经 ' + care.durText(t - active.start) + '。可以先按现在记下，再去时间线里改醒来时间。',
        confirmText: '按现在',
        cancelText: '不记了',
        confirmColor: '#E0795A',
        success: function (r) {
          if (r.confirm) finish(t);
          else {
            store.setCareActive(babyId, 'sleep', null);
            that.refreshCare();
          }
        }
      });
      return;
    }
    finish(t);
  },

  /* ---------- 尿布 ---------- */

  pickDiaper(e) {
    const babyId = babyIdOf(this);
    if (!babyId) return;
    const kind = e.currentTarget.dataset.key;
    if (kind === 'wet') {
      store.upsertCare({ babyId: babyId, type: 'diaper', kind: 'wet', start: now() });
      this.setData({ carePanel: '' });
      wx.showToast({ title: '已记录', icon: 'none' });
      this.refreshCare();
      return;
    }
    // 有便便：再选颜色（可跳过）
    this.setData({ carePanel: 'poop', carePendingDiaper: { kind: kind, texture: '' } });
  },

  pickPoopTexture(e) {
    const key = e.currentTarget.dataset.key;
    const p = Object.assign({}, this.data.carePendingDiaper);
    p.texture = p.texture === key ? '' : key;
    this.setData({ carePendingDiaper: p });
  },

  /** 选了颜色就直接保存；dataset.key 为空 = 跳过颜色 */
  pickPoopColor(e) {
    const babyId = babyIdOf(this);
    const pending = this.data.carePendingDiaper;
    if (!babyId || !pending) return;
    const color = e.currentTarget.dataset.key || '';
    store.upsertCare({
      babyId: babyId,
      type: 'diaper',
      kind: pending.kind,
      color: color,
      texture: pending.texture || '',
      start: now()
    });
    this.setData({ carePanel: '', carePendingDiaper: null });

    const c = care.poopColor(color);
    if (c && c.level === 'doctor') {
      wx.showModal({
        title: '建议就医',
        content: c.tip + '\n\n以上为通用参考，不能替代医生判断。',
        showCancel: false,
        confirmText: '知道了',
        confirmColor: '#E0795A'
      });
    } else {
      wx.showToast({ title: '已记录', icon: 'none' });
    }
    this.refreshCare();
  },

  /* ---------- 补记 ---------- */

  goCareEdit(e) {
    const d = (e && e.currentTarget && e.currentTarget.dataset) || {};
    let url = '/pages/care-edit/care-edit';
    if (d.id) url += '?id=' + d.id;
    else if (d.type) url += '?type=' + d.type + (d.date ? '&date=' + d.date : '');
    this.setData({ carePanel: '' });
    wx.navigateTo({ url: url });
  }
};

module.exports = { data: data, methods: methods };
