// pages/mine/mine.js
// 「我的」：一次性设置集中处 —— 宝宝档案 / 宝宝在哪 / 带娃人 / 数据与备份
const store = require('../../utils/store.js');
const dateUtil = require('../../utils/date.js');
const placeUtil = require('../../utils/place.js');
const backupFile = require('../../utils/backup-file.js');

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
      const age = dateUtil.babyAge(baby);
      babyView = {
        id: baby.id,
        name: baby.name || '宝宝',
        avatar: baby.avatar || '👶',
        ageText: dateUtil.babyAgeText(age) || '月龄未知'
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

  /* ---------- 数据与备份 ---------- */
  // 主路径：导出成文件发到「文件传输助手」，恢复时从聊天记录选回来（数据量大也不卡）
  // 兜底：PC 端 / 低版本微信没有文件接口时，退回剪贴板

  /** 导出：优先文件，不支持就走剪贴板 */
  exportData() {
    if (!this.data.hasData) {
      wx.showToast({ title: '还没有可备份的记录', icon: 'none' });
      return;
    }
    if (!backupFile.supported()) {
      this.exportClipboard();
      return;
    }
    const that = this;
    backupFile
      .exportToChat(store.exportBackup())
      .then(function () {
        wx.showToast({ title: '已发出备份文件', icon: 'success' });
      })
      .catch(function (err) {
        if (err && err.message === 'CANCEL') return;
        wx.showModal({
          title: '没能生成备份文件',
          content: '可以改用复制的方式备份：整份记录复制成一段文字，发给「文件传输助手」保存。',
          confirmText: '复制备份',
          confirmColor: '#E0795A',
          success: function (r) {
            if (r.confirm) that.exportClipboard();
          }
        });
      });
  },

  /** 恢复：优先从聊天记录选文件，不支持就读剪贴板 */
  importData() {
    if (!backupFile.supported()) {
      this.importClipboard();
      return;
    }
    const that = this;
    backupFile
      .pickFromChat()
      .then(function (res) {
        that.confirmRestore(res.text, '这个文件');
      })
      .catch(function (err) {
        if (err && err.message === 'CANCEL') return;
        wx.showToast({ title: '没读到这个文件', icon: 'none' });
      });
  },

  /** 「备份方式」的次级入口：剪贴板复制 / 粘贴 */
  moreBackup() {
    const that = this;
    wx.showActionSheet({
      itemList: ['复制备份文字', '从复制的文字恢复'],
      success: function (r) {
        if (r.tapIndex === 0) that.exportClipboard();
        else if (r.tapIndex === 1) that.importClipboard();
      }
    });
  },

  exportClipboard() {
    if (!this.data.hasData) {
      wx.showToast({ title: '还没有可备份的记录', icon: 'none' });
      return;
    }
    wx.setClipboardData({
      data: store.exportBackup(),
      success: function () {
        wx.showModal({
          title: '备份已复制',
          content:
            '粘贴发给「文件传输助手」或自己，就算保存好了。换手机、或想让家人手机上也有同一份记录时，复制这段文字再点「从复制的文字恢复」。',
          showCancel: false,
          confirmText: '知道了',
          confirmColor: '#E0795A'
        });
      }
    });
  },

  importClipboard() {
    const that = this;
    wx.getClipboardData({
      success: function (res) {
        that.confirmRestore(res.data, '剪贴板');
      },
      fail: function () {
        wx.showToast({ title: '读取剪贴板失败', icon: 'none' });
      }
    });
  },

  /** 两种来源共用：先告诉用户里面有什么 → 确认后覆盖 */
  confirmRestore(text, source) {
    const that = this;
    let parsed;
    try {
      parsed = store.parseBackup(text);
    } catch (e) {
      wx.showModal({
        title: '没找到备份',
        content:
          source === '剪贴板'
            ? '先复制之前保存的那段备份文字（以 XYD1: 开头），再回来恢复。'
            : '这个文件不是小芽日常的备份。备份文件名以「' + backupFile.FILE_PREFIX + '」开头。',
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
        store.importBackup(text);
        that.refresh();
        wx.showToast({ title: '已恢复', icon: 'success' });
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
