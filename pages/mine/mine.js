// pages/mine/mine.js
// 「我的」：一次性设置集中处 —— 宝宝档案 / 宝宝在哪 / 带娃人 / 数据与备份
const store = require('../../utils/store.js');
const dateUtil = require('../../utils/date.js');
const placeUtil = require('../../utils/place.js');

Page({
  data: {
    baby: null,
    babyCount: 0,
    placeText: '',
    familyText: '',
    manualTempText: '',
    dataStats: { babies: 0, vaccine: 0, food: 0, meals: 0, care: 0 },
    hasData: false
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const baby = store.getActiveBaby();
    const babies = store.getBabies();
    const place = store.getPlace();
    const family = store.getFamily();
    const targets = store.getPushTargets();
    const manual = store.getManualTemp();

    let babyView = null;
    if (baby) {
      const age = dateUtil.calcAge(baby.birthday);
      babyView = {
        id: baby.id,
        name: baby.name || '宝宝',
        avatar: baby.avatar || '👶',
        ageText: dateUtil.ageText(age) || '月龄未知'
      };
    }

    let familyText = '还没添加';
    if (family.length) {
      familyText = family.length + ' 人' + (targets.length ? '，' + targets.length + ' 人接收卡片' : '');
    }

    this.setData({
      baby: babyView,
      babyCount: babies.length,
      placeText: placeUtil.hasCoords(place) ? placeUtil.formatPlace(place) : '还没设置',
      familyText: familyText,
      manualTempText: manual !== null ? '今天按 ' + manual + '℃ 计算' : ''
    });
    this.refreshStats();
  },

  /* ---------- 入口 ---------- */

  goBaby() {
    if (!this.data.baby) {
      wx.navigateTo({ url: '/pages/baby-edit/baby-edit' });
      return;
    }
    wx.navigateTo({ url: '/pages/baby-edit/baby-edit?id=' + this.data.baby.id });
  },

  goBabies() {
    wx.navigateTo({ url: '/pages/baby-edit/baby-edit?mode=list' });
  },

  goPlace() {
    wx.navigateTo({ url: '/pages/place/place' });
  },

  goWeather() {
    wx.navigateTo({ url: '/pages/weather/weather' });
  },

  goFamily() {
    wx.navigateTo({ url: '/pages/family/family' });
  },

  goShare() {
    wx.navigateTo({ url: '/pages/share/share' });
  },

  /* ---------- 数据与备份 ---------- */

  refreshStats() {
    const s = store.localStats();
    this.setData({
      dataStats: s,
      hasData: s.babies + s.vaccine + s.food + s.meals + (s.care || 0) > 0
    });
  },

  /** 导出：整份数据复制到剪贴板，引导发到「文件传输助手」保存 */
  exportData() {
    if (!this.data.hasData) {
      wx.showToast({ title: '还没有可备份的记录', icon: 'none' });
      return;
    }
    const text = store.exportBackup();
    wx.setClipboardData({
      data: text,
      success: function () {
        wx.showModal({
          title: '备份已复制',
          content:
            '粘贴发给「文件传输助手」或自己，就算保存好了。换手机、或想让家人手机上也有同一份记录时，复制这段文字再点「从备份恢复」。',
          showCancel: false,
          confirmText: '知道了',
          confirmColor: '#E0795A'
        });
      }
    });
  },

  /** 导入：读剪贴板 → 先告诉用户里面有什么 → 确认后覆盖 */
  importData() {
    const that = this;
    wx.getClipboardData({
      success: function (res) {
        let parsed;
        try {
          parsed = store.parseBackup(res.data);
        } catch (e) {
          wx.showModal({
            title: '没找到备份',
            content: '先复制之前保存的那段备份文字（以 XYD1: 开头），再回来点「从备份恢复」。',
            showCancel: false,
            confirmText: '好的',
            confirmColor: '#E0795A'
          });
          return;
        }
        const s = parsed.stats;
        const when = parsed.at ? new Date(parsed.at) : null;
        const whenText = when ? when.getMonth() + 1 + '月' + when.getDate() + '日的备份，' : '';
        wx.showModal({
          title: '用备份覆盖本机？',
          content:
            whenText +
            '包含 ' + s.babies + ' 个宝宝、' + (s.care || 0) + ' 条喂奶/睡眠/尿布、' + (s.meals + s.food) + ' 条辅食、' + s.vaccine +
            ' 条接种记录。本机现有记录会被替换。',
          confirmText: '恢复',
          confirmColor: '#E0795A',
          success: function (r) {
            if (!r.confirm) return;
            store.importBackup(res.data);
            that.refresh();
            wx.showToast({ title: '已恢复', icon: 'success' });
          }
        });
      },
      fail: function () {
        wx.showToast({ title: '读取剪贴板失败', icon: 'none' });
      }
    });
  },

  onShareAppMessage() {
    return {
      title: '小芽日常 · 按月龄的宝宝照护建议',
      path: '/pages/index/index'
    };
  }
});
