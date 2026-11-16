// pages/meal-log/meal-log.js
// 记一餐：哪一餐、吃了什么、吃了多少、吃得怎么样、便便、一句备注
//
// 与「记新食材」的分工：
//   这里记「这一餐」的流水账，一餐一条，用于回顾
//   food-edit 记「某种食材第一次吃 + 有没有反应」，一个食材一条，用于排敏
// 两个方向只允许从排敏台账提醒流水账（吃过但没记排敏），不允许流水账假装台账。
const store = require('../../utils/store.js');
const foodUtil = require('../../utils/food.js');
const dateUtil = require('../../utils/date.js');

Page({
  data: {
    isEdit: false,
    id: '',
    babyName: '',
    today: '',
    date: '',
    slots: foodUtil.LOG_SLOTS,
    slot: 'am',
    recipeId: '',
    recipeName: '',
    // 这一餐吃了哪些，[{ id, name, emoji, allergen }]
    foods: [],
    amounts: foodUtil.AMOUNTS,
    amount: '',
    amountText: '',
    accepts: foodUtil.ACCEPTS,
    accept: 'ok',
    poops: foodUtil.POOPS,
    poop: '',
    note: '',
    canSave: false,
    // 加食材浮层
    sheet: false,
    groups: [],
    group: 'grain',
    lib: []
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

    const base = {
      today: today,
      date: today,
      babyName: baby.name || '宝宝',
      groups: groups
    };

    // 改已有的一餐
    if (options.id) {
      const log = store.getMealLog(options.id);
      if (log) {
        const foods = (log.foods || [])
          .map(function (id) {
            return foodUtil.foodById(id);
          })
          .filter(function (f) {
            return !!f;
          })
          .map(function (f) {
            return { id: f.id, name: f.name, emoji: f.emoji, allergen: !!f.allergen };
          });

        this.setData(
          Object.assign(base, {
            isEdit: true,
            id: log.id,
            date: log.date || today,
            slot: log.slot || 'other',
            recipeId: log.recipeId || '',
            recipeName: log.recipeName || '',
            foods: foods,
            amount: log.amount || '',
            amountText: log.amountText || '',
            accept: log.accept || 'ok',
            poop: log.poop || '',
            note: log.note || '',
            canSave: foods.length > 0
          })
        );
        this.renderLib();
        wx.setNavigationBarTitle({ title: '改这一餐' });
        return;
      }
    }

    // 新增：从「今天吃什么」的「吃了」按钮带进来
    this.setData(
      Object.assign(base, {
        date: options.date || today,
        slot: options.slot || foodUtil.guessSlot(),
        recipeId: options.recipeId || ''
      })
    );

    if (options.recipeId) {
      const r = foodUtil.recipeById(options.recipeId);
      if (r) this.applyRecipe(r);
    }
    // 也可以直接从某个食材进（比如 3 天计划里点某道菜）
    if (options.foodId) this.addById(options.foodId);

    this.renderLib();
  },

  /* ---------- 食材 ---------- */

  /** 按食谱带出菜名与食材，家长可再增减 */
  applyRecipe(r) {
    const foods = (r.foods || [])
      .map(function (id) {
        return foodUtil.foodById(id);
      })
      .filter(function (f) {
        return !!f;
      })
      .map(function (f) {
        return { id: f.id, name: f.name, emoji: f.emoji, allergen: !!f.allergen };
      });
    this.setData({
      recipeId: r.id,
      recipeName: r.name,
      foods: foods,
      canSave: foods.length > 0
    });
  },

  addById(id) {
    const f = foodUtil.foodById(id);
    if (!f) return;
    const foods = this.data.foods.slice();
    for (let i = 0; i < foods.length; i++) {
      if (foods[i].id === f.id) return;
    }
    foods.push({ id: f.id, name: f.name, emoji: f.emoji, allergen: !!f.allergen });
    this.setData({ foods: foods, canSave: true });
  },

  removeFood(e) {
    const id = e.currentTarget.dataset.id;
    const foods = this.data.foods.filter(function (f) {
      return f.id !== id;
    });
    this.setData({ foods: foods, canSave: foods.length > 0 });
  },

  /** 浮层里点一格食材：已选则取消，未选则加上 */
  toggleFood(e) {
    const id = e.currentTarget.dataset.id;
    const has = this.data.foods.some(function (f) {
      return f.id === id;
    });
    if (has) {
      this.removeFood(e);
    } else {
      this.addById(id);
    }
    this.renderLib();
  },

  renderLib() {
    const selected = {};
    this.data.foods.forEach(function (f) {
      selected[f.id] = true;
    });
    const group = this.data.group;

    const lib = foodUtil
      .allFoods()
      .filter(function (f) {
        return f.group === group;
      })
      .map(function (f) {
        return {
          id: f.id,
          name: f.name,
          emoji: f.emoji,
          allergen: !!f.allergen,
          meta: f.allergen ? '过敏原' : f.fromMonth + ' 月起',
          custom: !!f.custom,
          on: !!selected[f.id]
        };
      });

    // 已选的排前面，方便复核这一餐都记了什么
    lib.sort(function (a, b) {
      if (a.on !== b.on) return a.on ? -1 : 1;
      return a.name < b.name ? -1 : 1;
    });

    this.setData({ lib: lib });
  },

  openSheet() {
    this.setData({ sheet: true });
    this.renderLib();
  },

  closeSheet() {
    this.setData({ sheet: false });
  },

  switchGroup(e) {
    const key = e.currentTarget.dataset.key;
    if (key === this.data.group) return;
    this.setData({ group: key });
    this.renderLib();
  },

  /** 阻止浮层上的点击冒泡到遮罩 */
  noop() {},

  /* ---------- 表单 ---------- */

  pickSlot(e) {
    this.setData({ slot: e.currentTarget.dataset.key });
  },

  onDate(e) {
    this.setData({ date: e.detail.value });
  },

  pickAmount(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ amount: this.data.amount === key ? '' : key });
  },

  pickAccept(e) {
    this.setData({ accept: e.currentTarget.dataset.key });
  },

  pickPoop(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ poop: this.data.poop === key ? '' : key });
  },

  onAmountText(e) {
    this.setData({ amountText: e.detail.value });
  },

  onNote(e) {
    this.setData({ note: e.detail.value });
  },

  /* ---------- 保存 / 删除 ---------- */

  save() {
    const baby = store.getActiveBaby();
    if (!baby) return;

    const foods = this.data.foods;
    if (!foods.length) {
      wx.showToast({ title: '先选吃了什么', icon: 'none' });
      return;
    }

    store.upsertMealLog({
      id: this.data.id || undefined,
      babyId: baby.id,
      date: this.data.date || this.data.today,
      slot: this.data.slot,
      recipeId: this.data.recipeId,
      recipeName: this.data.recipeName,
      foods: foods.map(function (f) {
        return f.id;
      }),
      amount: this.data.amount,
      amountText: this.data.amountText,
      accept: this.data.accept,
      poop: this.data.poop,
      note: this.data.note
    });

    // 这一餐里还有哪些食材没做过正式排敏记录
    const tracked = {};
    store.getFoodRecords(baby.id).forEach(function (r) {
      if (r && r.foodId) tracked[r.foodId] = true;
    });
    const left = foods.filter(function (f) {
      return !tracked[f.id];
    }).length;

    let title = this.data.isEdit ? '已更新' : '已记录';
    if (left) title = (this.data.isEdit ? '已更新' : '已记录') + '，' + left + ' 种待补排敏';

    wx.showToast({ title: title, icon: 'none' });
    setTimeout(function () {
      wx.navigateBack();
    }, 700);
  },

  remove() {
    const that = this;
    wx.showModal({
      title: '删除这一餐',
      content: '只删这条进食记录，对应的排敏记录不受影响。确定删除吗？',
      confirmText: '删除',
      confirmColor: '#D9603F',
      success(res) {
        if (!res.confirm) return;
        store.removeMealLog(that.data.id);
        wx.showToast({ title: '已删除', icon: 'none' });
        setTimeout(function () {
          wx.navigateBack();
        }, 500);
      }
    });
  }
});
