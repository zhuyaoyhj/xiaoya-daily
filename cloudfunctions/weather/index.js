// cloudfunctions/weather/index.js
// 天气代理云函数：action = forecast | geocode
// 数据源 Open-Meteo（免密钥）。放云函数里调用，可以绕开小程序域名白名单限制。

const cloud = require('wx-server-sdk');
const https = require('https');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const CURRENT = 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation';
const DAILY = 'temperature_2m_max,temperature_2m_min,uv_index_max,precipitation_probability_max';

function getJson(url) {
  return new Promise(function (resolve, reject) {
    const req = https.get(url, { timeout: 8000 }, function (res) {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        reject(new Error('HTTP_' + res.statusCode));
        return;
      }
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', function (chunk) {
        buf += chunk;
      });
      res.on('end', function () {
        try {
          resolve(JSON.parse(buf));
        } catch (e) {
          reject(new Error('BAD_JSON'));
        }
      });
    });
    req.on('timeout', function () {
      req.destroy(new Error('TIMEOUT'));
    });
    req.on('error', reject);
  });
}

function num(v) {
  const n = Number(v);
  return isNaN(n) ? undefined : n;
}

function firstNum(arr) {
  if (!Array.isArray(arr) || !arr.length) return undefined;
  return num(arr[0]);
}

function normalize(json) {
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

exports.main = async function (event) {
  const e = event || {};

  try {
    if (e.action === 'geocode') {
      const kw = String(e.city || '').trim();
      if (!kw) return { ok: false, error: 'EMPTY_CITY' };

      const url =
        'https://geocoding-api.open-meteo.com/v1/search?name=' +
        encodeURIComponent(kw) +
        '&count=5&language=zh&format=json';
      const json = await getJson(url);
      const list = (json.results || []).map(function (c) {
        return {
          name: c.name,
          lat: c.latitude,
          lon: c.longitude,
          admin1: c.admin1,
          country: c.country
        };
      });
      return { ok: true, list: list };
    }

    const lat = Number(e.lat);
    const lon = Number(e.lon);
    if (!isFinite(lat) || !isFinite(lon)) {
      return { ok: false, error: 'NO_LOCATION' };
    }

    const url =
      'https://api.open-meteo.com/v1/forecast?latitude=' +
      lat +
      '&longitude=' +
      lon +
      '&current=' +
      CURRENT +
      '&daily=' +
      DAILY +
      '&timezone=Asia%2FShanghai&forecast_days=1';

    const json = await getJson(url);
    return { ok: true, city: e.city || '', data: normalize(json) };
  } catch (err) {
    console.error('[weather] 失败：', err && err.message);
    return { ok: false, error: (err && err.message) || 'UNKNOWN' };
  }
};
