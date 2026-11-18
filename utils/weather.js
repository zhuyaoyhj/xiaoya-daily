// utils/weather.js —— 天气获取（云函数优先 → 直连降级 → 本地缓存兜底）
// 数据源：Open-Meteo（免密钥、免注册），云函数只做代理，避开小程序域名白名单限制
// 精度：按「地点坐标」取数。地点可以是北京市的某个区，也可以精确到具体小区。

const cloud = require('./cloud.js');
const store = require('./store.js');
const placeUtil = require('./place.js');

const CACHE_TTL = 30 * 60 * 1000;
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const CURRENT_FIELDS =
  'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation';
const DAILY_FIELDS =
  'temperature_2m_max,temperature_2m_min,uv_index_max,precipitation_probability_max';

function num(v) {
  const n = Number(v);
  return isNaN(n) ? undefined : n;
}

function firstNum(arr) {
  if (!Array.isArray(arr) || !arr.length) return undefined;
  return num(arr[0]);
}

function parseOpenMeteo(json) {
  const cur = (json && json.current) || {};
  const daily = (json && json.daily) || {};
  return {
    temp: num(cur.temperature_2m),
    feelsLike: num(cur.apparent_temperature),
    humidity: num(cur.relative_humidity_2m),
    code: num(cur.weather_code),
    wind: num(cur.wind_speed_10m),
    precip: num(cur.precipitation),
    tempMax: firstNum(daily.temperature_2m_max),
    tempMin: firstNum(daily.temperature_2m_min),
    uv: firstNum(daily.uv_index_max),
    precipProb: firstNum(daily.precipitation_probability_max),
    updatedAt: Date.now()
  };
}

function requestJson(url) {
  return new Promise(function (resolve, reject) {
    wx.request({
      url: url,
      method: 'GET',
      timeout: 8000,
      header: { 'content-type': 'application/json' },
      success: function (res) {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.data);
        else reject(new Error('HTTP_' + res.statusCode));
      },
      fail: function (err) {
        reject(err || new Error('REQUEST_FAIL'));
      }
    });
  });
}

function buildForecastUrl(lat, lon) {
  return (
    FORECAST_URL +
    '?latitude=' +
    lat +
    '&longitude=' +
    lon +
    '&current=' +
    CURRENT_FIELDS +
    '&daily=' +
    DAILY_FIELDS +
    '&timezone=Asia%2FShanghai&forecast_days=1'
  );
}

/* ---------------- 取数 ---------------- */

function fetchByCloud(loc) {
  return cloud
    .call('weather', { action: 'forecast', lat: loc.lat, lon: loc.lon, city: loc.name })
    .then(function (res) {
      if (!res || !res.ok) throw new Error((res && res.error) || 'CLOUD_BAD_RESULT');
      return Object.assign({ ok: true, source: 'cloud' }, res.data || {});
    });
}

function fetchByDirect(loc) {
  return requestJson(buildForecastUrl(loc.lat, loc.lon)).then(function (json) {
    const data = parseOpenMeteo(json);
    return Object.assign({ ok: true, source: 'direct' }, data);
  });
}

/** 从本地地点读取坐标；没有地点就抛 NO_LOCATION，由页面引导去设置 */
function ensurePlace() {
  const p = store.getPlace();
  if (placeUtil.hasCoords(p)) return Promise.resolve(placeUtil.normalize(p));
  return Promise.reject(new Error('NO_LOCATION'));
}

function readCache(key) {
  const cache = store.getWeatherCache();
  if (!cache || cache.key !== key) return null;
  if (Date.now() - (cache.ts || 0) > CACHE_TTL) return null;
  return cache.data;
}

/**
 * @param {Object} opts { force }
 * @returns Promise<{ ok, source, temp, feelsLike, code, ..., place, label, full }>
 */
function getWeather(opts) {
  const o = opts || {};

  return ensurePlace().then(function (place) {
    // 坐标保留 3 位小数（约 100 米），足够区分不同小区
    const key = Number(place.lat).toFixed(3) + ',' + Number(place.lon).toFixed(3);
    const label = placeUtil.placeLabel(place);
    const full = placeUtil.formatPlace(place);

    if (!o.force) {
      const hit = readCache(key);
      if (hit) {
        return Object.assign({}, hit, { cached: true, place: place, label: label, full: full });
      }
    }

    const loc = { lat: Number(place.lat), lon: Number(place.lon), name: label };

    return fetchByCloud(loc)
      .catch(function (err) {
        console.warn('[weather] 云函数不可用，尝试直连：', err && err.message);
        return fetchByDirect(loc);
      })
      .then(function (data) {
        const payload = Object.assign({}, data, { place: place, label: label, full: full });
        store.setWeatherCache({ key: key, ts: Date.now(), data: payload });
        return payload;
      })
      .catch(function (err) {
        const stale = readCache(key);
        if (stale) {
          return Object.assign({}, stale, {
            cached: true,
            stale: true,
            place: place,
            label: label,
            full: full
          });
        }
        throw err;
      });
  });
}

/**
 * 手动温度兜底：天气取不到时，用用户自己填的温度构造一份「天气」，穿衣算法照常工作。
 * 只有温度，没有风/湿度/紫外线，相关提醒自然不会出现。
 */
function buildManual(temp, place) {
  const t = Number(temp);
  const p = place || store.getPlace();
  const hasPlace = placeUtil.hasCoords(p);
  return {
    ok: true,
    source: 'manual',
    manual: true,
    temp: t,
    feelsLike: t,
    code: undefined,
    updatedAt: Date.now(),
    place: hasPlace ? p : null,
    label: hasPlace ? placeUtil.placeLabel(p) : '按你填的温度',
    full: hasPlace ? placeUtil.formatPlace(p) : '按你填的温度估算'
  };
}

/** 温度快捷档：用户不知道具体几度时，按体感选一档 */
const QUICK_TEMPS = [
  { key: 'cold', label: '很冷', hint: '0℃以下', temp: -3 },
  { key: 'cool', label: '偏凉', hint: '约 8℃', temp: 8 },
  { key: 'mild', label: '舒适', hint: '约 18℃', temp: 18 },
  { key: 'warm', label: '偏热', hint: '约 26℃', temp: 26 },
  { key: 'hot', label: '很热', hint: '32℃以上', temp: 33 }
];

/** 可选：使用当前位置取坐标（需在后台申请「位置接口」权限） */
function getLocation() {
  return new Promise(function (resolve, reject) {
    wx.getLocation({
      type: 'wgs84',
      success: resolve,
      fail: reject
    });
  });
}

module.exports = {
  getWeather: getWeather,
  ensurePlace: ensurePlace,
  getLocation: getLocation,
  parseOpenMeteo: parseOpenMeteo,
  buildManual: buildManual,
  QUICK_TEMPS: QUICK_TEMPS
};
