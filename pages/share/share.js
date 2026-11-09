// pages/share/share.js
const dateUtil = require('../../utils/date.js');
const guideUtil = require('../../utils/guide.js');
const clothing = require('../../utils/clothing.js');
const store = require('../../utils/store.js');
const weatherApi = require('../../utils/weather.js');
const placeUtil = require('../../utils/place.js');
const card = require('../../utils/card.js');

function buildShareText(o) {
  const lines = [];
  lines.push('【小芽日常】' + o.babyName + ' 的今日照护');
  lines.push(o.dateText + ' · ' + o.ageText);
  lines.push('');

  (o.tips || []).forEach(function (t) {
    lines.push(t.emoji + ' ' + t.title + '｜' + t.heading);
    lines.push('　' + t.text);
  });

  if (o.weather) {
    lines.push('');
    lines.push('🌡 天气：' + (o.weather.full || o.weather.city) + ' ' + o.weather.temp + '° ' + o.weather.text);
  }
  if (o.clothing) {
    lines.push('👕 穿衣：' + o.clothing.headline);
    if (o.clothing.sleep) {
      lines.push('🌙 睡袋：' + o.clothing.sleep);
    }
    if (o.clothing.alerts && o.clothing.alerts.length) {
      lines.push('⚠️ ' + o.clothing.alerts[0]);
    }
  }

  lines.push('');
  lines.push('（内容为通用育儿照护参考，不构成医疗建议）');
  return lines.join('\n');
}

