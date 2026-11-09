// pages/index/index.js
const dateUtil = require('../../utils/date.js');
const guideUtil = require('../../utils/guide.js');
const clothing = require('../../utils/clothing.js');
const store = require('../../utils/store.js');
const weatherApi = require('../../utils/weather.js');
const placeUtil = require('../../utils/place.js');
const vaccine = require('../../utils/vaccine.js');

Page({
  data: {
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
    vax: null
  },

  onShow() {
    this.refresh();
  },

  onPullDownRefresh() {
    this.refresh(true);
    setTimeout(function () {
      wx.stopPullDownRefresh();
    }, 800);
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
      patch.weatherState = 'no-baby';
      this.setData(patch);
      return;
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

    this.setData(patch);
    this.loadWeather(months, force);
  },

  loadWeather(months, force) {
    const place = store.getPlace();
    if (!placeUtil.hasCoords(place)) {
      this.setData({ weatherState: 'no-place', weather: null, care: null });
      return;
    }

    this.setData({ weatherState: 'loading' });
    const that = this;

    weatherApi
      .getWeather({ force: !!force })
      .then(function (w) {
        that.applyWeather(w, months);
      })
      .catch(function (err) {
        console.warn('[index] 天气获取失败：', err && err.message);
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
      weatherState: 'ok'
    });
  },

  retryWeather() {
    this.loadWeather(this.data.ageMonths, true);
  },

  goGuide(e) {
    const tab = (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.tab) || 'eat';
    wx.navigateTo({
      url: '/pages/guide/guide?month=' + this.data.ageMonths + '&tab=' + tab
    });
  },

  goWeather() {
    wx.switchTab({ url: '/pages/weather/weather' });
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
    wx.switchTab({ url: '/pages/family/family' });
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
});
