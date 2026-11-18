// pages/food/food.js
// 辅食主页：该加什么 / 正在排敏什么 / 今天吃什么 / 接着三天吃什么 / 最近吃了什么
const store = require('../../utils/store.js');
const foodUtil = require('../../utils/food.js');
const vaccineUtil = require('../../utils/vaccine.js');
const dateUtil = require('../../utils/date.js');

/** 计划跨度：今天 + 明天 + 后天 */
const PLAN_DAYS = 3;
const PLAN_LABEL = ['今天', '明天', '后天'];

const STATUS_FLAG = {
  tried: { text: '已试', cls: 'flag-ok' },
  watching: { text: '观察中', cls: 'flag-watch' },
  allergy: { text: '过敏', cls: 'flag-bad' },
  hidden: { text: '不想试', cls: 'flag-mute' },
  due: { text: '可以加', cls: 'flag-due' },
  later: { text: '', cls: '' }
};

Page({
  data: {
    hasBaby: false,
    baby: null,
    months: 0,
    monthText: '',
    ready: null,
    stage: null,
    brief: null,
    // 接种期就餐约束
    diet: null,
    // 排敏
    watching: [],
    conflict: false,
    // 今天吃什么
    todayMenu: [],
    todayLabel: '',
    today: '',
    // 接着三天（不含今天）
    planNext: [],
    // 一周餐单
    week: null,
    weekOpen: false,
    // 进食流水账
    logs: [],
    logTotal: 0,
    // 吃过但没记排敏
    untracked: [],
    // 当季食材
    seasonText: '',
    // 待尝试
    due: [],
    hiddenCount: 0,
    // 已尝试
    records: [],
    recordTotal: 0,
    triedExpanded: false,
    // 统计
    stats: null,
    allergens: [],
    // 食材库
    lib: [],
    libOpen: false,
    // 食谱浮层
    sheet: false,
    recipe: null
  },

  onLoad() {
    this.load();
  },

  onShow() {
    this.load();
  },

  onPullDownRefresh() {
    this.load();
    wx.stopPullDownRefresh();
  },

  load() {
    const baby = store.getActiveBaby();
    if (!baby) {
      this.setData({ hasBaby: false, baby: null });
      return;
    }

    const today = dateUtil.todayStr();
    const age = dateUtil.calcAge(baby.birthday);
    const months = age.valid ? age.months : 0;

    const records = store.getFoodRecords(baby.id);
    const hidden = store.getFoodHidden(baby.id);
    const swaps = store.getMenuSwap(baby.id);
    const mealLogs = store.getMealLogs(baby.id);

    // 接种后 72 小时收紧餐单。疫苗知识不进引擎（food.js 不 require vaccine.js），
    // 这里算好 diet 标记再作为 opts 注入，保持引擎零外部依赖。
    const dietFlag = vaccineUtil.dietFlagFor(store.getVaccineRecords(baby.id), Date.now(), today);
    const opts = foodUtil.normalizeOpts({ diet: dietFlag.active ? dietFlag.level : 'none', season: true });

    const stage = foodUtil.stageFor(months);
    const focus = foodUtil.focusFor(months);
    const ready = foodUtil.readyFor(months);
    const watch = foodUtil.watchFor(records, today);
    const analysis = foodUtil.analyze(records, hidden, months, today);
    const stats = foodUtil.stats(records, months, today);
    const decorated = foodUtil.decorate(records, today);

    // 一周餐单只算一次；3 天窗口按「日期 → 所在周」切片复用，
    // 只有窗口跨周时才补算下一周（种子不变，所以同一天永远是同一道菜）
    const weekRaw = foodUtil.menuFor(months, baby.id, today, swaps, today, records, opts);
    const weeks = {};
    weeks[weekRaw.weekStart] = weekRaw;
    for (let i = 0; i < PLAN_DAYS; i++) {
      const d = dateUtil.shiftDate(today, i);
      const ws = dateUtil.weekStartStr(d);
      if (!weeks[ws]) weeks[ws] = foodUtil.menuFor(months, baby.id, ws, swaps, today, records, opts);
    }
    const planRaw = foodUtil.slicePlan(weeks, today, PLAN_DAYS);

    const mealsOf = function (day) {
      return day.meals.map(function (m) {
        const reasons = m.reasons || [];
        return {
          slotKey: m.slot.key,
          label: m.slot.label,
          recipeId: m.recipe ? m.recipe.id : '',
          name: m.recipe ? m.recipe.name : '暂无合适食谱',
          emoji: m.recipe ? m.recipe.emoji : '🍽',
          minutes: m.recipe ? m.recipe.minutes : 0,
          texture: m.recipe ? m.recipe.texture : '',
          newText: (m.newAllergens || []).join('、'),
          reasons: reasons,
          reasonText: reasons[0] || ''
        };
      });
    };

    const todayMenu = mealsOf(planRaw.days[0]);

    const planNext = planRaw.days.slice(1).map(function (d, i) {
      return {
        date: d.date,
        label: PLAN_LABEL[i + 1] || i + 2 + ' 天后',
        weekday: d.weekday,
        dayOfMonth: d.dayOfMonth,
        meals: mealsOf(d)
      };
    });

    // 一周餐单（与计划共用同一份计算结果）
    const week = {
      weekStart: weekRaw.weekStart,
      weekEnd: weekRaw.weekEnd,
      note: weekRaw.note,
      days: weekRaw.days.map(function (d) {
        return {
          date: d.date,
          weekday: d.weekday,
          dayOfMonth: d.dayOfMonth,
          isToday: d.isToday,
          meals: d.meals.map(function (m) {
            return {
              slotKey: m.slot.key,
              label: m.slot.label,
              recipeId: m.recipe ? m.recipe.id : '',
              name: m.recipe ? m.recipe.name : '—'
            };
          })
        };
      })
    };

    // 进食流水账
    const decoratedLogs = foodUtil.decorateMealLogs(mealLogs, today);
    const eaten = foodUtil.eatenMap(mealLogs);
    const untracked = foodUtil.untrackedFoods(mealLogs, records, hidden, today, 7);

    // 当季：只做提示，不参与任何过滤
    const monthNum = dateUtil.monthNumber(today);
    const seasonNow = foodUtil.seasonOf(monthNum);
    const seasonFoods = foodUtil.inSeasonFoods(monthNum, months).slice(0, 6);
    const seasonText = seasonFoods.length
      ? monthNum + ' 月当季' + (seasonNow ? '（' + seasonNow.label + '）' : '') + '：' +
        seasonFoods.map(function (f) { return f.name; }).join('、') + '　· 北方露地参考'
      : '';

    const diet = dietFlag.active
      ? {
          level: dietFlag.level,
          title: dietFlag.phaseLabel + ' · ' + dietFlag.vaccineShort + dietFlag.doseText,
          desc: dietFlag.note,
          foot: '接着三天的餐单已自动收紧，' + dietFlag.untilText + '恢复'
        }
      : null;

    // 待尝试
    const due = foodUtil.dueFoods(months, records, hidden, today).slice(0, 6).map(function (f) {
      const al = f.allergenGroup ? foodUtil.ALLERGENS.filter(function (a) {
        return a.key === f.allergenGroup;
      })[0] : null;
      return {
        id: f.id,
        name: f.name,
        emoji: f.emoji,
        fromMonth: f.fromMonth,
        ironRich: !!f.ironRich,
        allergenName: al ? al.name : '',
        custom: !!f.custom
      };
    });

    // 食材库
    const libMap = {};
    analysis.list.forEach(function (x) {
      if (!libMap[x.food.group]) libMap[x.food.group] = [];
      const flag = STATUS_FLAG[x.status] || STATUS_FLAG.later;
      libMap[x.food.group].push({
        id: x.food.id,
        name: x.food.name,
        fromMonth: x.food.fromMonth,
        flagText: flag.text || x.food.fromMonth + ' 月起',
        flagCls: flag.cls,
        custom: !!x.food.custom,
        // 流水账里出现过就算「吃过」，与排敏台账的状态并列显示
        eaten: !!eaten[x.food.id]
      });
    });
    const lib = foodUtil.GROUP_ORDER.filter(function (g) {
      return libMap[g] && libMap[g].length;
    }).map(function (g) {
      const items = libMap[g].slice().sort(function (a, b) {
        return a.fromMonth - b.fromMonth;
      });
      return { key: g, label: foodUtil.groupLabel(g), count: items.length, items: items };
    });

    const TOP = 3;

    this._allRecords = decorated;
    this._records = records;
    this._swaps = swaps;
    this._today = today;
    this._opts = opts;

    this.setData({
      hasBaby: true,
      baby: {
        id: baby.id,
        name: baby.name || '宝宝',
        avatar: baby.avatar || '👶',
        ageText: dateUtil.ageText(age)
      },
      months: months,
      monthText: foodUtil.monthLabel(months),
      ready: ready,
      stage: ready
        ? null
        : {
            key: stage.key,
            label: stage.label,
            tag: stage.tag,
            // 性状与餐次用「逐月」的值覆盖粗档的值
            texture: focus.texture,
            meals: focus.meals,
            milk: stage.milk,
            portion: stage.portion,
            iron: stage.iron,
            tips: stage.tips,
            avoid: stage.avoid,
            focus: {
              at: focus.at,
              exact: focus.exact,
              title: focus.title,
              text: focus.focus,
              key: focus.key,
              nextNames: focus.next
                .map(function (id) {
                  const f = foodUtil.foodById(id);
                  return f ? f.name : '';
                })
                .filter(function (n) {
                  return !!n;
                })
                .slice(0, 4)
                .join('、')
            }
          },
      brief: foodUtil.brief(records, months, today, hidden),
      watching: watch.map(function (w) {
        return {
          id: w.record.id,
          name: w.food.name,
          emoji: w.food.emoji,
          dayIndex: w.dayIndex,
          leftDays: w.leftDays,
          endDate: w.endDate,
          endText: foodUtil.dateText(w.endDate)
        };
      }),
      conflict: watch.length > 1,
      diet: diet,
      todayMenu: todayMenu,
      todayLabel: dateUtil.formatCN(dateUtil.parseDate(today)),
      today: today,
      planNext: planNext,
      week: week,
      logs: decoratedLogs.slice(0, 3),
      logTotal: decoratedLogs.length,
      untracked: untracked,
      seasonText: seasonText,
      due: due,
      hiddenCount: hidden.length,
      records: decorated.slice(0, TOP),
      recordTotal: decorated.length,
      triedExpanded: false,
      stats: stats,
      allergens: foodUtil.allergenProgress(records),
      lib: lib
    });
  },

  /* ---------- 导航 ---------- */

  goBaby() {
    wx.navigateTo({ url: '/pages/baby-edit/baby-edit' });
  },

  goAdd() {
    wx.navigateTo({ url: '/pages/food-edit/food-edit' });
  },

  /** 从「待尝试」或「食材库」点某个食材直接去记录 */
  goAddFood(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/food-edit/food-edit?foodId=' + id });
  },

  /** 已有的记录点进去改 */
  goEdit(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/food-edit/food-edit?id=' + id });
  },

  /** 记一餐 */
  goLog() {
    wx.navigateTo({ url: '/pages/meal-log/meal-log' });
  },

  /** 某一道菜吃掉了：把日期、餐次、食谱带进记录页预填 */
  goLogMeal(e) {
    const d = e.currentTarget.dataset;
    let url = '/pages/meal-log/meal-log?date=' + (d.date || '');
    if (d.slot) url += '&slot=' + d.slot;
    if (d.id) url += '&recipeId=' + d.id;
    wx.navigateTo({ url: url });
  },

  /** 改某一餐 */
  goLogEdit(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/meal-log/meal-log?id=' + id });
  },

  /* ---------- 交互 ---------- */

  toggleWeek() {
    this.setData({ weekOpen: !this.data.weekOpen });
  },

  toggleTried() {
    const all = this._allRecords || [];
    const next = !this.data.triedExpanded;
    this.setData({
      triedExpanded: next,
      records: next ? all : all.slice(0, 3)
    });
  },

  toggleLib() {
    this.setData({ libOpen: !this.data.libOpen });
  },

  /** 待尝试里「先不试这一种」 */
  skipFood(e) {
    const id = e.currentTarget.dataset.id;
    const baby = this.data.baby;
    if (!baby) return;
    store.hideFood(baby.id, id);
    wx.showToast({ title: '已跳过', icon: 'none' });
    this.load();
  },

  /** 恢复所有被跳过的 */
  restoreHidden() {
    const baby = this.data.baby;
    if (!baby) return;
    store.clearFoodHidden(baby.id);
    wx.showToast({ title: '已恢复', icon: 'none' });
    this.load();
  },

  /** 今天吃什么：换一道 */
  swapMeal(e) {
    const slotKey = e.currentTarget.dataset.slot;
    const baby = this.data.baby;
    if (!baby || !slotKey) return;

    let current = '';
    for (let i = 0; i < this.data.todayMenu.length; i++) {
      if (this.data.todayMenu[i].slotKey === slotKey) current = this.data.todayMenu[i].recipeId;
    }

    const alt = foodUtil.altRecipe(this.data.months, slotKey, current, this._today, this._records, this._opts);
    if (!alt) {
      wx.showToast({ title: '没有别的做法了', icon: 'none' });
      return;
    }

    store.setMenuSwap(baby.id, this._today + '#' + slotKey, alt.id);
    wx.showToast({ title: '已换一道', icon: 'none' });
    this.load();
  },

  /* ---------- 食谱浮层 ---------- */

  openRecipe(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    const r = foodUtil.recipeById(id);
    if (!r) return;

    const names = (r.foods || []).map(function (fid) {
      const f = foodUtil.foodById(fid);
      return f ? f.name : fid;
    });

    this.setData({
      sheet: true,
      recipe: {
        id: r.id,
        name: r.name,
        emoji: r.emoji,
        fromMonth: r.fromMonth,
        toMonth: r.toMonth,
        minutes: r.minutes,
        texture: r.texture,
        mealText:
          r.meal === 'breakfast'
            ? '早餐'
            : r.meal === 'lunch'
            ? '午餐'
            : r.meal === 'dinner'
            ? '晚餐'
            : r.meal === 'snack'
            ? '加餐'
            : '任意一餐',
        foods: names,
        steps: r.steps || [],
        tips: r.tips || ''
      }
    });
  },

  closeSheet() {
    this.setData({ sheet: false, recipe: null });
  },

  /** 阻止浮层上的点击冒泡到遮罩 */
  noop() {},

  /** 打开食谱浮层时转发的是这道菜；否则转发这一阶段的辅食安排 */
  onShareAppMessage() {
    const r = this.data.sheet && this.data.recipe;
    if (r) {
      return {
        title: r.name + '（' + (r.fromMonth || 6) + ' 月起）· 做法和要点',
        path: '/pages/food/food'
      };
    }
    const label = this.data.monthText;
    return {
      title: label ? label + '宝宝今天吃什么？一周辅食这样排' : '宝宝辅食怎么加 · 小芽日常',
      path: '/pages/food/food'
    };
  },

  onShareTimeline() {
    return { title: '宝宝辅食一周怎么排 · 小芽日常' };
  }
});
