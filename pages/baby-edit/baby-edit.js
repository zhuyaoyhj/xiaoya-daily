// pages/baby-edit/baby-edit.js
const store = require('../../utils/store.js');
const dateUtil = require('../../utils/date.js');

const AVATARS = ['👶', '🐣', '🌱', '🍑', '🐻', '🐰', '🌟', '🍼', '🐼', '🦊'];

function decorate(b) {
  const age = dateUtil.calcAge(b.birthday);
  const parts = [];
  if (b.weight) parts.push(b.weight + ' kg');
  if (b.height) parts.push(b.height + ' cm');
  return {
    id: b.id,
    name: b.name || '宝宝',
    avatar: b.avatar || '👶',
    ageText: dateUtil.ageText(age) || '月龄未知',
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
      avatar: '👶',
      note: ''
    },
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
        avatar: '👶',
        note: ''
      };
    }

    this.setData({
      mode: 'edit',
      baby: Object.assign({}, this.data.baby, baby),
      isNew: isNew,
      today: today,
      minDate: minDate,
      agePreview: baby.birthday ? dateUtil.ageText(dateUtil.calcAge(baby.birthday)) : ''
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
    this.setData({
      'baby.birthday': birthday,
      agePreview: dateUtil.ageText(dateUtil.calcAge(birthday))
    });
  },

  save() {
    const b = this.data.baby;
    if (!b.birthday) {
      wx.showToast({ title: '先选一下出生日期', icon: 'none' });
      return;
    }

    const payload = {
      id: b.id || store.newBabyId(),
      name: String(b.name || '').trim() || '宝宝',
      gender: b.gender === 'girl' ? 'girl' : 'boy',
      birthday: b.birthday,
      weight: String(b.weight || '').trim(),
      height: String(b.height || '').trim(),
      avatar: b.avatar || '👶',
      note: String(b.note || '').trim(),
      updatedAt: Date.now()
    };

    store.upsertBaby(payload);
    if (this.data.isNew || !store.getSettings().activeBabyId) {
      store.setActiveBabyId(payload.id);
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
  }
});
