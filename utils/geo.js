// utils/geo.js —— 小区（POI）检索与地图选点
// 三条获取小区的路径，按可用性依次降级：
//   1. 云函数 place（腾讯位置服务 POI 检索，需要配置 key）→ 精确到小区
//   2. wx.choosePoi（微信内置 POI 搜索器）→ 精确到小区
//   3. wx.chooseLocation（微信内置地图选点）→ 精确到坐标
//   4. 手动填写小区名 + 区中心坐标（永远可用）

const cloud = require('./cloud.js');
const placeUtil = require('./place.js');

/** 区县名匹配：'北京市朝阳区望京街道…' → '朝阳区' */
function parseDistrict(address) {
  const text = String(address || '');
  const list = placeUtil.DISTRICTS;
  for (let i = 0; i < list.length; i++) {
    if (text.indexOf(list[i].name) > -1) return list[i].name;
  }
  return '';
}

/**
 * 搜索小区 / POI
 * @param {String} keyword 关键词，如「望京西园」
 * @param {String} district 限定区县，如「朝阳区」
 * @returns Promise<Array<{name,address,district,lat,lon}>>
 */
function searchCommunity(keyword, district) {
  const kw = String(keyword || '').trim();
  if (!kw) return Promise.reject(new Error('EMPTY_KEYWORD'));

  return cloud
    .call('place', {
      action: 'search',
      keyword: kw,
      region: district ? '北京' + district : '北京'
    })
    .then(function (res) {
      if (!res || !res.ok) {
        const err = new Error((res && res.error) || 'SEARCH_FAIL');
        err.code = res && res.error;
        throw err;
      }
      return (res.list || [])
        .map(function (item) {
          return {
            name: item.title || item.name || '',
            address: item.address || '',
            district: item.district || parseDistrict(item.address),
            lat: Number(item.lat),
            lon: Number(item.lon)
          };
        })
        .filter(function (x) {
          return x.name && !isNaN(x.lat) && !isNaN(x.lon);
        });
    });
}

/** 微信内置 POI 搜索器（需要「位置接口」权限） */
function choosePoi() {
  return new Promise(function (resolve, reject) {
    if (!wx.choosePoi) {
      reject(new Error('UNSUPPORTED'));
      return;
    }
    wx.choosePoi({
      success: function (res) {
        resolve({
          name: res.name || '',
          address: res.address || '',
          district: parseDistrict(res.address),
          lat: res.latitude,
          lon: res.longitude,
          source: 'map'
        });
      },
      fail: reject
    });
  });
}

/** 微信内置地图选点（需要「位置接口」权限） */
function chooseLocation() {
  return new Promise(function (resolve, reject) {
    if (!wx.chooseLocation) {
      reject(new Error('UNSUPPORTED'));
      return;
    }
    wx.chooseLocation({
      success: function (res) {
        resolve({
          name: res.name || '',
          address: res.address || '',
          district: parseDistrict(res.address),
          lat: res.latitude,
          lon: res.longitude,
          source: 'map'
        });
      },
      fail: reject
    });
  });
}

/** 坐标反查地址（需要地图 Key），用于「用当前位置」自动补全区县与小区名 */
function reverseGeocode(lat, lon) {
  return cloud.call('place', { action: 'geocode', lat: lat, lon: lon }).then(function (res) {
    if (!res || !res.ok) {
      const err = new Error((res && res.error) || 'GEOCODE_FAIL');
      err.code = res && res.error;
      throw err;
    }
    return res.data || {};
  });
}

module.exports = {
  parseDistrict: parseDistrict,
  searchCommunity: searchCommunity,
  choosePoi: choosePoi,
  chooseLocation: chooseLocation,
  reverseGeocode: reverseGeocode
};
