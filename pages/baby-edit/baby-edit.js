// pages/baby-edit/baby-edit.js
const store = require('../../utils/store.js');
const dateUtil = require('../../utils/date.js');
const track = require('../../utils/track.js').track;

const AVATARS = ['👶', '🐣', '🌱', '🍑', '🐻', '🐰', '🌟', '🍼', '🐼', '🦊'];

/** 预产期可选范围：生日后 3 周 ~ 17 周 */
function dueRange(birthday) {
  if (!birthday) return { start: '', end: '' };
  return {
    start: dateUtil.shiftDate(birthday, dateUtil.PRETERM_MIN_DAYS),
    end: dateUtil.shiftDate(birthday, dateUtil.PRETERM_MAX_DAYS)
  };
}

function previewText(b) {
  if (!b.birthday) return '';
  return dateUtil.babyAgeText(dateUtil.babyAge(b));
}

function decorate(b) {
  const age = dateUtil.babyAge(b);
  const parts = [];
  if (b.weight) parts.push(b.weight + ' kg');
  if (b.height) parts.push(b.height + ' cm');
  return {
    id: b.id,
    name: b.name || '宝宝',
    avatar: b.avatar || '👶',
    ageText: dateUtil.babyAgeText(age) || '月龄未知',
    subtitle: parts.join(' · ') || (b.gender === 'girl' ? '女宝' : '男宝')
  };
}

