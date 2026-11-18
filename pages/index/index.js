// pages/index/index.js
const dateUtil = require('../../utils/date.js');
const guideUtil = require('../../utils/guide.js');
const clothing = require('../../utils/clothing.js');
const store = require('../../utils/store.js');
const weatherApi = require('../../utils/weather.js');
const placeUtil = require('../../utils/place.js');
const vaccine = require('../../utils/vaccine.js');
const foodUtil = require('../../utils/food.js');
const care = require('../../utils/care.js');
const careActions = require('../../utils/care-actions.js');

/** 首页照护状态：距上次喂奶、睡眠、今天尿布，外加进行中的计时 */
function careState(baby, months) {
  const now = Date.now();
  const today = dateUtil.todayStr();
  const from = care.dayStart(today);
  const sum = care.summarize(store.getCareRange(baby.id, from, from + care.DAY), today, months, now);
  const latest = {
    feed: store.getLatestCare(baby.id, 'feed'),
    sleep: store.getLatestCare(baby.id, 'sleep'),
    diaper: store.getLatestCare(baby.id, 'diaper')
  };
  const st = care.status(latest, store.getCareActive(baby.id), sum, now);
  return { careLines: st.lines, careActive: st.active, careAlert: st.alert };
}

/**
 * 首页「一键记一餐」：取当前餐次在今天餐单里的推荐食谱
 * 参数与辅食页完全一致（同种子、同换菜、同接种期约束），保证两边看到的是同一道菜
 */
function suggestMeal(baby, months) {
  if (foodUtil.readyFor(months)) return null; // 未满 6 月龄，还没开始辅食
  const today = dateUtil.todayStr();
  const records = store.getFoodRecords(baby.id);
  const dietFlag = vaccine.dietFlagFor(store.getVaccineRecords(baby.id), Date.now(), today);
  const opts = foodUtil.normalizeOpts({ diet: dietFlag.active ? dietFlag.level : 'none', season: true });
  const week = foodUtil.menuFor(months, baby.id, today, store.getMenuSwap(baby.id), today, records, opts);
  const day = (week.days || []).filter(function (d) {
    return d.date === today;
  })[0];
  if (!day || !day.meals || !day.meals.length) return null;

  // 当前时间对应的餐次；该阶段没有这一餐（比如 6 月龄没有加餐）就取下一顿
  const order = ['am', 'noon', 'pm', 'eve'];
  const guess = foodUtil.guessSlot();
  const start = Math.max(0, order.indexOf(guess));
  let meal = null;
  for (let i = start; i < order.length && !meal; i++) {
    meal = day.meals.filter(function (m) {
      return m.slot.key === order[i] && m.recipe;
    })[0];
  }
  if (!meal) meal = day.meals[day.meals.length - 1];
  if (!meal || !meal.recipe) return null;

  // 这一餐今天已经记过，就不再催
  const logged = store.getMealLogsByDate(baby.id, today).some(function (l) {
    return l.slot === meal.slot.key;
  });

  return {
    date: today,
    slot: meal.slot.key,
    slotLabel: meal.slot.label,
    recipeId: meal.recipe.id,
    name: meal.recipe.name,
    emoji: meal.recipe.emoji || '🥣',
    logged: logged
  };
}

/** 首页「最近记的」：把三类记录合成一条时间线，只取最近几条 */
function recentRecords(babyId, limit) {
  const items = [];

  store.getMealLogs(babyId).forEach(function (l) {
    const names = (l.foods || [])
      .map(function (id) {
        const f = foodUtil.foodById(id);
        return f ? f.name : '';
      })
      .filter(Boolean);
    items.push({
      id: 'meal-' + l.id,
      kind: 'meal',
      rid: l.id,
      emoji: '🥣',
      title: foodUtil.slotLabelOf(l.slot) + (l.recipeName ? ' · ' + l.recipeName : ''),
      desc: names.length ? names.slice(0, 3).join('、') : l.note || '记了一餐',
      date: l.date,
      ts: l.createdAt || 0
    });
  });

  store.getFoodRecords(babyId).forEach(function (r) {
    const f = foodUtil.foodById(r.foodId);
    const re = foodUtil.reactionOf(r.reaction);
    items.push({
      id: 'food-' + r.id,
      kind: 'food',
      rid: r.id,
      emoji: '🥕',
      title: '新食材 · ' + (f ? f.name : '未知食材'),
      desc: re && re.label ? re.label : '已记录',
      date: r.date,
      ts: r.createdAt || 0
    });
  });

  store.getVaccineRecords(babyId).forEach(function (r) {
    const v = vaccine.getVaccine(r.vaccineId);
    items.push({
      id: 'vax-' + r.id,
      kind: 'vax',
      rid: r.id,
      emoji: '💉',
      title: (v ? v.name : '疫苗') + (r.dose ? ' 第 ' + r.dose + ' 针' : ''),
      desc: r.place || '接种记录',
      date: r.date,
      ts: r.createdAt || 0
    });
  });

  items.sort(function (a, b) {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return b.ts - a.ts;
  });

  const today = dateUtil.todayStr();
  return items.slice(0, limit).map(function (it) {
    it.when = it.date === today ? '今天' : String(it.date || '').slice(5).replace('-', '/');
    return it;
  });
}

