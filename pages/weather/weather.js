// pages/weather/weather.js
const dateUtil = require('../../utils/date.js');
const clothing = require('../../utils/clothing.js');
const store = require('../../utils/store.js');
const weatherApi = require('../../utils/weather.js');
const placeUtil = require('../../utils/place.js');

Page({
  data: {
    state: 'idle', // idle | loading | ok | error | no-place
    place: null,
    placeLabel: '',
    placeFull: '',
    weather: null,
    care: null,
    alerts: [],
    updatedText: '',
    ageMonths: 12,
    babyName: '',
    stale: false,
    roomEstimate: 0,
    roomEdited: false,
    manual: false, // 当前结果来自手动温度
    quickTemps: weatherApi.QUICK_TEMPS,
    manualInput: '',
    showManual: false
  },

  /** ?manual=1：从首页「填温度」进来，直接弹出手动温度 */
  onLoad(options) {
    this._openManual = !!(options && options.manual);
  },

  onShow() {
    this.init();
    if (this._openManual) {
      this._openManual = false;
      this.openManual();
    }
  },

  onPullDownRefresh() {
    // 真刷新：数据回来（成功或失败）再收起下拉
    this.load(true).then(function () {
      wx.stopPullDownRefresh();
    });
  },

  init() {
    const baby = store.getActiveBaby();
    const age = baby ? dateUtil.calcAge(baby.birthday) : null;
    const place = store.getPlace();

    this.setData({
      ageMonths: age && age.valid ? age.months : 12,
      babyName: baby ? baby.name : '',
      place: place,
      placeLabel: place ? placeUtil.placeLabel(place) : '',
      placeFull: place ? placeUtil.formatPlace(place) : ''
    });

    this.load(false);
  },

  /**
   * 取天气。优先级：手动温度（今天填过）→ 实时天气 → 失败给出手动入口
   * 没设地点也不再卡死：可以直接按温度出建议
   */
  load(force) {
    const that = this;
    const manualTemp = store.getManualTemp();

    if (manualTemp !== null && !force) {
      that.apply(weatherApi.buildManual(manualTemp));
      return Promise.resolve();
    }

    if (!placeUtil.hasCoords(store.getPlace())) {
      if (manualTemp !== null) {
        that.apply(weatherApi.buildManual(manualTemp));
      } else {
        that.setData({ state: 'no-place' });
      }
      return Promise.resolve();
    }

    that.setData({ state: 'loading' });

    return weatherApi
      .getWeather({ force: !!force })
      .then(function (w) {
        // 实时天气拿到了，手动温度就没必要留着
        if (manualTemp !== null) store.clearManualTemp();
        that.apply(w);
      })
      .catch(function (err) {
        console.warn('[weather] 获取失败：', err && err.message);
        if (manualTemp !== null) {
          that.apply(weatherApi.buildManual(manualTemp));
          return;
        }
        const noPlace = err && err.message === 'NO_LOCATION';
        that.setData({ state: noPlace ? 'no-place' : 'error' });
      });
  },

  /* ---------- 手动温度 ---------- */

  openManual() {
    this.setData({ showManual: true, manualInput: '' });
  },

  closeManual() {
    this.setData({ showManual: false });
  },

  onManualInput(e) {
    this.setData({ manualInput: e.detail.value });
  },

  pickQuick(e) {
    this.useManual(Number(e.currentTarget.dataset.temp));
  },

  submitManual() {
    const raw = String(this.data.manualInput || '').trim();
    const t = Number(raw);
    if (raw === '' || !isFinite(t)) {
      wx.showToast({ title: '填一个数字，比如 12', icon: 'none' });
      return;
    }
    if (t < -30 || t > 45) {
      wx.showToast({ title: '温度要在 -30 ~ 45℃ 之间', icon: 'none' });
      return;
    }
    this.useManual(t);
  },

  useManual(t) {
    store.setManualTemp(t);
    this.setData({ showManual: false });
    this.apply(weatherApi.buildManual(t));
  },

  clearManual() {
    store.clearManualTemp();
    this.load(true);
  },

  apply(w) {
    const place = w.place || this.data.place;
    const mi = placeUtil.mountainInfo(place);

    const care = clothing.recommend(w, {
      ageMonths: this.data.ageMonths,
      mountain: mi.mountain,
      mountainOffset: mi.offset
    });

    const round = function (v) {
      return typeof v === 'number' && !isNaN(v) ? Math.round(v) : '--';
    };

    let updatedText = '';
    if (w.updatedAt) {
      const d = new Date(w.updatedAt);
      updatedText = d.getHours() + ':' + dateUtil.pad(d.getMinutes());
    }

    const view = {
      icon: care.icon,
      text: care.weatherText,
      temp: round(w.temp),
      feels: round(w.feelsLike),
      max: round(w.tempMax),
      min: round(w.tempMin),
      wind: round(w.wind),
      humidity: round(w.humidity),
      uv: round(w.uv),
      precipProb: round(w.precipProb)
    };

    this.setData({
      weather: view,
      care: care,
      roomEstimate: care.sleep.indoor,
      roomEdited: false,
      alerts: (care.alerts || []).map(function (t, i) {
        return { k: 'a' + i, t: t };
      }),
      state: 'ok',
      place: place,
      placeLabel: w.label || placeUtil.placeLabel(place),
      placeFull: w.full || placeUtil.formatPlace(place),
      updatedText: updatedText,
      stale: !!w.stale,
      manual: !!w.manual
    });
  },

  /** 室温加减：家里有温度计就以实测为准，睡袋表跟着重算高亮行 */
  adjustRoom(e) {
    const care = this.data.care;
    if (!care || !care.sleep) return;

    const delta = Number(e.currentTarget.dataset.d) || 0;
    const next = Math.max(10, Math.min(33, care.sleep.indoor + delta));
    if (next === care.sleep.indoor) return;

    const stage = clothing.getStage(this.data.ageMonths);
    const sleep = clothing.buildSleep(next, stage);

    this.setData({
      'care.sleep': sleep,
      roomEdited: sleep.indoor !== this.data.roomEstimate
    });
  },

  resetRoom() {
    const care = this.data.care;
    if (!care || !care.sleep) return;

    const stage = clothing.getStage(this.data.ageMonths);
    const sleep = clothing.buildSleep(this.data.roomEstimate, stage);

    this.setData({ 'care.sleep': sleep, roomEdited: false });
  },

  refresh() {
    if (!placeUtil.hasCoords(store.getPlace())) {
      this.openManual();
      return;
    }
    this.load(true);
  },

  goPlace() {
    wx.navigateTo({ url: '/pages/place/place' });
  },

  goShare() {
    wx.navigateTo({ url: '/pages/share/share' });
  },

  onShareAppMessage() {
    return {
      title: '今天给宝宝穿什么？看这张表就够了',
      path: '/pages/weather/weather'
    };
  },

  onShareTimeline() {
    return { title: '宝宝穿几层、睡袋多厚，按温度对照 · 小芽日常' };
  }
});
