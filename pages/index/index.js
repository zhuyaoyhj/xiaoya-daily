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
const timeline = require('../../utils/timeline.js');
const sync = require('../../utils/sync.js');
const track = require('../../utils/track.js').track;

/**
 * 首次引导：添加宝宝后在首页走两步 ——「记第一笔」→「设一下地点（可跳过）」
 * 每步做到了自动消失；整体点「知道了」也就不再出现
 */
function onboardStep(baby) {
  const s = store.getSettings();
  if (s.onboarded) return null;
  const hasCare = store.getCareIndex().length > 0 || store.getMealLogs(baby.id).length > 0;
  if (!hasCare) {
    return { step: 'first', text: '点下面的「喂奶 / 睡觉 / 换尿布」，记下第一笔', sub: '计时只存开始时间，锁屏、切走都不会丢' };
  }
  if (!placeUtil.hasCoords(store.getPlace()) && store.getManualTemp() === null) {
    return { step: 'place', text: '设一下宝宝在哪，穿衣建议会跟着当地天气走', sub: '不想设也行，直接填今天几度', action: '去设置' };
  }
  store.updateSettings({ onboarded: true });
  return null;
}

/** 订阅消息模板 ID 配好了没（app.js globalData.tmplIds） */
function hasTemplates() {
  const app = typeof getApp === 'function' ? getApp() : null;
  return !!(app && app.globalData && app.globalData.tmplIds && app.globalData.tmplIds.length);
}

/**
 * 首页宫格按月龄换内容：喂奶/睡/尿布已在照护卡里，「记一餐」由一键记餐条承担，这里不再重复
 *   <5 月：记接种 / 穿衣 / 月龄建议
 *   5 月：+ 辅食准备（看看什么时候能加）
 *   ≥6 月：试新食材 / 辅食本 / 记接种 / 穿衣
 */
function quickItems(months) {
  if (months >= 6) {
    return [
      { key: 'foodEdit', emoji: '🥕', text: '试新食材' },
      { key: 'food', emoji: '📒', text: '辅食本' },
      { key: 'vaxEdit', emoji: '💉', text: '记接种' },
      { key: 'weather', emoji: '🧥', text: '穿衣' }
    ];
  }
  const list = [
    { key: 'vaxEdit', emoji: '💉', text: '记接种' },
    { key: 'weather', emoji: '🧥', text: '穿衣' },
    { key: 'guide', emoji: '🌱', text: '月龄建议' }
  ];
  if (months >= 5) list.push({ key: 'food', emoji: '🥄', text: '辅食准备' });
  return list;
}

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
    quickItems: [],
    vaxRemind: null,
    backupRemind: null,
    onboard: null,
    tmplConfigured: false,
    manualTemp: false
  }),

  onShow() {
    this.refresh();
    this.startCareTick();
    const that = this;
    sync.autoSync().then(function (r) {
      if (r && (r.added || r.updated || r.removed)) that.refresh();
    });
  },

  /* ---------- 提醒条 ---------- */

  goBackupNow() {
    track('remind_tap', { kind: 'backup' });
    wx.switchTab({ url: '/pages/mine/mine' });
  },

  dismissBackup() {
    store.dismissBackupReminder();
    this.setData({ backupRemind: null });
  },

  onboardAction() {
    const o = this.data.onboard;
    if (!o) return;
    track('onboard_step', { step: o.step });
    if (o.step === 'place') wx.navigateTo({ url: '/pages/place/place' });
  },

  onboardSkip() {
    const o = this.data.onboard;
    if (o && o.step === 'place') {
      store.updateSettings({ onboarded: true });
      this.setData({ onboard: null });
      this.goManualTemp();
      return;
    }
    store.updateSettings({ onboarded: true });
    this.setData({ onboard: null });
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
    const age = dateUtil.babyAge(baby);
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
      targetNames: targetNames,
      tmplConfigured: hasTemplates()
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
      patch.quickItems = [];
      patch.vaxRemind = null;
      patch.backupRemind = null;
      patch.onboard = null;
      patch.weatherState = 'no-baby';
      this.setData(patch);
      return Promise.resolve();
    }

    const age = dateUtil.babyAge(baby);
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
      ageText: dateUtil.babyAgeText(age) || '月龄未知',
      metaText: meta.join(' · ')
    };
    patch.ageMonths = months;
    patch.ageLabel = guideUtil.getSegmentLabel(months);
    patch.tips = guideUtil.getTips(months);

    // 疫苗卡片：正在观察期就给护理提示，否则提醒该打什么
    // 疫苗按实际月龄（免疫规划不做早产矫正）
    const vaxMonths = age.actual && age.actual.valid ? age.actual.months : months;
    const vaxBrief = vaccine.brief(store.getVaccineRecords(baby.id), vaxMonths);
    patch.vax = {
      tone: vaxBrief.tone,
      emoji: vaxBrief.type === 'care' ? '🩹' : vaxBrief.type === 'due' ? '💉' : '🗓',
      title: vaxBrief.title,
      desc: vaxBrief.desc
    };

    // 最近记的：和「记录」页同一条时间线，喂睡尿 / 辅食 / 接种 / 测量都在
    // 首页只留 2 条，更多去「记录」tab
    patch.recent = timeline.recent(baby.id, 2);
    patch.backupRemind = store.backupReminder();
    patch.onboard = onboardStep(baby);
    patch.quickItems = quickItems(months);
    Object.assign(patch, careState(baby, months));
    // 7 天内到期 / 已过建议日期的那一针，单独顶到照护卡下面
    try {
      const r = vaccine.dueReminder(baby.birthday, store.getVaccineRecords(baby.id));
      patch.vaxRemind = r
        ? { text: r.text, overdue: r.overdue, vaccineId: r.vaccineId, dose: r.dose, more: r.more }
        : null;
    } catch (e) {
      patch.vaxRemind = null;
    }
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

  /** 宫格统一入口 */
  onQuick(e) {
    const k = e.currentTarget.dataset.key;
    if (k === 'foodEdit') this.goFoodEdit();
    else if (k === 'food') this.goFood();
    else if (k === 'vaxEdit') this.goVaccineEdit();
    else if (k === 'weather') this.goWeather();
    else if (k === 'guide') this.goGuide();
  },

  /** 到期提醒 → 直接进预选好疫苗和剂次的记接种 */
  goVaxRemind() {
    track('remind_tap', { kind: 'vax' });
    const r = this.data.vaxRemind;
    if (!r) return this.goVaccine();
    wx.navigateTo({
      url: '/pages/vaccine-edit/vaccine-edit?vaccineId=' + r.vaccineId + '&dose=' + r.dose + '&from=remind'
    });
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
    const url = e.currentTarget.dataset.open;
    if (url) wx.navigateTo({ url: url });
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

  /** 推送行：选过推送对象就去做卡片，还没选就先去选人 */
  goPush() {
    if (this.data.targetNames) this.goShare();
    else this.goFamily();
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
