// pages/care-edit/care-edit.js —— 单条照护记录：补记 / 修改 / 删除
// 入口：?id=xxx 修改；?type=feed|sleep|diaper[&date=YYYY-MM-DD] 补记
const store = require('../../utils/store.js');
const care = require('../../utils/care.js');
const dateUtil = require('../../utils/date.js');
const BOTTLE_ML = require('../../data/care.js').BOTTLE_ML;

const TYPE_TITLE = { feed: '喂奶', sleep: '睡眠', diaper: '尿布' };

function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

function toTs(date, time) {
  const p = String(time || '00:00').split(':').map(Number);
  return care.dayStart(date) + (p[0] || 0) * care.HOUR + (p[1] || 0) * care.MIN;
}

function hmNow() {
  const d = new Date();
  return pad(d.getHours()) + ':' + pad(d.getMinutes());
}

Page({
  data: {
    isEdit: false,
    id: '',
    type: 'feed',
    babyName: '',
    today: '',
    // 通用
    date: '',
    time: '',
    note: '',
    // 喂奶
    feedMode: 'breast', // breast | bottle
    leftMin: '',
    rightMin: '',
    bottleType: 'formula',
    ml: '',
    bottleMl: BOTTLE_ML,
    bottleTypes: care.BOTTLE_TYPES,
    // 睡眠
    endDate: '',
    endTime: '',
    // 尿布
    kind: 'wet',
    color: '',
    texture: '',
    diaperKinds: care.DIAPER_KINDS,
    poopColors: care.POOP_COLORS,
    poopTextures: care.POOP_TEXTURES,
    colorTip: null
  },

  onLoad(options) {
    const o = options || {};
    const baby = store.getActiveBaby();
    if (!baby) {
      wx.showToast({ title: '请先添加宝宝', icon: 'none' });
      setTimeout(function () {
        wx.navigateBack();
      }, 800);
      return;
    }
    const today = dateUtil.todayStr();
    const base = { babyName: baby.name || '宝宝', today: today };

    if (o.id) {
      const e = store.getCareEntry(o.id);
      if (e) {
        this.setData(Object.assign(base, this.fromEntry(e)));
        wx.setNavigationBarTitle({ title: '改' + TYPE_TITLE[e.type] + '记录' });
        return;
      }
    }

    const type = TYPE_TITLE[o.type] ? o.type : 'feed';
    const date = o.date && o.date <= today ? o.date : today;
    // 补记过去某天时默认中午，补记今天默认现在
    const time = date === today ? hmNow() : '12:00';
    this.setData(
      Object.assign(base, {
        type: type,
        date: date,
        time: time,
        endDate: date,
        endTime: date === today ? hmNow() : '13:00'
      })
    );
    wx.setNavigationBarTitle({ title: '补记' + TYPE_TITLE[type] });
  },

  fromEntry(e) {
    const out = {
      isEdit: true,
      id: e.id,
      type: e.type,
      date: care.dateOf(e.start),
      time: care.hm(e.start),
      note: e.note || ''
    };
    if (e.type === 'feed') {
      out.feedMode = e.side === 'bottle' ? 'bottle' : 'breast';
      out.leftMin = e.leftMin ? String(e.leftMin) : '';
      out.rightMin = e.rightMin ? String(e.rightMin) : '';
      out.bottleType = e.bottleType || 'formula';
      out.ml = e.ml ? String(e.ml) : '';
    } else if (e.type === 'sleep') {
      const end = e.end || e.start;
      out.endDate = care.dateOf(end);
      out.endTime = care.hm(end);
    } else if (e.type === 'diaper') {
      out.kind = e.kind || 'wet';
      out.color = e.color || '';
      out.texture = e.texture || '';
      out.colorTip = colorTip(e.color);
    }
    return out;
  },

  /* ---------- 表单 ---------- */

  onDate(e) {
    const patch = { date: e.detail.value };
    // 睡眠的醒来日期默认跟着走
    if (this.data.type === 'sleep' && this.data.endDate < e.detail.value) patch.endDate = e.detail.value;
    this.setData(patch);
  },
  onTime(e) {
    this.setData({ time: e.detail.value });
  },
  onEndDate(e) {
    this.setData({ endDate: e.detail.value });
  },
  onEndTime(e) {
    this.setData({ endTime: e.detail.value });
  },
  onNote(e) {
    this.setData({ note: e.detail.value });
  },
  pickFeedMode(e) {
    this.setData({ feedMode: e.currentTarget.dataset.key });
  },
  onLeft(e) {
    this.setData({ leftMin: e.detail.value });
  },
  onRight(e) {
    this.setData({ rightMin: e.detail.value });
  },
  pickBottleType(e) {
    this.setData({ bottleType: e.currentTarget.dataset.key });
  },
  pickMl(e) {
    this.setData({ ml: String(e.currentTarget.dataset.ml) });
  },
  onMl(e) {
    this.setData({ ml: e.detail.value });
  },
  pickKind(e) {
    const kind = e.currentTarget.dataset.key;
    const patch = { kind: kind };
    if (kind === 'wet') {
      patch.color = '';
      patch.texture = '';
      patch.colorTip = null;
    }
    this.setData(patch);
  },
  pickColor(e) {
    const key = e.currentTarget.dataset.key;
    const color = this.data.color === key ? '' : key;
    this.setData({ color: color, colorTip: colorTip(color) });
  },
  pickTexture(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ texture: this.data.texture === key ? '' : key });
  },

  /* ---------- 保存 ---------- */

  /** 组装并校验；有问题返回错误文案 */
  build() {
    const d = this.data;
    const baby = store.getActiveBaby();
    const start = toTs(d.date, d.time);
    if (start > Date.now() + care.MIN) return { err: '时间不能晚于现在' };
    const rec = { id: d.id || undefined, babyId: baby.id, type: d.type, start: start, note: d.note };

    if (d.type === 'feed') {
      if (d.feedMode === 'bottle') {
        const ml = Math.round(Number(d.ml));
        if (!(ml >= 5 && ml <= 400)) return { err: '奶量填 5~400 ml' };
        Object.assign(rec, { side: 'bottle', bottleType: d.bottleType, ml: ml, end: start, leftMin: 0, rightMin: 0 });
      } else {
        const l = Math.round(Number(d.leftMin) || 0);
        const r = Math.round(Number(d.rightMin) || 0);
        if (l < 0 || r < 0 || l > 120 || r > 120) return { err: '每侧填 0~120 分钟' };
        if (l + r < 1) return { err: '至少填一侧喂了几分钟' };
        Object.assign(rec, {
          side: l >= r ? 'left' : 'right',
          leftMin: l,
          rightMin: r,
          end: start + (l + r) * care.MIN,
          ml: 0,
          bottleType: ''
        });
      }
    } else if (d.type === 'sleep') {
      const end = toTs(d.endDate, d.endTime);
      if (end <= start) return { err: '醒来时间要晚于入睡时间' };
      if (end - start > 16 * care.HOUR) return { err: '一觉超过 16 小时，检查一下日期' };
      if (end > Date.now() + care.MIN) return { err: '醒来时间不能晚于现在' };
      rec.end = end;
    } else {
      Object.assign(rec, { kind: d.kind, color: d.kind === 'wet' ? '' : d.color, texture: d.kind === 'wet' ? '' : d.texture, end: start });
    }
    return { rec: rec };
  },

  save() {
    const r = this.build();
    if (r.err) {
      wx.showToast({ title: r.err, icon: 'none' });
      return;
    }
    store.upsertCare(r.rec);
    const tip = colorTip(r.rec.color);
    const back = function () {
      wx.navigateBack();
    };
    if (tip && tip.level === 'doctor' && !this.data.isEdit) {
      wx.showModal({
        title: '建议就医',
        content: tip.tip + '\n\n以上为通用参考，不能替代医生判断。',
        showCancel: false,
        confirmColor: '#E0795A',
        success: back
      });
      return;
    }
    wx.showToast({ title: this.data.isEdit ? '已更新' : '已补记', icon: 'success' });
    setTimeout(back, 500);
  },

  remove() {
    const id = this.data.id;
    wx.showModal({
      title: '删除这条记录？',
      content: '删除后无法恢复。',
      confirmColor: '#E0795A',
      success: function (res) {
        if (!res.confirm) return;
        store.removeCare(id);
        wx.showToast({ title: '已删除', icon: 'none' });
        setTimeout(function () {
          wx.navigateBack();
        }, 400);
      }
    });
  }
});

function colorTip(key) {
  const c = key ? care.poopColor(key) : null;
  return c ? { level: c.level, tip: c.tip, label: c.label } : null;
}
