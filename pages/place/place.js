// pages/place/place.js —— 地点设置：北京市 → 区 → 小区
const store = require('../../utils/store.js');
const placeUtil = require('../../utils/place.js');
const geo = require('../../utils/geo.js');
const weatherApi = require('../../utils/weather.js');

const SOURCE_TEXT = {
  poi: '地图检索',
  map: '地图选点',
  district: '区中心坐标',
  manual: '手动填写'
};

Page({
  data: {
    editing: placeUtil.emptyPlace(),
    preview: '',
    hasCoords: false,
    mountain: false,
    sourceText: '',
    districts: [],
    keyword: '',
    results: [],
    searching: false,
    searchState: 'idle', // idle | loading | ok | empty | nokey | error
    places: [],
    labelInput: '',
    currentId: ''
  },

  onLoad() {
    const place = placeUtil.normalize(store.getPlace() || placeUtil.emptyPlace());
    this.setData({
      districts: placeUtil.DISTRICTS.map(function (d) {
        return { name: d.name, mountain: d.mountain };
      })
    });
    this.applyEditing(place);
    this.setData({ keyword: place.community || '' });
    this.refreshPlaces();
    wx.setNavigationBarTitle({ title: '宝宝在哪' });
  },

  /** 统一入口：改地点就调它，顺带把预览、坐标状态、山区标记一起算好 */
  applyEditing(patch) {
    const editing = Object.assign({}, this.data.editing, patch);
    this.setData({
      editing: editing,
      preview: placeUtil.formatPlace(editing) || '还没选地点',
      hasCoords: placeUtil.hasCoords(editing),
      mountain: placeUtil.isMountainDistrict(editing.district),
      sourceText: SOURCE_TEXT[editing.source] || '未设置'
    });
  },

  refreshPlaces() {
    const activeId = store.getSettings().activePlaceId;
    const list = store.getPlaces().map(function (p) {
      return {
        id: p.id,
        label: p.label || '常用地点',
        full: placeUtil.formatPlace(p),
        active: p.id === activeId
      };
    });
    this.setData({ places: list, currentId: activeId });
  },

  /* ---------- 选到区 ---------- */

  pickDistrict(e) {
    const name = e.currentTarget.dataset.name;
    const d = placeUtil.findDistrict(name);
    if (!d) return;

    this.applyEditing({
      district: name,
      community: '',
      address: '',
      lat: d.lat,
      lon: d.lon,
      source: 'district'
    });
    this.setData({ keyword: '', results: [], searchState: 'idle' });
  },

  /* ---------- 精确到小区 ---------- */

  onKeyword(e) {
    this.setData({ keyword: e.detail.value });
  },

  doSearch() {
    const kw = String(this.data.keyword || '').trim();
    if (!kw) {
      wx.showToast({ title: '先输入小区名，如 望京西园', icon: 'none' });
      return;
    }

    this.setData({ searching: true, searchState: 'loading' });
    const that = this;

    geo
      .searchCommunity(kw, this.data.editing.district)
      .then(function (list) {
        that.setData({
          searching: false,
          results: list.map(function (r, i) {
            return Object.assign({ k: 'r' + i }, r);
          }),
          searchState: list.length ? 'ok' : 'empty'
        });
      })
      .catch(function (err) {
        const noKey = err && err.code === 'NO_KEY';
        that.setData({
          searching: false,
          results: [],
          searchState: noKey ? 'nokey' : 'error'
        });
      });
  },

  pickResult(e) {
    const item = this.data.results[Number(e.currentTarget.dataset.i)];
    if (!item) return;

    this.applyEditing({
      district: item.district || this.data.editing.district,
      community: item.name,
      address: item.address || '',
      lat: item.lat,
      lon: item.lon,
      source: 'poi'
    });
    wx.showToast({ title: '已选：' + item.name, icon: 'none' });
  },

  /** 没有地图 Key 时的兜底：直接用输入的名字，坐标沿用区中心 */
  useTypedName() {
    const kw = String(this.data.keyword || '').trim();
    if (!kw) {
      wx.showToast({ title: '先输入小区名', icon: 'none' });
      return;
    }
    if (!this.data.editing.district) {
      wx.showToast({ title: '先在上一步选一个区', icon: 'none' });
      return;
    }
    this.applyEditing({ community: kw, source: 'manual' });
    wx.showToast({ title: '已按「' + kw + '」记录', icon: 'none' });
  },

  /** 微信内置地图：POI 搜索 → 地图选点，两级降级；用户主动取消则不再打扰 */
  handleMapPick() {
    const that = this;
    const cancelled = function (err) {
      return String((err && err.errMsg) || '').indexOf('cancel') > -1;
    };

    geo
      .choosePoi()
      .then(function (r) {
        that.applyPicked(r);
      })
      .catch(function (err) {
        if (cancelled(err)) return; // 用户自己关掉的，不要再弹第二层

        geo
          .chooseLocation()
          .then(function (r) {
            that.applyPicked(r);
          })
          .catch(function (err2) {
            if (cancelled(err2)) return;
            wx.showModal({
              title: '需要位置权限',
              content:
                '用微信地图选点需要「位置接口」权限（微信后台 → 开发管理 → 接口设置 申请）。也可以直接手填小区名，功能不受影响。',
              showCancel: false,
              confirmText: '知道了'
            });
          });
      });
  },

  applyPicked(r) {
    this.applyEditing({
      district: r.district || this.data.editing.district,
      community: r.name || r.address || '',
      address: r.address || '',
      lat: r.lat,
      lon: r.lon,
      source: 'map'
    });
    wx.showToast({ title: '已定位：' + (r.name || '所选位置'), icon: 'none' });
  },

  useCurrentLocation() {
    const that = this;
    weatherApi
      .getLocation()
      .then(function (res) {
        const lat = res.latitude;
        const lon = res.longitude;
        that.applyEditing({ lat: lat, lon: lon, source: 'map' });

        // 配了地图 Key 就顺手把区县、小区名补齐；没配则只落坐标
        geo
          .reverseGeocode(lat, lon)
          .then(function (info) {
            that.applyEditing({
              district: info.district || that.data.editing.district,
              community: info.name || that.data.editing.community,
              address: info.address || '',
              lat: lat,
              lon: lon,
              source: 'map'
            });
            wx.showToast({ title: '已定位到 ' + (info.name || info.district || '当前位置'), icon: 'none' });
          })
          .catch(function () {
            wx.showToast({ title: '已取到坐标，补全区县和小区名更准', icon: 'none' });
          });
      })
      .catch(function () {
        wx.showToast({ title: '没拿到定位，请手动选', icon: 'none' });
      });
  },

  /* ---------- 常用地点 ---------- */

  onLabelInput(e) {
    this.setData({ labelInput: e.detail.value });
  },

  addFavorite() {
    const editing = this.data.editing;
    if (!editing.district) {
      wx.showToast({ title: '先选一个区', icon: 'none' });
      return;
    }
    const label =
      String(this.data.labelInput || '').trim() ||
      editing.community ||
      editing.district ||
      '常用地点';

    // 没有坐标就用区中心兜底，保证天气能取到数
    const target = Object.assign({}, editing);
    if (!placeUtil.hasCoords(target)) {
      const d = placeUtil.findDistrict(target.district);
      if (d) {
        target.lat = d.lat;
        target.lon = d.lon;
      }
    }

    store.addPlace(label, target);
    this.setData({ labelInput: '' });
    this.refreshPlaces();
    wx.showToast({ title: '已加入常用', icon: 'success' });
  },

  usePlace(e) {
    const id = e.currentTarget.dataset.id;
    const p = store.activatePlace(id);
    if (!p) return;

    this.applyEditing(p);
    this.setData({ keyword: p.community || '' });
    this.refreshPlaces();
    wx.showToast({ title: '已切换到 ' + (p.label || '该地点'), icon: 'none' });
    setTimeout(function () {
      wx.navigateBack();
    }, 320);
  },

  removeFav(e) {
    const that = this;
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除常用地点',
      content: '只删除这个常用地点，不影响宝宝档案。',
      confirmColor: '#E0795A',
      success: function (res) {
        if (!res.confirm) return;
        store.removePlace(id);
        that.refreshPlaces();
      }
    });
  },

  /* ---------- 保存 ---------- */

  save() {
    const editing = Object.assign({}, this.data.editing);
    if (!editing.district) {
      wx.showToast({ title: '先选一个区', icon: 'none' });
      return;
    }
    if (!placeUtil.hasCoords(editing)) {
      const d = placeUtil.findDistrict(editing.district);
      if (d) {
        editing.lat = d.lat;
        editing.lon = d.lon;
      }
    }

    store.savePlace(editing);
    wx.showToast({ title: '已保存', icon: 'success' });
    setTimeout(function () {
      const pages = getCurrentPages();
      if (pages.length > 1) wx.navigateBack();
      else wx.switchTab({ url: '/pages/weather/weather' });
    }, 420);
  }
});
