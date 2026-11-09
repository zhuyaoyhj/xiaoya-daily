// pages/family/family.js
const store = require('../../utils/store.js');
const cloud = require('../../utils/cloud.js');

Page({
  data: {
    family: [],
    relations: store.RELATIONS,
    relationIndex: 0,
    newName: '',
    targetCount: 0,
    subscribeEnabled: false,
    tmplConfigured: false
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const ids = store.getSettings().pushTargets || [];
    const list = store.getFamily().map(function (m) {
      return {
        id: m.id,
        name: m.name,
        relation: m.relation,
        checked: ids.indexOf(m.id) > -1
      };
    });
    const app = getApp();
    this.setData({
      family: list,
      targetCount: list.filter(function (m) {
        return m.checked;
      }).length,
      subscribeEnabled: !!store.getSettings().subscribeEnabled,
      tmplConfigured: !!(app.globalData && app.globalData.tmplIds && app.globalData.tmplIds.length)
    });
  },

  onNewName(e) {
    this.setData({ newName: e.detail.value });
  },

  onRelationChange(e) {
    this.setData({ relationIndex: Number(e.detail.value) });
  },

  addMember() {
    const name = String(this.data.newName || '').trim();
    if (!name) {
      wx.showToast({ title: '填一个称呼，如 奶奶', icon: 'none' });
      return;
    }
    const relation = this.data.relations[this.data.relationIndex] || '其他';
    const member = store.addFamilyMember(name, relation);
    store.togglePushTarget(member.id);
    this.setData({ newName: '' });
    this.refresh();
    wx.showToast({ title: '已添加', icon: 'success' });
  },

  toggle(e) {
    store.togglePushTarget(e.currentTarget.dataset.id);
    this.refresh();
  },

  removeMember(e) {
    const that = this;
    const id = e.currentTarget.dataset.id;
    const name = e.currentTarget.dataset.name;
    wx.showModal({
      title: '移除',
      content: '把「' + name + '」从带娃人名单里移除？',
      confirmColor: '#E0795A',
      success: function (res) {
        if (!res.confirm) return;
        store.removeFamilyMember(id);
        that.refresh();
      }
    });
  },

  /** 订阅每日提醒：需要先在 app.js 里配置订阅消息模板 ID */
  enableSubscribe() {
    const app = getApp();
    const tmplIds = (app.globalData && app.globalData.tmplIds) || [];

    if (!tmplIds.length) {
      wx.showModal({
        title: '还差一步',
        content:
          '每日自动提醒需要用到微信「订阅消息」。请先在公众平台申请模板，把模板 ID 填进 app.js 的 tmplIds，再回来开启。现在也可以直接用「生成今日卡片」转发给家人。',
        showCancel: false,
        confirmText: '知道了'
      });
      return;
    }

    const that = this;
    wx.requestSubscribeMessage({
      tmplIds: tmplIds,
      success: function (res) {
        const accepted = tmplIds.filter(function (id) {
          return res[id] === 'accept';
        });
        if (!accepted.length) {
          wx.showToast({ title: '未开启提醒', icon: 'none' });
          return;
        }
        store.updateSettings({ subscribeEnabled: true });
        that.setData({ subscribeEnabled: true });
        cloud
          .call('pushTip', {
            action: 'subscribe',
            tmplIds: accepted,
            targets: store.getPushTargets()
          })
          .catch(function () {
            // 云函数未部署时不影响本地状态
          });
        wx.showToast({ title: '已开启每日提醒', icon: 'success' });
      },
      fail: function () {
        wx.showToast({ title: '订阅未完成', icon: 'none' });
      }
    });
  },

  disableSubscribe() {
    store.updateSettings({ subscribeEnabled: false });
    this.setData({ subscribeEnabled: false });
  },

  toggleSubscribe() {
    if (this.data.subscribeEnabled) this.disableSubscribe();
    else this.enableSubscribe();
  },

  copyNames() {
    const names = this.data.family
      .filter(function (m) {
        return m.checked;
      })
      .map(function (m) {
        return (m.relation || '') + ' ' + m.name;
      })
      .join('、');
    if (!names) {
      wx.showToast({ title: '还没选推送对象', icon: 'none' });
      return;
    }
    wx.setClipboardData({
      data: names,
      success: function () {
        wx.showToast({ title: '已复制', icon: 'success' });
      }
    });
  },

  goShare() {
    wx.navigateTo({ url: '/pages/share/share' });
  }
});
