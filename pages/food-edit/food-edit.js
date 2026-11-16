// pages/food-edit/food-edit.js
// 记一次新食材尝试：选食材 → 选日期 → 选反应 → 备注
const store = require('../../utils/store.js');
const foodUtil = require('../../utils/food.js');
const dateUtil = require('../../utils/date.js');

const TONE_CLASS = {
  ok: 'rxn-ok',
  watch: 'rxn-watch',
  warn: 'rxn-warn',
  danger: 'rxn-danger'
};

Page({
  data: {
    isEdit: false,
    id: '',
    babyName: '',
    today: '',
    groups: [],
    group: 'grain',
    list: [],
    selectedId: '',
    selected: null,
    reactions: [],
    reaction: 'none',
    reactionDetail: null,
    reactionNote: '',
    note: '',
    date: '',
    canSave: false,
    // 现在还有别的食材在观察中
    watching: null,
    // 自定义食材浮层
    sheet: false,
    cName: '',
    cGroup: 'veg',
    cMonth: 6,
    cNote: '',
    cGroups: [],
    customList: [],
    monthOptions: [6, 7, 8, 9, 10, 12, 18, 24]
  },

  onLoad(opts) {
    const options = opts || {};
    const baby = store.getActiveBaby();
    if (!baby) {
      wx.showToast({ title: '请先添加宝宝', icon: 'none' });
      setTimeout(function () {
        wx.navigateBack();
      }, 800);
      return;
    }

    const today = dateUtil.todayStr();
    const groups = foodUtil.GROUP_ORDER.map(function (g) {
      return { key: g, label: foodUtil.groupLabel(g) };
    });

    const reactions = foodUtil.REACTIONS.map(function (r) {
      return {
        key: r.key,
        label: r.label,
        short: r.short,
        desc: r.desc,
        next: r.next,
        tone: r.tone,
        cls: TONE_CLASS[r.tone] || 'rxn-ok'
      };
    });

    const watch = foodUtil.watchFor(store.getFoodRecords(baby.id), today);

    const base = {
      today: today,
      date: today,
      babyName: baby.name || '宝宝',
      groups: groups,
      reactions: reactions,
      cGroups: groups,
      watching: watch.length ? { name: watch[0].food.name, dayIndex: watch[0].dayIndex } : null
    };

    // 编辑已有记录
    if (options.id) {
      const all = store.getFoodRecords(baby.id);
      let rec = null;
      for (let i = 0; i < all.length; i++) {
        if (all[i].id === options.id) {
          rec = all[i];
          break;
        }
      }
      if (rec) {
        const f = foodUtil.foodById(rec.foodId);
        this.setData(
          Object.assign(base, {
            isEdit: true,
            id: rec.id,
            group: f ? f.group : 'veg',
            selectedId: rec.foodId,
            date: rec.date || today,
            reaction: rec.reaction || 'none',
            reactionNote: rec.reactionNote || '',
            note: rec.note || ''
          })
        );
        this.applyReaction(rec.reaction || 'none');
        this.renderList();
        // 编辑态要把原来那项选上，否则保存会被「先选一种食材」拦住
        this.pick({ currentTarget: { dataset: { id: rec.foodId } } });
        wx.setNavigationBarTitle({ title: '编辑尝试记录' });
        return;
      }
    }

    this.setData(base);

    // 从主页「待尝试」点进来的食材
    if (options.foodId) {
      const f = foodUtil.foodById(options.foodId);
      if (f) {
        this.setData({ group: f.group });
        this.renderList();
        this.pick({ currentTarget: { dataset: { id: options.foodId } } });
        return;
      }
    }

    this.renderList();
  },

  /** 渲染当前分组的食材网格 */
  renderList() {
    const baby = store.getActiveBaby();
    const records = baby ? store.getFoodRecords(baby.id) : [];
    const idx = foodUtil.indexRecords(records);
    const group = this.data.group;
    const selectedId = this.data.selectedId;

    const list = foodUtil
      .allFoods()
      .filter(function (f) {
        return f.group === group;
      })
      .map(function (f) {
        const rec = idx[f.id];
        const last = rec ? rec.last : null;
        let flag = '';
        if (last) {
          flag = foodUtil.isFailed(last.reaction) ? '过敏' : '已试过';
        }
        return {
          id: f.id,
          name: f.name,
          short: f.name,
          emoji: f.emoji,
          fromMonth: f.fromMonth,
          tried: !!last,
          flag: flag,
          failed: last ? foodUtil.isFailed(last.reaction) : false,
          custom: !!f.custom,
          on: f.id === selectedId
        };
      });

    // 已试过的排到后面，没试过的按起始月龄排
    list.sort(function (a, b) {
      if (a.tried !== b.tried) return a.tried ? 1 : -1;
      if (a.fromMonth !== b.fromMonth) return a.fromMonth - b.fromMonth;
      return a.name < b.name ? -1 : 1;
    });

    this.setData({ list: list });
  },

  switchGroup(e) {
    const key = e.currentTarget.dataset.key;
    if (key === this.data.group) return;
    this.setData({ group: key });
    this.renderList();
  },

  pick(e) {
    const id = e.currentTarget.dataset.id;
    const food = foodUtil.foodById(id);
    if (!food) return;

    const allergen = food.allergenGroup
      ? foodUtil.ALLERGENS.filter(function (a) {
          return a.key === food.allergenGroup;
        })[0]
      : null;

    const baby = store.getActiveBaby();
    const idx = baby ? foodUtil.indexRecords(store.getFoodRecords(baby.id)) : {};
    const rec = idx[id];
    const last = rec ? rec.last : null;

    this.setData({
      selectedId: id,
      selected: {
        id: food.id,
        name: food.name,
        emoji: food.emoji,
        groupLabel: foodUtil.groupLabel(food.group),
        fromMonth: food.fromMonth,
        how: food.how,
        note: food.note,
        ironRich: !!food.ironRich,
        allergenName: allergen ? allergen.name : '',
        allergenTip: allergen ? allergen.tip : '',
        custom: !!food.custom,
        lastText: last ? foodUtil.dateText(last.date) + ' 记过一次' : '',
        lastFailed: last ? foodUtil.isFailed(last.reaction) : false
      },
      canSave: true
    });
    this.renderList();
  },

  pickReaction(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ reaction: key });
    this.applyReaction(key);
  },

  applyReaction(key) {
    const found = this.data.reactions.filter(function (r) {
      return r.key === key;
    })[0];
    this.setData({ reactionDetail: found || null });
  },

  onReactionNote(e) {
    this.setData({ reactionNote: e.detail.value });
  },

  onDate(e) {
    this.setData({ date: e.detail.value });
  },

  onNote(e) {
    this.setData({ note: e.detail.value });
  },

  save() {
    if (!this.data.canSave || !this.data.selectedId) {
      wx.showToast({ title: '先选一种食材', icon: 'none' });
      return;
    }

    const baby = store.getActiveBaby();
    if (!baby) return;

    store.upsertFoodRecord({
      id: this.data.id || undefined,
      babyId: baby.id,
      foodId: this.data.selectedId,
      date: this.data.date || this.data.today,
      reaction: this.data.reaction || 'none',
      reactionNote: (this.data.reactionNote || '').trim(),
      note: (this.data.note || '').trim()
    });

    const r = this.data.reaction;
    let title = '已记录';
    if (this.data.isEdit) title = '已更新';
    else if (r === 'severe') title = '已记录，请尽快就医';
    else if (r === 'allergy') title = '已记录，先停这种食材';
    else if (r === 'none') title = '已记录，观察 2 天';

    wx.showToast({ title: title, icon: this.data.isEdit ? 'success' : 'none' });
    setTimeout(function () {
      wx.navigateBack();
    }, 700);
  },

  remove() {
    const that = this;
    wx.showModal({
      title: '删除这条记录',
      content: '删除后这种食材会重新出现在「待尝试」里。确定删除吗？',
      confirmText: '删除',
      confirmColor: '#D9603F',
      success(res) {
        if (!res.confirm) return;
        store.removeFoodRecord(that.data.id);
        wx.showToast({ title: '已删除', icon: 'none' });
        setTimeout(function () {
          wx.navigateBack();
        }, 500);
      }
    });
  },

  /* ---------- 自定义食材 ---------- */

  openSheet() {
    this.setData({
      sheet: true,
      cName: '',
      cGroup: this.data.group || 'veg',
      cMonth: 6,
      cNote: '',
      customList: store.getCustomFoods()
    });
  },

  closeSheet() {
    this.setData({ sheet: false });
  },

  /** 阻止浮层上的点击冒泡到遮罩 */
  noop() {},

  onCName(e) {
    this.setData({ cName: e.detail.value });
  },

  onCNote(e) {
    this.setData({ cNote: e.detail.value });
  },

  pickCGroup(e) {
    this.setData({ cGroup: e.currentTarget.dataset.key });
  },

  pickCMonth(e) {
    this.setData({ cMonth: Number(e.currentTarget.dataset.m) });
  },

  saveCustom() {
    const name = (this.data.cName || '').trim();
    if (!name) {
      wx.showToast({ title: '先填食材名称', icon: 'none' });
      return;
    }

    const item = store.addCustomFood({
      name: name,
      group: this.data.cGroup,
      fromMonth: this.data.cMonth,
      note: (this.data.cNote || '').trim()
    });
    if (!item) {
      wx.showToast({ title: '保存失败，换个名字试试', icon: 'none' });
      return;
    }

    this.setData({ sheet: false, group: item.group });
    this.renderList();
    this.pick({ currentTarget: { dataset: { id: item.id } } });
    wx.showToast({ title: '已添加', icon: 'success' });
  },

  removeCustom(e) {
    const id = e.currentTarget.dataset.id;
    const that = this;
    const list = this.data.customList || [];
    let target = null;
    for (let i = 0; i < list.length; i++) {
      if (list[i].id === id) {
        target = list[i];
        break;
      }
    }
    if (!target) return;

    const baby = store.getActiveBaby();
    const used = baby
      ? store.getFoodRecords(baby.id).filter(function (r) {
          return r.foodId === id;
        }).length
      : 0;

    wx.showModal({
      title: '删除「' + target.name + '」',
      content: used
        ? '这个食材已有 ' + used + ' 条尝试记录，删除会一并清除。确定删除吗？'
        : '删除后可以重新添加。确定删除吗？',
      confirmText: '删除',
      confirmColor: '#D9603F',
      success(res) {
        if (!res.confirm) return;
        store.removeCustomFood(id);
        that.setData({
          customList: store.getCustomFoods(),
          selectedId: that.data.selectedId === id ? '' : that.data.selectedId,
          selected: that.data.selectedId === id ? null : that.data.selected,
          canSave: that.data.selectedId === id ? false : that.data.canSave
        });
        that.renderList();
        wx.showToast({ title: '已删除', icon: 'none' });
      }
    });
  }
});