Page({
  data: {
    mode: 'edit',
    baby: {
      id: '',
      name: '',
      gender: 'boy',
      birthday: '',
      weight: '',
      height: '',
      dueDate: '',
      avatar: '👶',
      note: ''
    },
    preterm: false,
    dueStart: '',
    dueEnd: '',
    babies: [],
    activeId: '',
    avatars: AVATARS,
    genders: [
      { key: 'boy', label: '男宝' },
      { key: 'girl', label: '女宝' }
    ],
    agePreview: '',
    today: '',
    minDate: '',
    isNew: true
  },

  onLoad(options) {
    const opts = options || {};
    const babies = store.getBabies();
    const active = store.getActiveBaby();
    const today = dateUtil.todayStr();

    const d = new Date();
    d.setFullYear(d.getFullYear() - 6);
    const minDate = d.getFullYear() + '-' + dateUtil.pad(d.getMonth() + 1) + '-' + dateUtil.pad(d.getDate());

    if (opts.mode === 'list') {
      this.setData({
        mode: 'list',
        babies: babies.map(decorate),
        activeId: active ? active.id : '',
        today: today
      });
      wx.setNavigationBarTitle({ title: '宝宝档案' });
      return;
    }

    let baby = opts.id ? store.getBaby(opts.id) : null;
    const isNew = !baby;
    if (!baby) {
      baby = {
        id: '',
        name: '',
        gender: 'boy',
        birthday: '',
        weight: '',
        height: '',
        dueDate: '',
        avatar: '👶',
        note: ''
      };
    }
    const range = dueRange(baby.birthday);

    this.setData({
      mode: 'edit',
      baby: Object.assign({}, this.data.baby, baby),
      isNew: isNew,
      today: today,
      minDate: minDate,
      preterm: !!baby.dueDate,
      dueStart: range.start,
      dueEnd: range.end,
      agePreview: previewText(baby)
    });
    wx.setNavigationBarTitle({ title: isNew ? '添加宝宝' : '编辑档案' });
  },

  /* ---------- 表单 ---------- */

  onName(e) {
    this.setData({ 'baby.name': e.detail.value });
  },

  onWeight(e) {
    this.setData({ 'baby.weight': e.detail.value });
  },

  onHeight(e) {
    this.setData({ 'baby.height': e.detail.value });
  },

  onNote(e) {
    this.setData({ 'baby.note': e.detail.value });
  },

  pickGender(e) {
    this.setData({ 'baby.gender': e.currentTarget.dataset.k });
  },

  pickAvatar(e) {
    this.setData({ 'baby.avatar': e.currentTarget.dataset.a });
  },

  onBirthday(e) {
    const birthday = e.detail.value;
    const range = dueRange(birthday);
    const b = Object.assign({}, this.data.baby, { birthday: birthday });
    // 生日改了，原来的预产期可能不在合理范围了，清掉让用户重选
    if (b.dueDate && (b.dueDate < range.start || b.dueDate > range.end)) b.dueDate = '';
    this.setData({
      baby: b,
      dueStart: range.start,
      dueEnd: range.end,
      agePreview: previewText(b)
    });
  },

  /** 早产开关：关掉即清空预产期 */
  togglePreterm(e) {
    const on = !!e.detail.value;
    const b = Object.assign({}, this.data.baby);
    if (!on) b.dueDate = '';
    this.setData({ preterm: on, baby: b, agePreview: previewText(b) });
  },

  onDueDate(e) {
    const b = Object.assign({}, this.data.baby, { dueDate: e.detail.value });
    this.setData({ baby: b, agePreview: previewText(b) });
  },

  save() {
    const b = this.data.baby;
    if (!b.birthday) {
      wx.showToast({ title: '先选一下出生日期', icon: 'none' });
      return;
    }

    // 体重身高选填，填了就做个合理范围检查，避免 85 写成 8.5 这类手误
    const w = String(b.weight || '').trim();
    if (w && !(Number(w) >= 1 && Number(w) <= 40)) {
      wx.showToast({ title: '体重填 1~40 kg 之间', icon: 'none' });
      return;
    }
    const h = String(b.height || '').trim();
    if (h && !(Number(h) >= 30 && Number(h) <= 130)) {
      wx.showToast({ title: '身高填 30~130 cm 之间', icon: 'none' });
      return;
    }

    if (this.data.preterm && !b.dueDate) {
      wx.showToast({ title: '选一下预产期，或关掉「早产宝宝」', icon: 'none' });
      return;
    }
    if (b.dueDate && !dateUtil.pretermDays(b)) {
      wx.showToast({ title: '预产期要比出生晚 3~17 周', icon: 'none' });
      return;
    }

    const payload = {
      id: b.id || store.newBabyId(),
      name: String(b.name || '').trim() || '宝宝',
      gender: b.gender === 'girl' ? 'girl' : 'boy',
      birthday: b.birthday,
      weight: String(b.weight || '').trim(),
      height: String(b.height || '').trim(),
      dueDate: this.data.preterm ? b.dueDate : '',
      avatar: b.avatar || '👶',
      note: String(b.note || '').trim(),
      updatedAt: Date.now()
    };

    const firstBaby = !store.getBabies().length;
    store.upsertBaby(payload);
    if (this.data.isNew || !store.getSettings().activeBabyId) {
      store.setActiveBabyId(payload.id);
    }
    // 填了体重身高就记成第一次测量，生长曲线一开始就有点
    if (this.data.isNew && (payload.weight || payload.height)) {
      try {
        store.upsertGrowth({ babyId: payload.id, date: dateUtil.todayStr(), weight: payload.weight, height: payload.height, note: '建档时填写' });
      } catch (e) {
        // 范围前面已校验，这里不会失败
      }
    }
    if (this.data.isNew) {
      track('baby_add', { preterm: !!payload.dueDate });
      // 第一个宝宝：回首页走引导（首页会提示「记第一笔」→「设地点」）
      if (firstBaby) store.updateSettings({ onboarded: false });
    }

    wx.showToast({ title: '已保存', icon: 'success' });
    setTimeout(function () {
      const pages = getCurrentPages();
      if (pages.length > 1) wx.navigateBack();
      else wx.switchTab({ url: '/pages/index/index' });
    }, 480);
  },

  remove() {
    const that = this;
    const name = this.data.baby.name || '宝宝';
    wx.showModal({
      title: '删除档案',
      content: '确定删除「' + name + '」的档案吗？删除后无法恢复。',
      confirmColor: '#E0795A',
      success: function (res) {
        if (!res.confirm) return;
        store.removeBaby(that.data.baby.id);
        wx.showToast({ title: '已删除', icon: 'none' });
        setTimeout(function () {
          wx.navigateBack();
        }, 400);
      }
    });
  },

  /* ---------- 列表 ---------- */

  selectBaby(e) {
    const id = e.currentTarget.dataset.id;
    store.setActiveBabyId(id);
    wx.navigateBack();
  },

  goAdd() {
    wx.redirectTo({ url: '/pages/baby-edit/baby-edit' });
  },

  goEdit(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/baby-edit/baby-edit?id=' + id });
  },

  goBackup() {
    wx.switchTab({ url: '/pages/mine/mine' });
  }
});