Page(Object.assign({}, careActions.methods, {
  data: Object.assign({}, careActions.data, {
    careLines: [],
    careAlert: null,
    greeting: '',
    dateText: '',
    baby: null,
    babies: [],
    tips: [],
    ageLabel: '',
    ageMonths: 0,
    weather: null,
    care: null,
    weatherState: 'loading',
    targetNames: '',
    vax: null,
    recent: [],
    suggest: null,
    manualTemp: false
  }),

  onShow() {
    this.refresh();
    this.startCareTick();
  },

  onHide() {
    this.stopCareTick();
  },

  onUnload() {
    this.stopCareTick();
  },

  /** 正在计时时每 30 秒刷新一次「已 xx 分钟」；没在计时就不跑定时器 */
  startCareTick() {
    this.stopCareTick();
    const that = this;
    this._careTimer = setInterval(function () {
      const a = that.data.careActive;
      if (a && (a.feed || a.sleep)) that.refreshCare();
    }, 30000);
  },

  stopCareTick() {
    if (this._careTimer) clearInterval(this._careTimer);
    this._careTimer = null;
  },

  /** care-actions 的回调：记录动作完成后只刷新照护相关部分 */
  refreshCare() {
    const baby = store.getActiveBaby();
    if (!baby) return;
    const age = dateUtil.calcAge(baby.birthday);
    this.setData(careState(baby, age.valid ? age.months : 0));
  },

  onPullDownRefresh() {
    // 真刷新：天气回来（成功或失败）才收起
    Promise.resolve(this.refresh(true)).then(function () {
      wx.stopPullDownRefresh();
    });
  },

  refresh(force) {
    const babies = store.getBabies();
    const baby = store.getActiveBaby();
    const targets = store.getPushTargets();
    const targetNames = targets
      .map(function (t) {
        return t.relation || t.name;
      })
      .join('、');

    const patch = {
      greeting: dateUtil.greeting(),
      dateText: dateUtil.formatCN(),
      babies: babies,
      targetNames: targetNames
    };

    if (!baby) {
      patch.baby = null;
      patch.tips = [];
      patch.ageLabel = '';
      patch.weather = null;
      patch.care = null;
      patch.vax = null;
      patch.recent = [];
      patch.suggest = null;
      patch.weatherState = 'no-baby';
      this.setData(patch);
      return Promise.resolve();
    }

    const age = dateUtil.calcAge(baby.birthday);
    const months = age.valid ? age.months : 0;
    const meta = [];
    if (baby.birthday) meta.push(baby.birthday.replace(/-/g, '/') + ' 出生');
    if (baby.weight) meta.push(baby.weight + ' kg');
    if (baby.height) meta.push(baby.height + ' cm');

    patch.baby = {
      id: baby.id,
      name: baby.name || '宝宝',
      avatar: baby.avatar || '👶',
      genderText: baby.gender === 'girl' ? '女宝' : '男宝',
      ageText: dateUtil.ageText(age) || '月龄未知',
      metaText: meta.join(' · ')
    };
    patch.ageMonths = months;
    patch.ageLabel = guideUtil.getSegmentLabel(months);
    patch.tips = guideUtil.getTips(months);

    // 疫苗卡片：正在观察期就给护理提示，否则提醒该打什么
    const vaxBrief = vaccine.brief(store.getVaccineRecords(baby.id), months);
    patch.vax = {
      tone: vaxBrief.tone,
      emoji: vaxBrief.type === 'care' ? '🩹' : vaxBrief.type === 'due' ? '💉' : '🗓',
      title: vaxBrief.title,
      desc: vaxBrief.desc
    };

    patch.recent = recentRecords(baby.id, 3);
    Object.assign(patch, careState(baby, months));
    try {
      patch.suggest = suggestMeal(baby, months);
    } catch (e) {
      // 推荐失败不影响首页其它内容
      console.warn('[index] 推荐餐生成失败', e && e.message);
      patch.suggest = null;
    }

    this.setData(patch);
    return this.loadWeather(months, force);
  },

  /** 天气优先级：今天手动填过的温度 → 实时天气 → 失败引导手动填 */
  loadWeather(months, force) {
    const that = this;
    const manualTemp = store.getManualTemp();
    const hasPlace = placeUtil.hasCoords(store.getPlace());

    if (manualTemp !== null && (!force || !hasPlace)) {
      that.applyWeather(weatherApi.buildManual(manualTemp), months);
      return Promise.resolve();
    }

    if (!hasPlace) {
      this.setData({ weatherState: 'no-place', weather: null, care: null });
      return Promise.resolve();
    }

    this.setData({ weatherState: 'loading' });

    return weatherApi
      .getWeather({ force: !!force })
      .then(function (w) {
        if (manualTemp !== null) store.clearManualTemp();
        that.applyWeather(w, months);
      })
      .catch(function (err) {
        console.warn('[index] 天气获取失败：', err && err.message);
        if (manualTemp !== null) {
          that.applyWeather(weatherApi.buildManual(manualTemp), months);
          return;
        }
        that.setData({ weatherState: 'error' });
      });
  },

  applyWeather(w, months) {
    const place = w.place || store.getPlace();
    const mi = placeUtil.mountainInfo(place);

    const care = clothing.recommend(w, {
      ageMonths: months,
      mountain: mi.mountain,
      mountainOffset: mi.offset
    });

    this.setData({
      weather: {
        label: w.label || placeUtil.placeLabel(place),
        full: w.full || placeUtil.formatPlace(place),
        temp: Math.round(typeof w.temp === 'number' ? w.temp : 22),
        text: care.weatherText,
        icon: care.icon,
        max: typeof w.tempMax === 'number' ? Math.round(w.tempMax) : '',
        min: typeof w.tempMin === 'number' ? Math.round(w.tempMin) : ''
      },
      care: care,
      weatherState: 'ok',
      manualTemp: !!w.manual
    });
  },

  retryWeather() {
    this.loadWeather(this.data.ageMonths, true);
  },

  /* ---------- 记一笔 ---------- */

  goMealLog() {
    wx.navigateTo({ url: '/pages/meal-log/meal-log' });
  },

  goFoodEdit() {
    wx.navigateTo({ url: '/pages/food-edit/food-edit' });
  },

  goVaccineEdit() {
    wx.navigateTo({ url: '/pages/vaccine-edit/vaccine-edit' });
  },

  goFood() {
    wx.navigateTo({ url: '/pages/food/food' });
  },

  goRecord() {
    wx.switchTab({ url: '/pages/record/record' });
  },

  /** 一键记：按当前餐次推荐的食谱，直接进预填好的记一餐 */
  quickMeal() {
    const s = this.data.suggest;
    if (!s) {
      this.goMealLog();
      return;
    }
    wx.navigateTo({
      url:
        '/pages/meal-log/meal-log?date=' + s.date + '&slot=' + s.slot + (s.recipeId ? '&recipeId=' + s.recipeId : '')
    });
  },

  openRecord(e) {
    const d = e.currentTarget.dataset;
    if (d.kind === 'meal') wx.navigateTo({ url: '/pages/meal-log/meal-log?id=' + d.rid });
    else if (d.kind === 'food') wx.navigateTo({ url: '/pages/food-edit/food-edit?id=' + d.rid });
    else if (d.kind === 'vax') wx.navigateTo({ url: '/pages/vaccine-edit/vaccine-edit?id=' + d.rid });
  },

  goGuide(e) {
    const tab = (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.tab) || 'eat';
    wx.navigateTo({
      url: '/pages/guide/guide?month=' + this.data.ageMonths + '&tab=' + tab
    });
  },

  goWeather() {
    wx.navigateTo({ url: '/pages/weather/weather' });
  },

  goManualTemp() {
    wx.navigateTo({ url: '/pages/weather/weather?manual=1' });
  },

  goVaccine() {
    wx.switchTab({ url: '/pages/vaccine/vaccine' });
  },

  goBabies() {
    wx.navigateTo({ url: '/pages/baby-edit/baby-edit?mode=list' });
  },

  goEditBaby() {
    const baby = this.data.baby;
    if (!baby) return;
    wx.navigateTo({ url: '/pages/baby-edit/baby-edit?id=' + baby.id });
  },

  goAddBaby() {
    wx.navigateTo({ url: '/pages/baby-edit/baby-edit' });
  },

  goShare() {
    if (!this.data.baby) {
      wx.navigateTo({ url: '/pages/baby-edit/baby-edit' });
      return;
    }
    wx.navigateTo({ url: '/pages/share/share' });
  },

  goFamily() {
    wx.navigateTo({ url: '/pages/family/family' });
  },

  goPlace() {
    wx.navigateTo({ url: '/pages/place/place' });
  },

  onShareAppMessage() {
    const baby = this.data.baby;
    return {
      title: baby ? baby.name + '的今日照护建议' : '小芽日常 · 婴幼儿照护助手',
      path: '/pages/index/index'
    };
  },

  onShareTimeline() {
    return {
      title: '小芽日常 · 按月龄的宝宝照护建议'
    };
  }
}));