Page({
  data: {
    hasBaby: true,
    drawing: true,
    cardPath: '',
    targets: [],
    targetLine: '',
    shareText: '',
    cardData: null,
    weatherNote: ''
  },

  onLoad(options) {
    const m = options && options.month ? Number(options.month) : null;
    this.optionMonth = m !== null && !isNaN(m) ? m : null;
    this.ready = false;
    this.prepare();
  },

  onReady() {
    this.ready = true;
    this.renderCard();
  },

  prepare() {
    const baby = store.getActiveBaby();
    if (!baby) {
      this.setData({ hasBaby: false, drawing: false });
      return;
    }

    const age = dateUtil.calcAge(baby.birthday);
    const months = this.optionMonth !== null ? this.optionMonth : age.valid ? age.months : 0;
    const tips = guideUtil.getTips(months).map(function (t) {
      return { emoji: t.emoji, title: t.title, heading: t.heading, text: t.summary };
    });

    this.months = months;
    this.babyName = baby.name || '宝宝';

    const targets = this.buildTargets();
    const cardData = {
      babyName: this.babyName,
      ageText: dateUtil.ageText(age) || months + ' 个月',
      dateText: dateUtil.formatCN(),
      tips: tips,
      weather: null,
      clothing: null,
      targetLine: targets.line
    };

    this.setData(
      {
        hasBaby: true,
        targets: targets.list,
        targetLine: targets.line,
        cardData: cardData,
        shareText: buildShareText({
          babyName: cardData.babyName,
          dateText: cardData.dateText,
          ageText: cardData.ageText,
          tips: tips
        })
      },
      () => {
        this.renderCard();
        this.loadWeather();
      }
    );
  },

  buildTargets() {
    const ids = store.getSettings().pushTargets || [];
    const list = store.getFamily().map(function (m) {
      return {
        id: m.id,
        name: m.name,
        relation: m.relation,
        checked: ids.indexOf(m.id) > -1
      };
    });
    const names = list
      .filter(function (m) {
        return m.checked;
      })
      .map(function (m) {
        return m.relation || m.name;
      });
    return {
      list: list,
      line: names.length ? '给 ' + names.join('、') + ' 看看' : ''
    };
  },

  loadWeather() {
    const that = this;
    weatherApi
      .getWeather({})
      .then(function (w) {
        const place = w.place || store.getPlace();
        const mi = placeUtil.mountainInfo(place);
        const care = clothing.recommend(w, {
          ageMonths: that.months,
          mountain: mi.mountain,
          mountainOffset: mi.offset
        });

        // 卡片上一行放不下全地址，用「区·小区」的紧凑写法
        const compact =
          [place && place.district, place && place.community].filter(Boolean).join('·') ||
          placeUtil.placeLabel(place) ||
          '当前位置';

        const cardData = Object.assign({}, that.data.cardData, {
          weather: {
            city: compact,
            full: placeUtil.formatPlace(place),
            temp: Math.round(typeof w.temp === 'number' ? w.temp : 22),
            text: care.weatherText,
            icon: care.icon
          },
          clothing: {
            headline: care.headline,
            level: care.level,
            alerts: care.alerts,
            sleep: '睡袋 ' + care.sleep.tog + ' · 室温约 ' + care.sleep.indoor + '℃'
          }
        });

        that.setData(
          {
            cardData: cardData,
            shareText: buildShareText({
              babyName: cardData.babyName,
              dateText: cardData.dateText,
              ageText: cardData.ageText,
              tips: cardData.tips,
              weather: cardData.weather,
              clothing: cardData.clothing
            }),
            weatherNote: ''
          },
          function () {
            that.renderCard();
          }
        );
      })
      .catch(function (err) {
        console.warn('[share] 天气不可用，卡片不含穿衣段：', err && err.message);
        that.setData({ weatherNote: '还没设置地点（北京市 → 区 → 小区），卡片里暂时不显示穿衣建议' });
      });
  },

  renderCard() {
    const that = this;
    if (!this.data.cardData) return;
    if (!this.ready) return; // 等 onReady 后再画，避免拿不到 canvas 节点
    this.setData({ drawing: true });

    wx.createSelectorQuery()
      .select('#card')
      .fields({ node: true, size: true })
      .exec(function (res) {
        if (!res || !res[0] || !res[0].node) {
          console.warn('[share] canvas 节点未就绪');
          that.setData({ drawing: false });
          return;
        }
        const canvas = res[0].node;

        card
          .render(canvas, that.data.cardData)
          .then(function (size) {
            // 少数机型绘制后立刻导出会拿到空白图，留一帧再导
            setTimeout(function () {
              wx.canvasToTempFilePath(
                {
                  canvas: canvas,
                  x: 0,
                  y: 0,
                  width: size.width,
                  height: size.height,
                  destWidth: size.width,
                  destHeight: size.height,
                  success: function (r) {
                    that.setData({ cardPath: r.tempFilePath, drawing: false });
                  },
                  fail: function (err) {
                    console.warn('[share] 导出图片失败', err);
                    that.setData({ drawing: false });
                  }
                },
                that
              );
            }, 60);
          })
          .catch(function (err) {
            console.warn('[share] 绘制失败', err);
            that.setData({ drawing: false });
          });
      });
  },

  toggleTarget(e) {
    const id = e.currentTarget.dataset.id;
    store.togglePushTarget(id);
    const targets = this.buildTargets();
    this.setData({ targets: targets.list, targetLine: targets.line }, () => {
      this.setData({ 'cardData.targetLine': targets.line }, () => {
        this.renderCard();
      });
    });
  },

  saveImage() {
    const path = this.data.cardPath;
    if (!path) {
      wx.showToast({ title: '卡片还在生成', icon: 'none' });
      return;
    }
    wx.saveImageToPhotosAlbum({
      filePath: path,
      success: function () {
        wx.showToast({ title: '已保存到相册', icon: 'success' });
      },
      fail: function (err) {
        const msg = String((err && err.errMsg) || '');
        if (msg.indexOf('auth') > -1 || msg.indexOf('authorize') > -1) {
          wx.showModal({
            title: '需要相册权限',
            content: '保存图片需要授权「保存到相册」，去设置里打开后重试？',
            confirmText: '去设置',
            success: function (r) {
              if (r.confirm) wx.openSetting();
            }
          });
        } else {
          wx.showToast({ title: '保存失败', icon: 'none' });
        }
      }
    });
  },

  copyText() {
    wx.setClipboardData({
      data: this.data.shareText,
      success: function () {
        wx.showToast({ title: '已复制文字版', icon: 'success' });
      }
    });
  },

  goFamily() {
    wx.switchTab({ url: '/pages/family/family' });
  },

  goAddBaby() {
    wx.navigateTo({ url: '/pages/baby-edit/baby-edit' });
  },

  onShareAppMessage() {
    const d = this.data.cardData || {};
    return {
      title: (d.babyName || '宝宝') + ' 的今日照护 · ' + (d.ageText || ''),
      path: '/pages/index/index',
      imageUrl: this.data.cardPath || ''
    };
  }
});
