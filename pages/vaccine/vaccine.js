// pages/vaccine/vaccine.js
const store = require('../../utils/store.js');
const vaccine = require('../../utils/vaccine.js');
const dateUtil = require('../../utils/date.js');

// 事项标签 → 样式类（中文不能直接当类名用）
const TAG_CLASS = {
  必做: 'must',
  重点: 'must',
  警惕: 'warn',
  观察: 'watch',
  提示: 'watch',
  护理: 'care',
  饮食: 'care',
  活动: 'care',
  准备: 'prep'
};

Page({
  data: {
    hasBaby: false,
    baby: null,
    months: 0,
    brief: null,
    care: null,
    lastCare: null,
    planned: [],
    records: [],
    recordsExpanded: false,
    hiddenCount: 0,
    recordTotal: 0,
    stats: null,
    showAllPlan: false,
    planAll: [],
    planShown: [],
    removed: [],
    showRemoved: false
  },

  onShow() {
    this.load();
  },

  load() {
    const baby = store.getActiveBaby();
    if (!baby) {
      this.setData({
        hasBaby: false,
        baby: null,
        brief: null,
        care: null,
        lastCare: null,
        planned: [],
        records: [],
        hiddenCount: 0,
        recordTotal: 0
      });
      return;
    }

    const age = dateUtil.calcAge(baby.birthday);
    const months = age.valid ? age.months : 0;
    const raw = store.getVaccineRecords(baby.id);
    const today = dateUtil.todayStr();

    const b = vaccine.brief(raw, months);

    // 事项标签补上样式类
    const activeCare = b.care && b.care.ok && !b.care.done ? b.care : null;
    if (activeCare) {
      activeCare.items = activeCare.items.map(function (it) {
        return Object.assign({}, it, { tagClass: TAG_CLASS[it.tag] || 'care' });
      });
    }

    // 已接种（含今天）按时间倒序；未来日期单独进「待安排」
    const split = vaccine.splitRecords(raw, today);
    const decorated = vaccine.decorate(split.past).map(function (item) {
      const c = item.care;
      return {
        id: item.record.id,
        vaccineId: item.record.vaccineId,
        name: c.ok ? c.vaccine.name : item.record.vaccineId,
        doseText: c.ok ? c.doseText : '第 ' + item.record.dose + ' 剂',
        dateText: c.ok ? c.dateText : item.record.date,
        place: item.record.place || '',
        note: item.record.note || '',
        phaseLabel: c.ok ? c.phaseLabel : '',
        sinceText: c.ok ? c.sinceText : '',
        tone: c.ok ? c.tone : 'done',
        active: c.ok && !c.done,
        catText: c.ok && c.vaccine.custom ? '自定义' : c.ok && c.vaccine.category === 'paid' ? '自费' : '免费'
      };
    });

    // 待安排：按接种日期从近到远
    const planned = vaccine.plannedFor(raw).map(function (item) {
      const c = item.care;
      const parts = String(item.record.date || '').split('-');
      return {
        id: item.record.id,
        vaccineId: item.record.vaccineId,
        name: c.ok ? c.vaccine.name : item.record.vaccineId,
        doseText: c.ok ? c.doseText : '第 ' + item.record.dose + ' 剂',
        day: parts[2] ? String(Number(parts[2])) : '',
        month: parts[1] ? Number(parts[1]) + ' 月' : '',
        whenText: item.whenText,
        days: item.days,
        place: item.record.place || '',
        note: item.record.note || '',
        catText: c.ok && c.vaccine.custom ? '自定义' : '自费'
      };
    });

    // 免疫规划表：默认只看已到月龄和一年内的，避免一屏几十行
    const planAll = b.plan.all.map(function (p) {
      return Object.assign({}, p, {
        // 表格一行放不下全名，用简称避免被省略号截断
        shortName: p.short || p.name,
        statusText:
          p.status === 'done'
            ? '已接种'
            : p.status === 'covered'
            ? '已覆盖'
            : p.status === 'hidden'
            ? '已移除'
            : p.status === 'due'
            ? '该打了'
            : p.status === 'overdue'
            ? '已过建议月龄'
            : p.status === 'soon'
            ? '快到了'
            : '还早',
        dot: p.status === 'done' || p.status === 'covered' ? 'done' : p.status === 'soon' ? 'soon' : ''
      });
    });

    // 被手动移除的那几条，单独收起来，不占主列表
    const removed = planAll.filter(function (p) {
      return p.status === 'hidden';
    });

    // 记录默认只露最近 3 次，其余折叠
    const TOP = 3;
    this._allRecords = decorated;

    this.setData({
      hasBaby: true,
      baby: {
        id: baby.id,
        name: baby.name || '宝宝',
        avatar: baby.avatar || '👶',
        ageText: dateUtil.ageText(age) || '月龄未知'
      },
      months: months,
      brief: b,
      care: activeCare,
      lastCare: b.care && b.care.ok ? b.care : null,
      planned: planned,
      records: decorated.slice(0, TOP),
      recordTotal: decorated.length,
      hiddenCount: Math.max(0, decorated.length - TOP),
      recordsExpanded: false,
      stats: vaccine.stats(raw),
      planAll: planAll,
      removed: removed,
      planShown: this.filterPlan(planAll, this.data.showAllPlan)
    });
  },

  toggleRecords() {
    const all = this._allRecords || [];
    const next = !this.data.recordsExpanded;
    this.setData({
      recordsExpanded: next,
      records: next ? all : all.slice(0, 3)
    });
  },

  filterPlan(list, showAll) {
    return list.filter(function (p) {
      if (p.status === 'hidden') return false; // 移到「已移除」区
      return showAll || p.status !== 'later';
    });
  },

  togglePlan() {
    const next = !this.data.showAllPlan;
    this.setData({
      showAllPlan: next,
      planShown: this.filterPlan(this.data.planAll, next)
    });
  },

  toggleRemoved() {
    this.setData({ showRemoved: !this.data.showRemoved });
  },

  findPlan(key) {
    const list = this.data.planAll || [];
    for (let i = 0; i < list.length; i++) {
      if (list[i].key === key) return list[i];
    }
    return null;
  },

  /** 点规划表的一行：分状态给不同动作 */
  tapPlan(e) {
    const item = this.findPlan(e.currentTarget.dataset.key);
    if (!item) return;
    const that = this;

    if (item.status === 'hidden') {
      this.restorePlan(item);
      return;
    }

    if (item.status === 'done') {
      this.openRecord(item);
      return;
    }

    if (item.status === 'covered') {
      wx.showModal({
        title: '这一针已被覆盖',
        content: '你记录了「' + item.coveredBy + '」，所以' + item.name + '不再单独提醒。想取消的话，删掉那条记录即可。',
        showCancel: false,
        confirmText: '知道了'
      });
      return;
    }

    wx.showActionSheet({
      itemList: ['标记为已接种', '不再提醒这一针'],
      success(res) {
        if (res.tapIndex === 0) {
          that.openRecord(item);
        } else if (res.tapIndex === 1) {
          store.hidePlanItem(item.key);
          wx.showToast({ title: '已从规划表移除', icon: 'none' });
          that.load();
        }
      }
    });
  },

  /** 打开（或新建）这一针对应的接种记录 */
  openRecord(item) {
    const baby = this.data.baby;
    if (!baby) return;

    const records = store.getVaccineRecords(baby.id);
    for (let i = 0; i < records.length; i++) {
      if (records[i].vaccineId === item.vaccineId && records[i].dose === item.dose) {
        wx.navigateTo({ url: '/pages/vaccine-edit/vaccine-edit?id=' + records[i].id });
        return;
      }
    }
    wx.navigateTo({
      url: '/pages/vaccine-edit/vaccine-edit?vaccineId=' + item.vaccineId + '&dose=' + item.dose
    });
  },

  restorePlan(item) {
    store.unhidePlanItem(item.key);
    wx.showToast({ title: '已恢复提醒', icon: 'none' });
    this.load();
  },

  goAdd() {
    const baby = this.data.baby;
    if (!baby) {
      wx.navigateTo({ url: '/pages/baby-edit/baby-edit' });
      return;
    }
    // 把「该打了」里最近的一针带过去，减少一次选择
    const due = this.data.planAll.filter(function (p) {
      return p.status === 'due' || p.status === 'overdue';
    });
    const first = due.length ? due[due.length - 1] : null;
    const q = first ? '?vaccineId=' + first.vaccineId + '&dose=' + first.dose : '';
    wx.navigateTo({ url: '/pages/vaccine-edit/vaccine-edit' + q });
  },

  goEdit(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/vaccine-edit/vaccine-edit?id=' + id });
  },

  goBaby() {
    wx.navigateTo({ url: '/pages/baby-edit/baby-edit' });
  },

  onShareAppMessage() {
    const baby = this.data.baby;
    return {
      title: baby ? baby.name + '的疫苗接种记录' : '疫苗接种与护理记录',
      path: '/pages/vaccine/vaccine'
    };
  },

  onShareTimeline() {
    return { title: '宝宝打完疫苗怎么护理 · 小芽日常' };
  }
});
