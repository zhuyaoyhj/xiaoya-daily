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
    roomEdited: false
  },

  onShow() {
    this.init();
  },

  onPullDownRefresh() {
    this.load(true);
    setTimeout(function () {
      wx.stopPullDownRefresh();
    }, 900);
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

    if (placeUtil.hasCoords(place)) {
      this.load(false);
    } else {
      this.setData({ state: 'no-place' });
    }
  },

  load(force) {
    this.setData({ state: 'loading' });
    const that = this;

    weatherApi
      .getWeather({ force: !!force })
      .then(function (w) {
        that.apply(w);
      })
      .catch(function (err) {
        console.warn('[weather] 获取失败：', err && err.message);
        const noPlace = err && err.message === 'NO_LOCATION';
        that.setData({ state: noPlace ? 'no-place' : 'error' });
      });
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
      stale: !!w.stale
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
  }
});
