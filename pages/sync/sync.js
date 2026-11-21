// pages/sync/sync.js —— 家庭同步：创建 / 加入 / 立即同步 / 退出
const sync = require('../../utils/sync.js');

Page({
  data: {
    available: false,
    joined: false,
    code: '',
    text: '',
    error: '',
    input: '',
    busy: false
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const st = sync.status();
    this.setData({
      available: st.available,
      joined: st.joined,
      code: st.code,
      text: st.text,
      error: st.error ? sync.errorText({ message: st.error }) : ''
    });
  },

  onInput(e) {
    this.setData({ input: String(e.detail.value || '').replace(/\D/g, '').slice(0, 6) });
  },

  run(promise, okText) {
    const that = this;
    this.setData({ busy: true });
    wx.showLoading({ title: '同步中', mask: true });
    return promise
      .then(function (r) {
        wx.hideLoading();
        if (okText) wx.showToast({ title: okText(r), icon: 'none' });
        return r;
      })
      .catch(function (err) {
        wx.hideLoading();
        wx.showModal({ title: '没成功', content: sync.errorText(err), showCancel: false, confirmColor: '#E0795A' });
        return null;
      })
      .then(function (r) {
        that.setData({ busy: false, input: '' });
        that.refresh();
        return r;
      });
  },

  create() {
    if (this.data.busy) return;
    this.run(sync.createFamily(), function () {
      return '已创建，把家庭码发给家人';
    });
  },

  join() {
    if (this.data.busy) return;
    if (this.data.input.length !== 6) {
      wx.showToast({ title: '家庭码是 6 位数字', icon: 'none' });
      return;
    }
    this.run(sync.joinFamily(this.data.input), function (r) {
      return '已加入，合进来 ' + ((r && r.added) || 0) + ' 条';
    });
  },

  syncNow() {
    if (this.data.busy) return;
    this.run(sync.syncNow({ force: true }), function (r) {
      const n = (r && r.added + r.updated) || 0;
      return n ? '同步了 ' + n + ' 条' : '已是最新';
    });
  },

  copyCode() {
    wx.setClipboardData({ data: this.data.code });
  },

  leave() {
    const that = this;
    wx.showModal({
      title: '退出家庭同步？',
      content: '本机的记录都会保留，只是不再和家人同步。之后可以用家庭码重新加入。',
      confirmText: '退出',
      confirmColor: '#C43C2A',
      success: function (r) {
        if (!r.confirm) return;
        sync.leaveFamily().then(function () {
          that.refresh();
        });
      }
    });
  },

  goMine() {
    wx.navigateBack();
  },

  onShareAppMessage() {
    return {
      title: '一起记宝宝的吃睡尿 · 家庭码 ' + (this.data.code || ''),
      path: '/pages/sync/sync'
    };
  }
});
