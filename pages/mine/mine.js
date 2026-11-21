// pages/mine/mine.js
// 「我的」：一次性设置集中处 —— 宝宝档案 / 生长曲线 / 宝宝在哪 / 家人 / 我是谁 / 家庭同步 / 数据与备份
const store = require('../../utils/store.js');
const dateUtil = require('../../utils/date.js');
const placeUtil = require('../../utils/place.js');
const backupFile = require('../../utils/backup-file.js');
const track = require('../../utils/track.js').track;
const sync = require('../../utils/sync.js');

const DAY = 86400000;

/** 「3 天前」「今天」「从没备份过」 */
function backupAgo(ts, now) {
  if (!ts) return '还没备份过';
  const days = Math.floor((now - ts) / DAY);
  if (days <= 0) return '今天备份过';
  if (days === 1) return '昨天备份过';
  return '上次备份：' + days + ' 天前';
}

Page({
  data: {
    baby: null,
    babyCount: 0,
    placeText: '',
    familyText: '',
    manualTempText: '',
    meText: '',
    growthText: '',
    syncText: '',
    syncOn: false,
    dataStats: { babies: 0, vaccine: 0, food: 0, meals: 0, growth: 0, care: 0 },
    hasData: false,
    backupText: '',
    backupStale: false
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
    const me = store.getMe();

    let babyView = null;
    let growthText = '记录每次体检的身高体重';
    if (baby) {
      const age = dateUtil.babyAge(baby);
      babyView = {
        id: baby.id,
        name: baby.name || '宝宝',
        avatar: baby.avatar || '👶',
        ageText: dateUtil.babyAgeText(age) || '月龄未知'
      };
      store.migrateGrowth(baby.id);
      const g = store.getGrowth(baby.id);
      if (g.length) growthText = '已记 ' + g.length + ' 次 · 最近 ' + g[g.length - 1].date.slice(5).replace('-', '/');
    }

    let familyText = '还没添加';
    if (family.length) {
      familyText = family.length + ' 人' + (targets.length ? '，' + targets.length + ' 人接收卡片' : '');
    }

    const st = sync.status();
    this.setData({
      baby: babyView,
      babyCount: babies.length,
      placeText: placeUtil.hasCoords(place) ? placeUtil.formatPlace(place) : '还没设置',
      familyText: familyText,
      manualTempText: manual !== null ? '今天按 ' + manual + '℃ 计算' : '',
      meText: me ? '记录会标上「' + me.label + '」' : '多人一起记时，标出每条是谁记的',
      growthText: growthText,
      syncOn: st.joined,
      syncText: st.text
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

  goGrowth() {
    if (!this.data.baby) {
      this.goBaby();
      return;
    }
    wx.navigateTo({ url: '/pages/growth/growth' });
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

  goSync() {
    wx.navigateTo({ url: '/pages/sync/sync' });
  },

  /** 「我是谁」：从家人名单里选；名单是空的就先去加 */
  pickMe() {
    const family = store.getFamily();
    if (!family.length) {
      wx.showModal({
        title: '先添加家人',
        content: '在「家人」里加上妈妈、奶奶、阿姨等，再回来选「我是谁」。',
        confirmText: '去添加',
        confirmColor: '#E0795A',
        success: function (r) {
          if (r.confirm) wx.navigateTo({ url: '/pages/family/family' });
        }
      });
      return;
    }
    const that = this;
    const labels = family.map(function (m) {
      return m.relation && m.relation !== '其他' ? m.relation + (m.name && m.name !== m.relation ? '（' + m.name + '）' : '') : m.name;
    });
    labels.push('不标记');
    wx.showActionSheet({
      itemList: labels.slice(0, 6),
      success: function (r) {
        const m = family[r.tapIndex];
        store.setMe(m ? m.id : '');
        that.refresh();
      }
    });
  },

  /* ---------- 数据与备份 ---------- */
  // 主路径：导出成文件发到「文件传输助手」，恢复时从聊天记录选回来（数据量大也不卡）
  // 兜底：PC 端 / 低版本微信没有文件接口时，退回剪贴板

  refreshStats() {
    const s = store.localStats();
    const st = store.getSettings();
    const now = Date.now();
    const stale = !st.lastBackupAt || (now - st.lastBackupAt > 14 * DAY && store.changedSinceBackup(st));
    const has = s.babies + s.vaccine + s.food + s.meals + s.growth + (s.care || 0) > 0;
    this.setData({
      dataStats: s,
      hasData: has,
      backupText: backupAgo(st.lastBackupAt, now),
      backupStale: has && stale
    });
  },

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
        store.markBackedUp();
        track('backup_export', { method: 'file' });
        that.refreshStats();
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
        that.confirmRestore(res.text, '这个文件', 'file');
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
    const that = this;
    wx.setClipboardData({
      data: store.exportBackup(),
      success: function () {
        store.markBackedUp();
        track('backup_export', { method: 'clipboard' });
        that.refreshStats();
        wx.showModal({
          title: '备份已复制',
          content:
            '粘贴发给「文件传输助手」或自己，就算保存好了。换手机、或想把家人手机上的记录合到一起时，复制这段文字再点「从复制的文字恢复」。',
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
        that.confirmRestore(res.data, '剪贴板', 'clipboard');
      },
      fail: function () {
        wx.showToast({ title: '读取剪贴板失败', icon: 'none' });
      }
    });
  },

  /**
   * 两种来源共用：先告诉用户里面有什么，再选「合并」还是「替换」
   * 默认合并 —— 两台手机各记各的，合起来谁的都不丢；本机是空的就不用问，直接合
   */
  confirmRestore(text, source, method) {
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
    const summary =
      whenText +
      '包含 ' + s.babies + ' 个宝宝、' + (s.care || 0) + ' 条喂奶/睡眠/尿布、' + (s.meals + s.food) + ' 条辅食、' +
      s.vaccine + ' 条接种' + (s.growth ? '、' + s.growth + ' 次身高体重' : '') + '。';

    const done = function (mode) {
      const res = store.importBackup(text, mode);
      track('backup_import', { method: method, mode: mode });
      that.refresh();
      const r = res.result;
      wx.showModal({
        title: mode === 'merge' ? '已合并' : '已恢复',
        content:
          mode === 'merge'
            ? '新加了 ' + r.added + ' 条，更新了 ' + r.updated + ' 条' + (r.removed ? '，按对方的删除去掉了 ' + r.removed + ' 条' : '') + '。本机原有的记录都还在。'
            : '本机已换成备份里的内容。',
        showCancel: false,
        confirmText: '好的',
        confirmColor: '#E0795A'
      });
    };

    if (!this.data.hasData) {
      done('merge');
      return;
    }
    wx.showModal({
      title: '把备份合进来？',
      content: summary + '\n\n合并：两边的记录都保留，同一条以较新的为准。\n替换：本机记录全部换成备份。',
      confirmText: '合并',
      cancelText: '更多',
      confirmColor: '#E0795A',
      success: function (r) {
        if (r.confirm) {
          done('merge');
          return;
        }
        wx.showActionSheet({
          itemList: ['替换本机（本机记录会被删掉）'],
          success: function (a) {
            if (a.tapIndex !== 0) return;
            wx.showModal({
              title: '确定替换？',
              content: '本机现有的记录会全部删掉，换成备份里的。这一步不能撤销。',
              confirmText: '替换',
              confirmColor: '#C43C2A',
              success: function (c) {
                if (c.confirm) done('replace');
              }
            });
          }
        });
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
